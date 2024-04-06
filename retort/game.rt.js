// generate a random ID for a conversation
function generateConversationId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

const dbName = 'myDatabase';
const request = window.indexedDB.open(dbName, 1);
let db;

request.onerror = function (event) {
  console.error("Database error: ", event.target.errorCode);
};

request.onsuccess = function (event) {
  console.log("Database opened successfully");
  db = event.target.result;
};

request.onupgradeneeded = function (event) {
  const db = event.target.result;
  const store = db.createObjectStore('conversation', { keyPath: 'id', autoIncrement: true });
  store.createIndex('conversationId', 'conversationId', { unique: false });
};


// get all prompts and responses from the database for a given conversation ID
function getPromptsAndResponsesForConversation(conversationId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['conversation'], 'readonly');
    const store = transaction.objectStore('conversation');
    const index = store.index('conversationId');
    const request = index.getAll(IDBKeyRange.only(conversationId));
    request.onsuccess = function (event) {
      resolve(event.target.result);
    };
    request.onerror = function (event) {
      reject("Error getting prompts and responses for conversation");
    };
  });
}

// Map to store room conversation histories based on coordinates
const roomConversationHistories = {};
let roomEquipment = [];

// Function to save a room's conversation history on a per-coordinate basis
function saveRoomConversationHistory(coordinates, roomHistory, roomEquipment) {
  const coordinatesString = coordinatesToString(coordinates);

  if (!roomConversationHistories[coordinatesString]) {
    roomConversationHistories[coordinatesString] = [];
  }

  // Exclude lines containing specific keywords and meeting specified conditions
  const excludedKeywords = ["Current Game Information:", "Updated Game Information", "Seed:", "Room Description:", "Coordinates:", "Objects in Room:", "Exits:", "XP:", "Score:", "Artifacts Found:", "Quests Achieved:", "HP:", "Inventory:", "PC:", "NPCs:", "Rooms Visited:", "Turns:", "north", "south", "east", "west", "northeast", "southeast", "northwest", "southwest", "down"];

  const filteredSentences = roomHistory.response
    .split(/[.!?]/) // Split into sentences based on . ! or ?
    .map(sentence => sentence.trim()) // Trim whitespace from each sentence
    .filter(sentence => {
      const trimmedLine = sentence.trim();
      if (excludedKeywords.some(keyword => trimmedLine.includes(keyword))) {
        if (/[.?!]$/.test(trimmedLine) && !trimmedLine.includes('"') && trimmedLine.endsWith('?')) {
          // Line ends with a question mark and is not contained within quotation marks
          const hasExcludedKeyword = excludedKeywords.some(keyword => sentence.includes(keyword));
          return !hasExcludedKeyword;
        } else {
          // Line doesn't meet the criteria, remove entire line
          return false; // Return false to filter out this sentence
        }
      }
      return true; // Keep the sentence if no excluded keywords are found
    });

  const filteredRoomHistory = filteredSentences.join(". "); // Join filtered sentences with a period

  const filteredRoomEquipment = roomEquipment.join(", "); // Convert roomEquipment to a string

  roomConversationHistories[coordinatesString].push({
    prompt: prompt,
    response: filteredRoomHistory,
    roomEquipment: filteredRoomEquipment, // Store roomEquipment in the history entry
  });
}


// Function to retrieve the first response in a room's conversation history based on coordinates
function getFirstResponseForRoom(coordinates) {
  const coordinatesString = coordinatesToString(coordinates);

  const roomHistory = roomConversationHistories[coordinatesString];

  if (roomHistory && roomHistory.length > 0) {
    return roomHistory[0];
  }

  return null;
}


// add a prompt, assistant prompt, system prompt, response, and personal narrative to the database
function addPromptAndResponse(prompt, assistantPrompt, systemPrompt, response, personalNarrative, conversationId, gameConsole) {
  const transaction = db.transaction(['conversation'], 'readwrite');
  const store = transaction.objectStore('conversation');

  const newPromptAndResponse = {
    prompt: prompt,
    assistantPrompt: assistantPrompt,
    systemPrompt: systemPrompt,
    response: response,
    personalNarrative: personalNarrative,
    conversationId: conversationId,
    gameConsole: gameConsole, // Add the game console to the object
  };

  store.add(newPromptAndResponse);

  // Extract room equipment from gameConsole
  const roomEquipment = gameConsole.match(/Objects in Room: ([^\n]+)/) ? gameConsole.match(/Objects in Room: ([^\n]+)/)[1].split(", ") : [];

  // Define the conversationHistory here
  const roomHistory = {
    prompt: prompt,
    response: response,
    roomEquipment: roomEquipment,
    prompts: [] // Add an array to store user prompts
  };

  // Push the user prompt into the prompts array
  roomHistory.prompts.push(prompt);

  // Save the conversation history in the room's conversation histories
  saveRoomConversationHistory(currentCoordinates, roomHistory, roomEquipment);

  // If the room's conversation history entry doesn't exist yet, create it
  const coordinatesString = coordinatesToString(currentCoordinates);
  if (!roomConversationHistories[coordinatesString]) {
    roomConversationHistories[coordinatesString] = [];
  }

  // Save the conversation history in the room's conversation histories
  roomConversationHistories[coordinatesString].push(roomHistory);

  // Log all prompts, assistant prompt, system prompt, response, and personal narrative in the console
  getPromptsAndResponsesForConversation(conversationId)
    .then((promptsAndResponses) => {
      console.log("All prompts, assistant prompt, system prompt, response, and personal narrative for conversation " + conversationId + ":", promptsAndResponses);
    })
    .catch((error) => {
      console.error(error);
    });
}


// Initialize the currentCoordinates to the starting point
let currentCoordinates = { x: 0, y: 0, z: 0 };

var turns = 0;

// Map single-letter directions to their full names
const directionMap = {
  'n': 'north',
  's': 'south',
  'e': 'east',
  'w': 'west',
  'nw': 'northwest',
  'sw': 'southwest',
  'ne': 'northeast',
  'se': 'southeast',
  'u': 'up',
  'd': 'down',
};

// Function to find a matching console in the conversation history based on coordinates
function findMatchingConsoleByCoordinates(conversationHistory, coordinates) {
  const regex = new RegExp(`Coordinates: X: ${coordinates.x}, Y: ${coordinates.y}, Z: ${coordinates.z}`);
  const matches = conversationHistory.match(regex);
  return matches ? matches[0] : null;
}


// Keep track of visited room coordinates
const visitedRooms = new Set();

// Data structure to store room connections
const roomConnections = {};

// Set to keep track of connected and unconnected rooms
const connectedRooms = new Set();
const unconnectedRooms = new Set();

// Function to generate unique exits for a room based on its coordinates
function generateUniqueExits(coordinates, updatedGameConsole) {
  // For demonstration purposes, let's assume that the exits are randomly generated.
  // You should replace this with your actual exit generation logic.
  const possibleExits = ["north", "south", "east", "west", "northeast", "southeast", "northwest", "southwest", "up", "down"];
  const numExits = Math.min(Math.floor(Math.random() * 5) + 1, 5); // Random number of exits (1 to 3)
  const exits = new Set();

  // Get the most recent visited room's coordinates from the Set
  const recentCoordinates = Array.from(visitedRooms).pop();

  console.log('recentCoordinates:', recentCoordinates); // Log recentCoordinates every turn

  if (recentCoordinates) {
    // Determine the direction the player moved from the most recent coordinates to the updated coordinates
    const { x: prevX, y: prevY, z: prevZ } = recentCoordinates;
    const { x: currX, y: currY, z: currZ } = coordinates;

    // Determine the direction the player moved from the most recent coordinates to the updated coordinates
    const xDiff = currX - prevX;
    const yDiff = currY - prevY;
    const zDiff = currZ - prevZ;

    // Add the opposite direction of the player's movement to exits
    if (xDiff > 0 && yDiff === 0 && zDiff === 0) exits.add("west");
    else if (xDiff < 0 && yDiff === 0 && zDiff === 0) exits.add("east");

    else if (xDiff === 0 && yDiff > 0 && zDiff === 0) exits.add("south");
    else if (xDiff === 0 && yDiff < 0 && zDiff === 0) exits.add("north");
    // Additional diagonal directions
    else if (xDiff > 0 && yDiff > 0 && zDiff === 0) exits.add("southwest");
    else if (xDiff > 0 && yDiff < 0 && zDiff === 0) exits.add("northwest");
    else if (xDiff < 0 && yDiff > 0 && zDiff === 0) exits.add("southeast");
    else if (xDiff < 0 && yDiff < 0 && zDiff === 0) exits.add("northeast");
    else if (xDiff === 0 && yDiff === 0 && zDiff > 0) exits.add("down");
    else if (xDiff === 0 && yDiff === 0 && zDiff < 0) exits.add("up");

  }

  // Get an array of visited room coordinates
  const visitedRoomCoordinates = Array.from(visitedRooms);

  console.log("Visited Room Coordinates:", visitedRoomCoordinates);

  // Convert visited room coordinates to a Set of strings
  const visitedRoomCoordinatesSet = new Set(visitedRoomCoordinates.map(coord => coordinatesToString(coord)));

  // Get potential exits that haven't been visited
  const potentialExits = possibleExits.filter(exitDirection => {
    const adjacentCoord = generateCoordinates(currentCoordinates, exitDirection);
    const adjacentCoordString = coordinatesToString(adjacentCoord);
    return !visitedRoomCoordinatesSet.has(adjacentCoordString);
  });

  console.log("Potential Exits:", potentialExits);

  // Add at least one random exit to the set
  const initialExitIndex = Math.floor(Math.random() * potentialExits.length);
  const initialExit = potentialExits[initialExitIndex];
  exits.add(initialExit);
  console.log("Exits:", exits)

  // Add random exits to the set
  while (exits.size < numExits && potentialExits.length > 0) {
    const randomExitIndex = Math.floor(Math.random() * potentialExits.length);
    const randomExit = potentialExits[randomExitIndex];

    exits.add(randomExit);
    potentialExits.splice(randomExitIndex, 1); // Remove the used exit from potentialExits
  }

  console.log("Exits:", exits)

  // Check if the roomConnections entry doesn't exist for the current room
  if (!roomConnections[coordinatesToString(currentCoordinates)]) {
    roomConnections[coordinatesToString(currentCoordinates)] = {
      coordinates: currentCoordinates,
      exits: [],
      connectedRooms: [],
      unconnectedRooms: Array.from(getAdjacentCoordinates(currentCoordinates)) // Initialize as an array
    };
  }

  // Determine potentially adjacent coordinates
  const adjacentCoordinates = getAdjacentCoordinates(currentCoordinates);
  // Update the roomConnections data structure
  roomConnections[coordinatesToString(currentCoordinates)].exits = exits;

  exits.forEach(exit => {
    const adjacentCoord = generateCoordinates(currentCoordinates, exit);
    if (!roomConnections[coordinatesToString(adjacentCoord)]) {
      roomConnections[coordinatesToString(adjacentCoord)] = {
        coordinates: adjacentCoord,
        exits: [],
        connectedRooms: [],
        unconnectedRooms: getAdjacentCoordinates(adjacentCoord) // Get all potential adjacent coordinates
      };
    }
    roomConnections[coordinatesToString(currentCoordinates)].connectedRooms.push(adjacentCoord);
    roomConnections[coordinatesToString(adjacentCoord)].connectedRooms.push(currentCoordinates);

    // Remove the adjacent room from the unconnected rooms set
    roomConnections[coordinatesToString(currentCoordinates)].unconnectedRooms = Array.from(roomConnections[coordinatesToString(currentCoordinates)].unconnectedRooms).filter(room =>
      !areObjectsEqual(room, adjacentCoord)
    );
    roomConnections[coordinatesToString(adjacentCoord)].unconnectedRooms = Array.from(roomConnections[coordinatesToString(adjacentCoord)].unconnectedRooms).filter(room =>
      !areObjectsEqual(room, currentCoordinates)
    );
  });

  // Remove the current room from the unconnected rooms set
  roomConnections[coordinatesToString(currentCoordinates)].unconnectedRooms = roomConnections[coordinatesToString(currentCoordinates)].unconnectedRooms.filter(room =>
    !areObjectsEqual(room, currentCoordinates)
  );



  // Update roomConnections based on exits
  exits.forEach(exit => {
    const adjacentCoord = generateCoordinates(currentCoordinates, exit);
    if (adjacentCoordinates.has(adjacentCoord)) {
      if (!roomConnections[adjacentCoord]) {
        roomConnections[adjacentCoord] = {
          coordinates: adjacentCoord,
          connectedRooms: [],
          unconnectedRooms: []
        };
      }
      roomConnections[currentCoordinates].connectedRooms.push(adjacentCoord);
      roomConnections[adjacentCoord].connectedRooms.push(currentCoordinates);

      // Remove adjacentCoord from the unconnectedRooms of currentCoordinates
      roomConnections[currentCoordinates].unconnectedRooms.delete(adjacentCoord);

      // Remove currentCoordinates from the unconnectedRooms of adjacentCoord
      roomConnections[adjacentCoord].unconnectedRooms.delete(currentCoordinates);
    }
  });

  // Get the connected and unconnected rooms of the current coordinates
  const connectedRoomsOfCurrent = roomConnections[coordinatesToString(coordinates)].connectedRooms;
  const unconnectedRoomsOfCurrent = roomConnections[coordinatesToString(coordinates)].unconnectedRooms;
  console.log("Connected Rooms: ", connectedRoomsOfCurrent)

  // Add exits that lead to connected rooms
  for (const room of connectedRoomsOfCurrent) {
    const exitToConnected = getExitToCoordinate(coordinates, room);
    if (exitToConnected) {
      exits.add(exitToConnected);
    }
  }

  console.log("Exits:", exits)
  return Array.from(exits);
}



// Function to get the exit direction from one coordinate to another
function getExitToCoordinate(fromCoordinate, toCoordinate) {
  const offsets = [
    { offset: { x: 0, y: 1, z: 0 }, direction: "north" },
    { offset: { x: 0, y: -1, z: 0 }, direction: "south" },
    { offset: { x: 1, y: 0, z: 0 }, direction: "east" },
    { offset: { x: -1, y: 0, z: 0 }, direction: "west" },
    { offset: { x: 1, y: 1, z: 0 }, direction: "northeast" },
    { offset: { x: -1, y: 1, z: 0 }, direction: "northwest" },
    { offset: { x: 1, y: -1, z: 0 }, direction: "southeast" },
    { offset: { x: -1, y: -1, z: 0 }, direction: "southwest" },
    { offset: { x: 0, y: 0, z: 1 }, direction: "up" },
    { offset: { x: 0, y: 0, z: -1 }, direction: "down" },
    // ... repeat for other directions
  ];

  for (const { offset, direction } of offsets) {
    const adjacentCoord = {
      x: fromCoordinate.x + offset.x,
      y: fromCoordinate.y + offset.y,
      z: fromCoordinate.z + offset.z,
    };

    if (areCoordinatesEqual(adjacentCoord, toCoordinate)) {
      return direction;
    }
  }

  return null; // No exit in this direction
}

// Function to check if two coordinates are equal
function areCoordinatesEqual(coord1, coord2) {
  return coord1.x === coord2.x && coord1.y === coord2.y && coord1.z === coord2.z;
}

// Function to generate new coordinates based on the valid direction
function generateCoordinates(currentCoordinates, validDirection) {
  // Convert the validDirection to its full name if it exists in the directionMap
  const direction = directionMap[validDirection] || validDirection;

  let { x, y, z } = currentCoordinates;

  if (direction === 'north') {
    y++;
  } else if (direction === 'south') {
    y--;
  } else if (direction === 'east') {
    x++;
  } else if (direction === 'west') {
    x--;
  } else if (direction === 'northwest') {
    x--;
    y++;
  } else if (direction === 'southwest') {
    x--;
    y--;
  } else if (direction === 'northeast') {
    x++;
    y++;
  } else if (direction === 'southeast') {
    x++;
    y--;
  } else if (direction === 'up') {
    z++;
  } else if (direction === 'down') {
    z--;
  }

  return { x, y, z };
}


const equipmentItems = ["candle", "candles", "torch", "oil flask", "flint & steel", "holy symbol", "holy water", "lock pick", "pouch of lock picks (20)", "key", "rope 50 ft.", "salt", "book", "journal", "diary", "tome", "parchment", "scroll", "spellbook", "paper", "canvas", "miner's pick", "poison (vial)", "pouch", "robes", "shovel", "helmet", "club", "dagger", "dagger +1", "knife", "greatclub", "handaxe", "javelin", "lance", "hammer", "mace", "morning star", "quarterstaff", "sickle", "spear", "crossbow", "darts (20)", "shortbow", "arrows (20)", "darts", "sling", "staff sling", "battleaxe", "flail", "glaive", "greataxe", "greatsword", "halberd", "lance", "longsword", "longsword +1", "longsword +2", "longsword +3", "scimitar", "broad sword", "two-handed sword", "two-handed sword +1", "two-handed sword +2", "two-handed sword +3", "maul", "morningstar", "pike", "rapier", "scimitar", "shortsword", "shortsword +1", "shortsword +2", "trident", "war pick", "warhammer", "whip", "scourge", "blowgun", "longbow", "net", "banded mail", "banded mail +1", "chain mail", "chain mail +1", "chain mail +3", "plate mail", "plate mail +1", "plate mail +2", "plate mail +3", "leather armor", "padded armor", "suit of armor", "armor", "ring mail", "scale mail", "shield", "studded leather armor", "splint mail", "bracers", "adamantine armor", "backpack", "sheath", "sack", "crystal", "vial", "healing potion", "potion of healing", "orb", "rod", "staff", "wand", "totem", "wooden staff", "wand of fireballs", "wand of magic missiles", "wand of ice storm", "wand of lightning", "alchemist's fire flask", "amulet", "locket", "lantern", "chest", "wooden box", "jug", "pot", "flask", "waterskin", "rations", "drum", "flute", "lute", "lyre", "horn", "pan flute", "paint brush", "saddle", "ale", "bread", "meat", "bottle of wine", "goblet", "cup", "chalice", "gold pieces", "silver pieces", "copper pieces", "platinum pieces", "gem", "jewelry", "ring", "amulet of health", "amulet of the planes", "arrow of slaying", "bag of holding", "girdle of giant strength", "berserker axe", "boots of speed", "broom", "satchel", "candle of invocation", "cloak of displacement", "cloak of protection", "crystal ball", "dragon scale mail", "dust of disappearance", "dwarven plate", "elemental gem", "elven chain mail", "feather", "figurine", "flame tongue sword", "gem of brightness", "giant slayer", "hammer of thunderbolts", "ioun stone", "javelin of lightning", "mithral armor", "necklace of missiles", "potion of animal friendship", "potion of giant strength", "potion of invisibility", "potion of resistance", "potion of speed", "ring of protection", "ring of fire", "ring of water", "ring of earth", "ring of air", "ring of invisibility", "ring of resistance", "ring of telekinesis", "robe of the archmagi", "shield +1", "shield +2", "shield +3", "scimitar of speed", "staff of fire", "staff of healing", "staff of the magi", "staff of thunder & lightning", "wand of fear", "wand of paralysis",  /* other equipment items */];

// Function to escape special characters in a string for use in a regular expression
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Array to store player's inventory
let inventory = [];
function removeNoneFromInventory(inventory) {
  // Remove "None" and "None " if they exist in the inventory array
  inventory = inventory.filter(item => item.trim() !== "None" && item.trim() !== "None ");
  return inventory;
}

// Define experienceToAdd
const experienceToAdd = getRandomInt(10000, 50000);

// Define a map to store generated monsters in visited rooms
const monstersInVisitedRooms = new Map();

// Function to calculate XP based on character level
function calculateXP(level) {
  return level * 15000;
}

// Function to generate non-party NPCs and monsters for a room
function generateMonstersForRoom(roomCoordinates) {
  if (!monstersInVisitedRooms.has(roomCoordinates)) {
    const minLevel = 1; // Define the minimum level for monsters
    const maxLevel = 5; // Define the maximum level for monsters

    const numMonsters = getRandomInt(1, 11); // Generate 1 to 10 monsters

    const monsters = [];

    for (let i = 0; i < numMonsters; i++) {
      const randomRace = monsterRaces[Math.floor(Math.random() * monsterRaces.length)];
      const randomClass = monsterClasses[Math.floor(Math.random() * monsterClasses.length)];
      const randomLevel = getRandomInt(minLevel, maxLevel);

      // Generate HP for the monster as 1d10 times the level
      const hpIncrease = getRandomInt(1, 11) * randomLevel;

      const monster = {
        Name: generateMonsterName(getRandomSex()), // Use generateMonsterName function
        Sex: getRandomSex(),
        Race: randomRace.name,
        Class: randomClass.name,
        Level: randomLevel,
        XP: calculateXP(randomLevel), // Calculate XP based on character level
        HP: hpIncrease,
        MaxHP: hpIncrease,
      };

      monsters.push(monster);
    }

    monstersInVisitedRooms.set(roomCoordinates, monsters);
  }
}


let equippedInventory = [];


// Function to update the game console based on user inputs and get the updated game console
function updateGameConsole(userInput, currentCoordinates, conversationHistory, itemToTake) {

  // Initialize the coordinates
  let { x, y, z } = currentCoordinates;
  let objectsInRoomString = [];
  let itemsInRoom = [];

  // Get the most recent visited room's coordinates from the Set
  const recentCoordinates = Array.from(visitedRooms).pop();
  const coordinatesString = coordinatesToString(currentCoordinates);

  console.log('currentCoordinates:', currentCoordinates);
  console.log("Connected Rooms:", roomConnections);

  // Parse user input to check for valid directions
  const validDirections = ["north", "n", "south", "s", "east", "e", "west", "w", "northeast", "ne", "northwest", "nw", "southeast", "se", "southwest", "sw", "up", "u", "down", "d"];

  let userWords = userInput.split(/\s+/).map(word => word.toLowerCase());

  // Check if the updated coordinates are already present in the conversation history
  const matchingConsole = findMatchingConsoleByCoordinates(conversationHistory, currentCoordinates);

  let roomHistory = ""; // Initialize roomHistory
  let roomEquipment = [];
  let characterString = [];

  // Retrieve monsters in the current room
  const roomKey = coordinatesToString(currentCoordinates);
  let monstersInRoom = monstersInVisitedRooms.get(roomKey) || [];

  // Define visitedRoomCoordinates as a Set with visited coordinates
  let visitedRoomCoordinates = new Set(Array.from(visitedRooms).map(coordinatesToString));
  console.log("currentCoordinates:", currentCoordinates);
  console.log("visitedRoomCoordinates:", visitedRoomCoordinates);
  // Check if the room has not been visited
  if (!visitedRoomCoordinates.has(coordinatesToString(currentCoordinates))) {
    // Generate monsters with a 38% probability
    if (Math.random() < 0.38) {
      generateMonstersForRoom(roomKey);
      monstersInRoom = monstersInVisitedRooms.get(roomKey) || [];
    }
  }

  // Format the list of monsters in the current room as a string
  let monstersInRoomString = monstersInRoom.length > 0
    ? monstersInRoom.map(monster => {
      return `${monster.Name}
      ${monster.Sex}
      ${monster.Race}
      ${monster.Class}
      Level: ${monster.Level}
      XP: ${monster.XP}
      HP: ${monster.HP}
      MaxHP: ${monster.MaxHP}`;
    }).join("\n")
    : "None";

  // Get the exits for the current room
  let exits = [];
  if (currentCoordinates.x === 0 && currentCoordinates.y === 0 && currentCoordinates.z === 0 && !matchingConsole) {
    roomHistory = "You find yourself standing in the first room of the afterlife at the Ruined Temple in the underworld plane, Tartarus, a vast wasteland with a yellowish sky and vast mountains, consumed by hellish sandstorms and other winds, dark magics, ferocious monsters, dragons (celestial and otherwise) high magical beings and other entities of pure energy and form, angels and powerful demons..."; // Set preset value for specific coordinates
    exits = generateUniqueExits(currentCoordinates, conversationHistory);
    // Check if there's a chance to add equipment to the room
    // Check if there's a chance to add equipment to the room

    // Inside the code where new items are randomly generated, add XP to PC and NPCs
    if (Math.random() < 1.0) {
      const randomEquipment = equipmentItems[Math.floor(Math.random() * equipmentItems.length)];

      if (!roomEquipment.some(existingObject => areItemsEqual(existingObject, randomEquipment))) {
        roomEquipment.push(randomEquipment);

        // Add XP to PC
        characters.forEach(char => {
          char.XP += experienceToAdd; // Add XP to PC

        });

        // Add XP to NPCs
        npcs.forEach(npc => {
          npc.XP += experienceToAdd; // Add XP to NPCs
        });
      }
    }
    // Update the visited rooms set with the current room's coordinates
    visitedRooms.add(currentCoordinates);
    // Print the visited rooms to the console
    console.log('Visited Rooms:', Array.from(visitedRooms));
    console.log('Room History:', roomConversationHistories);
  } else if (currentCoordinates.x === 0 && currentCoordinates.y === 0 && currentCoordinates.z === 0 && matchingConsole) {
    const lines = conversationHistory.split("\n");
    const coordinatesIndex = lines.indexOf(matchingConsole);
    if (coordinatesIndex !== -1 && lines.length >= coordinatesIndex + 3) {
      exits = lines[coordinatesIndex + 2].replace("Exits: ", "").split(", ");
      // Extract equipment from the conversation history
      roomEquipment = roomConversationHistories[coordinatesString][roomConversationHistories[coordinatesString].length - 1].roomEquipment;
      // Check if the item to take is in the inventory
      //  if (inventory.includes(itemToTake)) {
      // Remove the item from "Objects in Room"
      //     roomEquipment = roomEquipment.filter(obj => obj !== itemToTake);
      //   }
      roomHistory = "You find yourself standing in the first room of the afterlife at the Ruined Temple in the underworld plane, Tartarus, a vast wasteland with a yellowish sky and vast mountains, consumed by hellish sandstorms and other winds, dark magics, ferocious monsters, dragons (celestial and otherwise) high magical beings and other entities of pure energy and form, angels and powerful demons..."; // Set preset value for specific coordinates
    }
    // Update the visited rooms set with the current room's coordinates
    visitedRooms.add(currentCoordinates);
    console.log('Visited Rooms:', Array.from(visitedRooms));
    console.log('Room History:', roomConversationHistories);
  } else if (!matchingConsole) {
    exits = generateUniqueExits(currentCoordinates, conversationHistory);
    // Check if there's a chance to add equipment to the room
    // Check if there's a chance to add equipment to the room

    // Inside the code where new items are randomly generated, add XP to PC and NPCs
    if (Math.random() < 1.0) {
      const randomEquipment = equipmentItems[Math.floor(Math.random() * equipmentItems.length)];

      if (!roomEquipment.some(existingObject => areItemsEqual(existingObject, randomEquipment))) {
        roomEquipment.push(randomEquipment);

        // Add XP to PC
        characters.forEach(char => {

          char.XP += experienceToAdd; // Add XP to PC

        });

        // Add XP to NPCs
        npcs.forEach(npc => {
          npc.XP += experienceToAdd; // Add XP to NPCs
        });
      }
    }
    // Update the visited rooms set with the current room's coordinates
    visitedRooms.add(currentCoordinates);
    // Print the visited rooms to the console
    console.log('Visited Rooms:', Array.from(visitedRooms));
    console.log('Room History:', roomConversationHistories);
  } else {
    const lines = conversationHistory.split("\n");
    const coordinatesIndex = lines.indexOf(matchingConsole);
    if (coordinatesIndex !== -1 && lines.length >= coordinatesIndex + 3) {
      exits = lines[coordinatesIndex + 2].replace("Exits: ", "").split(", ");
      // Extract equipment from the conversation history
      const roomHistoryObj = getFirstResponseForRoom(currentCoordinates); // Get the room's first response based on coordinates
      if (roomHistoryObj) {
        roomHistory = roomHistoryObj.response; // Extract the response property
      }
      if (
        roomConversationHistories[coordinatesString] &&
        roomConversationHistories[coordinatesString].length > 0
      ) {
        // Get the last item in the room's conversation history
        const lastRoomHistory =
          roomConversationHistories[coordinatesString][
          roomConversationHistories[coordinatesString].length - 1
          ];

        // Check if it has roomEquipment and update roomEquipment accordingly
        if (lastRoomHistory.roomEquipment) {
          roomEquipment = lastRoomHistory.roomEquipment;
        }
      }

      // Check if the item to take is in the inventory
      //    if (inventory.includes(itemToTake)) {
      // Remove the item from "Objects in Room"
      //      roomEquipment = roomEquipment.filter(obj => obj !== itemToTake);
      //    }

      visitedRooms.add(currentCoordinates);
      console.log('recentCoordinates:', recentCoordinates); // Log recentCoordinates every turn
      // Print the visited rooms to the console
      console.log('Visited Rooms:', Array.from(visitedRooms));
      console.log('Room History:', roomConversationHistories);
    } else {
      exits = [];
    }
  }

  // Check if there are additional objects in the room's conversation history
  if (roomConversationHistories[coordinatesString] && roomConversationHistories[coordinatesString].length > 0) {
    // Get the first response from the room's conversation history
    const firstResponse = roomConversationHistories[coordinatesString][0].response;

    // Create a regular expression pattern to match any equipment item from the list
    const equipmentPattern = new RegExp(`\\b(${equipmentItems.map(item => escapeRegExp(item)).join('|')})\\b`, 'gi');

    // Find all equipment items mentioned in the first response
    const mentionedEquipment = Array.from(new Set(firstResponse.match(equipmentPattern) || []));

    // Filter out equipment that is already in the room's equipment or have a similar name
    const newAdditionalEquipment = mentionedEquipment
      .map(item => item.trim()) // Remove leading and trailing whitespace
      .filter(item => !roomEquipment.some(existingItem => areItemsEqual(existingItem, item)));

    // Create a new array to store the combined equipment
    const combinedEquipment = roomEquipment.concat(newAdditionalEquipment);

    // Update roomEquipment with the combined equipment
    roomEquipment = combinedEquipment;
  }

  // Check if the last user input was "search room" based on userWords
  const isSearchRoom = userWords.length >= 2 && userWords.slice(-2).join(" ").toLowerCase() === "search room";
  console.log('userWords:', userWords);
  console.log('isSearchRoom:', isSearchRoom);

  if (isSearchRoom && roomConversationHistories[coordinatesToString(currentCoordinates)] && roomConversationHistories[coordinatesToString(currentCoordinates)].length > 0) {
    // Get the most recent response from the room's conversation history
    const mostRecentResponse = roomConversationHistories[coordinatesToString(currentCoordinates)][roomConversationHistories[coordinatesToString(currentCoordinates)].length - 1].response;

    // Create a regular expression pattern to match any equipment item from the list
    const equipmentPattern = new RegExp(`\\b(${equipmentItems.map(item => escapeRegExp(item)).join('|')})\\b`, 'gi');

    // Find all equipment items mentioned in the most recent response
    const mentionedEquipment = Array.from(new Set(mostRecentResponse.match(equipmentPattern) || []));

    // Filter out equipment that is already in the room's equipment, have a similar name, or is in the player's inventory
    const newAdditionalEquipment = mentionedEquipment
      .map(item => item.trim().toLowerCase()) // Convert to lowercase and remove leading/trailing whitespace
      .filter(item => {
        // Check if the item is not a substring of any existing equipment except the most recent room response
        return !roomEquipment.slice(0, -1).some(existingItem => existingItem.toLowerCase().includes(item)) && !inventory.some(existingItem => existingItem.toLowerCase().includes(item)) ||
          !roomEquipment.includes(item) ||
          !roomEquipment.some(existingItem => existingItem.toLowerCase().includes(item)); // Check if the item is not similar to any existing equipment
      });


    // Check if roomEquipment is empty
    if (roomEquipment.length < 1) {
      // If it's empty, set roomEquipment to newAdditionalEquipment
      roomEquipment = newAdditionalEquipment;
    } else {
      // If it's not empty, combine roomEquipment and newAdditionalEquipment
      roomEquipment = roomEquipment.concat(newAdditionalEquipment);
    }

    let combinedEquipment = [...new Set(roomEquipment.concat(newAdditionalEquipment))];
    objectsInRoomString = combinedEquipment;
    if (objectsInRoomString.length > 0) {
      // Remove "None" or "None " if they exist in the array
      objectsInRoomString = objectsInRoomString.filter(item => item !== "None" && item !== "None ");
    }
    itemsInRoom = objectsInRoomString;
    roomEquipment = objectsInRoomString;

    console.log('objectsInRoomString:', objectsInRoomString);
    console.log('itemsInRoom:', itemsInRoom);

    // Use the getFirstResponseForRoom function to get the first response
    const firstResponseForRoom = getFirstResponseForRoom(currentCoordinates);

    if (firstResponseForRoom) {
      // Add sentences to the first response about the newly found equipment
      const addedSentences = newAdditionalEquipment.map(item => `There is ${item} here.`);
      firstResponseForRoom.response = `${firstResponseForRoom.response} ${addedSentences.join(' ')}`;
    }
  }

  // Create the character based on the player's choice
  let character = null;


  // Construct a string to represent all characters in the characters array
  let charactersString = characters.map((char, index) => {
    let equippedItems = char.Equipped.join(', '); // Get the equipped items
    if (equippedItems.length < 1) {
      equippedItems = "None"; // Add "Equipped" prefix
    }
    return `${char.Name}
      ${char.Sex}
      ${char.Race}
      ${char.Class}
      Level: ${char.Level}
      XP: ${char.XP}
      HP: ${char.HP}
      MaxHP: ${char.MaxHP}
      Equipped: ${equippedItems}`;
  }).join("\n");

  if (userInput === '1' && charactersString.length <= 0) {
    userInput = document.getElementById("chatuserinput").value;
    document.getElementById("chatuserinput").value = "";
    userWords = "";
    character = createMortaciaCharacter();
  } else if (userInput === '2' && charactersString.length <= 0) {
    userInput = document.getElementById("chatuserinput").value;
    document.getElementById("chatuserinput").value = "";
    userWords = "";
    character = createSuzerainCharacter();
  } else if (userInput === '3' && charactersString.length <= 0) {
    userInput = document.getElementById("chatuserinput").value;
    document.getElementById("chatuserinput").value = "";
    userWords = "";
    character = createCharacter();
  }

  // Create a string representing NPCs and Mortacia
  let npcsString = npcs.length > 0
    ? npcs.map((char, index) => {
      return `${char.Name}
        ${char.Sex}
        ${char.Race}
        ${char.Class}
        Level: ${char.Level}
        XP: ${char.XP}
        HP: ${char.HP}
        MaxHP: ${char.MaxHP}`;
    }).join('\n')
    : "None";

  // Update HP and level based on XP for both PC and NPCs
  characters.forEach(char => {
    // Calculate the new level based on XP
    const newLevel = Math.floor(char.XP / 15000) + 1;

    // Check if the level has increased
    if (newLevel > char.Level) {
      char.Level = newLevel;

      // Define character classes and their respective HP generation
      const characterClasses = [
        { name: 'Knight of Atinus', baseHP: 10 },
        { name: 'Knight of Atricles', baseHP: 11 },
        { name: 'Wizard', baseHP: 6 },
        { name: 'Witch', baseHP: 6 },
        { name: 'Necromancer', baseHP: 6 },
        { name: 'Warlock', baseHP: 6 },
        { name: 'Sorcerer', baseHP: 6 },
        { name: 'Thief', baseHP: 8 },
        { name: 'Assassin', baseHP: 8 },
        { name: 'Barbarian', baseHP: 11 },
        { name: 'Assassin-Fighter-Necromancer-Goddess', baseHP: 11 },
        // Add other classes here
      ];

      // Find the character's class
      const characterClass = characterClasses.find(cls => cls.name === char.Class);

      // Calculate HP increase based on the class's HP generation
      let hpIncrease = 0;
      if (characterClass && characterClass.name === 'Knight of Atinus') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 10); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Knight of Atricles') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 11); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Wizard') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 6); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Witch') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 6); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Necromancer') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 6); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Warlock') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 6); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Sorcerer') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 6); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Thief') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 8); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Assassin') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 8); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Barbarian') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 11); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Assassin-Fighter-Necromancer-Goddess') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 11); // Increase by 1d10 for each level
      }


      // Calculate new HP and MaxHP
      char.HP += hpIncrease;
      char.MaxHP += hpIncrease;
    }
  });

  // Update HP and level for NPCs
  npcs.forEach(npc => {
    // Calculate the new level based on XP
    const newLevel = Math.floor(npc.XP / 15000) + 1;

    // Check if the level has increased
    if (newLevel > npc.Level) {
      npc.Level = newLevel;

      // Define character classes and their respective HP generation
      const characterClasses = [
        { name: 'Knight of Atinus', baseHP: 10 },
        { name: 'Knight of Atricles', baseHP: 11 },
        { name: 'Wizard', baseHP: 6 },
        { name: 'Witch', baseHP: 6 },
        { name: 'Necromancer', baseHP: 6 },
        { name: 'Warlock', baseHP: 6 },
        { name: 'Sorcerer', baseHP: 6 },
        { name: 'Thief', baseHP: 8 },
        { name: 'Assassin', baseHP: 8 },
        { name: 'Barbarian', baseHP: 11 },
        { name: 'Assassin-Fighter-Necromancer-Goddess', baseHP: 11 },
        // Add other classes here
      ];

      // Find the NPC's class
      const characterClass = characterClasses.find(cls => cls.name === npc.Class);

      // Calculate HP increase based on the class's HP generation
      let hpIncrease = 0;
      if (characterClass && characterClass.name === 'Knight of Atinus') {
        // Calculate additional HP based on the NPC's current level
        hpIncrease = rollDice(newLevel, 10); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Knight of Atricles') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 11); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Wizard') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 6); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Witch') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 6); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Necromancer') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 6); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Warlock') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 6); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Sorcerer') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 6); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Thief') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 8); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Assassin') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 8); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Barbarian') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 11); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Assassin-Fighter-Necromancer-Goddess') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 10); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Warrior') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 11); // Increase by 1d10 for each level
      } else if (characterClass && characterClass.name === 'Shaman') {
        // Calculate additional HP based on the character's current level
        hpIncrease = rollDice(newLevel, 6); // Increase by 1d10 for each level
      }




      // Calculate new HP and MaxHP
      npc.HP += hpIncrease;
      npc.MaxHP += hpIncrease;
    }
  });




  // Your modified code for adding monsters to NPCs
  const addMonsterToPartyPattern = /^add\s+([a-zA-Z\s]+)\s+to\s+party$/i;

  if (addMonsterToPartyPattern.test(userInput)) {
    const match = userInput.match(addMonsterToPartyPattern);
    const monsterName = match[1].trim(); // Extract the monster name

    // Find the index of the monster in monstersInRoom
    const monsterIndex = monstersInRoom.findIndex(
      (monster) => monster.Name.toLowerCase() === monsterName.toLowerCase()
    );

    if (monsterIndex !== -1) {
      // Get the monster details
      const monsterDetails = monstersInRoom[monsterIndex];

      // Remove the monster from monstersInRoom
      monstersInRoom.splice(monsterIndex, 1);

      // Add the removed monster to npcs
      npcs.push(monsterDetails);

      // Format the list of monsters in the current room as a string
      const monstersInRoomStringUpdated = monstersInRoom
        .map((monster) => {
          return `${monster.Name}
          ${monster.Sex}
          ${monster.Race}
          ${monster.Class}
          Level: ${monster.Level}
          XP: ${monster.XP}
          HP: ${monster.HP}
          MaxHP: ${monster.MaxHP}`;
        })
        .join("\n");

      // Format the list of NPCs as a string
      const npcsStringUpdated = npcs
        .map((char, index) => {
          return `${char.Name}
          ${char.Sex}
          ${char.Race}
          ${char.Class}
          Level: ${char.Level}
          XP: ${char.XP}
          HP: ${char.HP}
          MaxHP: ${char.MaxHP}`;
        })
        .join("\n");

      // Append the result to the conversation history
      conversationHistory += `\nYou added ${monsterName} to the party.\n`;
      conversationHistory += `\nMonsters in the room:\n${monstersInRoomStringUpdated}\n`;
      conversationHistory += `\nNPCs in the party:\n${npcsStringUpdated}\n`;
    } else {
      // Handle the case where the specified monster was not found in the room
      conversationHistory += `\n${monsterName} is not in the room.\n`;
    }
  }

  // Your code for removing a character from NPCs and putting it back in Monsters
  const removeMonsterFromPartyPattern = /^remove\s+([a-zA-Z\s]+)\s+from\s+party$/i;

  if (removeMonsterFromPartyPattern.test(userInput)) {
    const match = userInput.match(removeMonsterFromPartyPattern);
    const characterName = match[1].trim(); // Extract the character name

    // Find the index of the character in npcs
    const characterIndex = npcs.findIndex(
      (character) => character.Name.toLowerCase() === characterName.toLowerCase()
    );

    if (characterIndex !== -1) {
      // Get the character details
      const characterDetails = npcs[characterIndex];

      // Remove the character from npcs
      npcs.splice(characterIndex, 1);

      // Add the removed character back to monstersInRoom
      monstersInRoom.push(characterDetails);

      // Format the list of NPCs as a string
      const npcsStringUpdated = npcs
        .map((char, index) => {
          return `${char.Name}
          ${char.Sex}
          ${char.Race}
          ${char.Class}
          Level: ${char.Level}
          XP: ${char.XP}
          HP: ${char.HP}
          MaxHP: ${char.MaxHP}`;
        })
        .join("\n");

      // Update npcsString with the new data
      npcsString = npcsStringUpdated;

      // Format the list of monsters in the current room as a string
      const monstersInRoomStringUpdated = monstersInRoom
        .map((monster) => {
          return `${monster.Name}
          ${monster.Sex}
          ${monster.Race}
          ${monster.Class}
          Level: ${monster.Level}
          XP: ${monster.XP}
          HP: ${monster.HP}
          MaxHP: ${monster.MaxHP}`;
        })
        .join("\n");

      // Append the result to the conversation history
      conversationHistory += `\nYou removed ${characterName} from the party.\n`;
      conversationHistory += `\nMonsters in the room:\n${monstersInRoomStringUpdated}\n`;
      conversationHistory += `\nNPCs in the party:\n${npcsString}\n`;

      // Now, call the displayAllNPCData function to update the displayed data for all NPC slots
      for (let i = 0; i < 6; i++) {
        displayAllNPCData(npcsString, i);
      }
    } else {
      // Handle the case where the specified character was not found in the party
      conversationHistory += `\n${characterName} is not in the party.\n`;
    }
  }

  // Format the inventory as a string
  const inventoryString = inventory.length > 0 ? inventory.join(", ") : "Empty";
  // Format the exits as a string
  const exitsString = exits.join(", ");
  // Format the equipment items as a string
  const equipmentString = roomEquipment.length > 0 ? roomEquipment.map(item => item.trim()).join(", ") : "None";
  // Calculate the number of visited rooms
  const numVisitedRooms = calculateNumVisitedRooms();
  // Calculate the connected rooms
  const connectedRooms = calculateConnectedRooms(currentCoordinates);

  // Format the list of connected rooms as a string
  const connectedRoomsString = connectedRooms.join("; ");

  // Display PC and NPC data

  displayAllNPCData(npcsString, 0);
  displayAllNPCData(npcsString, 1);
  displayAllNPCData(npcsString, 2);
  displayAllNPCData(npcsString, 3);
  displayAllNPCData(npcsString, 4);
  displayAllNPCData(npcsString, 5);
  displayPCData(charactersString);

  // Return the updated game console as a formatted string
  return `
Seed: 
Room Description: ${roomHistory}
Coordinates: X: ${x}, Y: ${y}, Z: ${z}
Objects in Room: ${equipmentString} 
Exits: ${exitsString}
Score: 
Artifacts Found: 
Quests Achieved: 
Inventory: ${inventoryString}
Equipped Items: ${equippedInventory.join(", ")}
Turns: ${turns}
Player Character: ${charactersString}
Non-Player Characters (NPCs) in Party: ${npcsString}
Monsters in Room not in Party: ${monstersInRoomString}
Rooms Visited: ${numVisitedRooms}
Coordinates of Connected Rooms: ${connectedRoomsString}
`; // Add characters to the game console
  return;
}

// Function to display PC data in the PC column
function displayPCData(charactersString) {
  const pcColumn = document.querySelector('.character-column:nth-child(1)');

  // Clear the PC column first
  pcColumn.innerHTML = '';

  // Add the PC data
  pcColumn.innerHTML += `
    <b>PC:</b><br>
    ${charactersString.replace(/\n/g, '<br>')} <!-- Replace newlines with <br> tags -->
  `;
}

// Modify displayAllNPCData to append HTML instead of overwriting
function displayAllNPCData(npcsString, npcNumber, removedCharacterName, npcsStringUpdated) {
  // Check if npcsStringUpdated is available and use it as the first option
  if (npcsStringUpdated) {
    npcsString = npcsStringUpdated;
  }

  // Split the NPCs' data by lines
  let npcDataLines = npcsString.split('\n');

  // Calculate the number of lines per NPC dynamically (assuming each NPC has 8 lines)
  const linesPerNPC = 8;

  // Find the corresponding <td> element by index
  const npcDataElement = document.querySelectorAll('.character-column')[npcNumber + 1]; // +1 to account for the PC column

  // Clear the HTML content of the NPC slot
  npcDataElement.innerHTML = '';

  // Calculate the start and end indices for the desired NPC
  const startIndex = npcNumber * linesPerNPC; // Adjusted to start from 0
  const endIndex = startIndex + linesPerNPC;

  if (startIndex >= 0 && endIndex <= npcDataLines.length) {
    // Create an HTML string for the specified NPC
    const npcHTML = `
      <div class="npc-data">
      <b>NPCs:</b><br>
        ${npcDataLines.slice(startIndex, endIndex).join('<br>')}
      </div>
    `;

    // Append the generated HTML string to the <td> element's innerHTML
    npcDataElement.innerHTML += npcHTML;
  } else {
    // Display a message if the specified NPC number is out of range
    console.log('NPC not found.');
  }
}


function calculateNumVisitedRooms() {
  return visitedRooms.size;
}

function calculateConnectedRooms(currentCoordinates) {
  // Check if the roomConnections entry exists for the current room
  const roomConnection = roomConnections[coordinatesToString(currentCoordinates)];
  if (!roomConnection) {
    return [];
  }

  // Get the connected rooms for the current room and extract their coordinates
  const connectedRooms = roomConnection.connectedRooms.map(coordObj => coordinatesToString(coordObj));

  return connectedRooms;
}


function getAdjacentCoordinates(coordinates) {
  const adjacentCoordinates = new Set();
  const validOffsets = [
    { x: 0, y: 1, z: 0 }, // north
    { x: 0, y: -1, z: 0 },  // south
    { x: 1, y: 0, z: 0 },  // east
    { x: -1, y: 0, z: 0 }, // west
    { x: 1, y: 1, z: 0 },  // northeast
    { x: -1, y: 1, z: 0 }, // northwest
    { x: 1, y: -1, z: 0 }, // southeast
    { x: -1, y: -1, z: 0 },// southwest
    { x: 0, y: 0, z: 1 },  // up
    { x: 0, y: 0, z: -1 }, // down
  ];

  for (const offset of validOffsets) {
    const adjacentCoord = {
      x: coordinates.x + offset.x,
      y: coordinates.y + offset.y,
      z: coordinates.z + offset.z,
    };
    adjacentCoordinates.add(coordinatesToString(adjacentCoord)); // Convert to string for comparison
  }

  return adjacentCoordinates;
}


// Function to convert coordinates object to a string
function coordinatesToString(coordinates) {
  return `${coordinates.x},${coordinates.y},${coordinates.z}`;
}

// Function to check if two objects are equal
function areObjectsEqual(obj1, obj2) {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) {
      return false;
    }
  }

  return true;
}


// Function to perform dynamic search using TF-IDF
async function performDynamicSearch(query, maxWordCount = 700) {
  // Retrieve the conversation history from IndexedDB
  const conversationId = localStorage.getItem("conversationId");
  const promptAndResponses = await getPromptsAndResponsesForConversation(conversationId);

  // Get the last 8 prompts and responses from the end of the array
  const last8PromptAndResponses = promptAndResponses.slice(-8);

  // Extract the prompts and responses
  const prompts = last8PromptAndResponses.map(item => item.prompt);
  const responses = last8PromptAndResponses.map(item => item.response);
  console.log("Last 8 responses:", last8PromptAndResponses);

  // Keywords to exclude
  const excludeKeywords = [
    "Seed:", "Room Description:", "Coordinates:", "Objects in Room:",
    "Exits:", "XP:", "Score:", "Artifacts Found:",
    "Quests Achieved:", "HP:", "Inventory:", "PC:",
    "NPCs:", "Rooms Visited:", "Turns:", "north", "south", "east", "west", "northeast", "southeast", "northwest", "southwest", "up", "down"
  ];

  // Function to check if a line includes any of the exclude keywords
  const shouldExcludeLine = (line) => line && excludeKeywords.some(keyword => line.toLowerCase().trim().includes(keyword.toLowerCase()));

  // Filter out lines that include exclude keywords
  const filteredResponses = last8PromptAndResponses.filter(promptAndResponse => {
    const excluded = shouldExcludeLine(promptAndResponse.response); // Access response as promptAndResponse.response.response
    console.log(`Response ${promptAndResponse.response.response} excluded? ${excluded}`);
    return !excluded;
  });
  // Preprocess the query and filtered responses (lowercase and remove punctuation)
  const preprocessText = (text) => text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

  // Tokenize the query and responses into words (unigrams)
  const wordsInQuery = preprocessText(query).split(/\s+/);
  const wordsInResponses = promptAndResponses.map(promptAndResponse =>
    preprocessText(promptAndResponse.response).split(/\s+/)
  );

  // Calculate the TF-IDF scores for each word in the query and responses
  const wordTFIDFScores = {};
  const queryWordCounts = {};
  wordsInQuery.forEach(word => {
    queryWordCounts[word] = (queryWordCounts[word] || 0) + 1;
  });

  // Calculate Term Frequency (TF) for the query
  const queryWordTFIDFScores = {};
  Object.keys(queryWordCounts).forEach(word => {
    const termFrequency = queryWordCounts[word] / wordsInQuery.length;
    const inverseDocumentFrequency = Math.log(promptAndResponses.length / wordsInResponses.filter(words => words.includes(word)).length);
    queryWordTFIDFScores[word] = termFrequency * inverseDocumentFrequency;
  });

  // Calculate TF-IDF scores for words in the responses
  wordsInResponses.forEach((responseWords, responseIndex) => {
    responseWords.forEach(word => {
      if (!wordTFIDFScores[word]) {
        const termFrequency = responseWords.filter(w => w === word).length / responseWords.length;
        const inverseDocumentFrequency = Math.log(promptAndResponses.length / wordsInResponses.filter(words => words.includes(word)).length);
        wordTFIDFScores[word] = termFrequency * inverseDocumentFrequency;
      }
    });
  });

  // Calculate the relevance score for each response and prompt
  const responsePromptRelevanceScores = last8PromptAndResponses.map(({ prompt, response, index }) => {
    const responseWords = preprocessText(response).split(/\s+/);
    const promptWords = preprocessText(prompt).split(/\s+/);

    let relevanceScore = 0;

    responseWords.forEach(word => {
      if (queryWordTFIDFScores[word]) {
        relevanceScore += queryWordTFIDFScores[word] * wordTFIDFScores[word];
      }
    });

    promptWords.forEach(word => {
      if (queryWordTFIDFScores[word]) {
        relevanceScore += queryWordTFIDFScores[word] * wordTFIDFScores[word];
      }
    });

    return { prompt, response, relevanceScore, index };
  });

  // Sort the responses and prompts in chronological order first and then by relevance score
  responsePromptRelevanceScores.sort((a, b) => {
    if (a.index === b.index) {
      // If responses/prompts have the same index, sort by relevance score
      return b.relevanceScore - a.relevanceScore;
    }
    // Otherwise, sort by index (chronological order)
    return a.index - b.index;
  });

  // Sort the responses by original index (chronological order)
  filteredResponses.sort((a, b) => a.index - b.index);

  // Calculate the total word count of selected sentences
  let currentWordCount = 0;
  const selectedResponsesPrompts = [];

  for (const { prompt, response } of responsePromptRelevanceScores) {
    const promptWords = prompt.split(/\s+/);
    const responseWords = response.split(/\s+/);

    if (currentWordCount + promptWords.length + responseWords.length <= maxWordCount) {
      selectedResponsesPrompts.push({ prompt, response });
      currentWordCount += promptWords.length + responseWords.length;
    } else {
      break;
    }
  }

  console.log("filteredResponses:", filteredResponses); // Debug: Print filtered responses

  // ... (rest of the code)

  console.log("responseRelevanceScores:", responsePromptRelevanceScores); // Debug: Print relevance scores

  // ... (rest of the code)

  console.log("selectedResponses:", selectedResponsesPrompts); // Debug: Print selected responses


  // Join the selected responses and prompts into a single string
  const selectedResults = selectedResponsesPrompts.map(({ prompt, response }) => `${prompt}\n${response}`).join("\n\n");

  return selectedResults;

}

var previousResponse = [];

function scrollToBottom() {
  window.scrollTo(0, document.body.scrollHeight);
}

/*// Function to translate shorthand commands into full commands
function translateShorthandCommands(userInput) {
  const shorthandMap = {
    'n': 'north',
    's': 'south',
    'e': 'east',
    'w': 'west',
    'nw': 'northwest',
    'sw': 'southwest',
    'ne': 'northeast',
    'se': 'southeast',
    'u': 'up',
    'd': 'down',
    'l': 'look',
    //'i': 'inventory'
    // Add more shorthand translations as needed
  };

  const words = userInput.toLowerCase().split(/\s+/);
  const translatedWords = words.map(word => shorthandMap[word] || word);
  return translatedWords.join(' ');
}*/

// Define an array to store character information
const characters = [];

let character = {
  Name: '',
  Sex: '',
  Race: '',
  Class: '',
  Level: 1,
  XP: 0,
  HP: 0,
  MaxHP: 0,
};

console.log('characters:', characters);

// Define character classes and their respective stats
const characterClasses = [
  { name: 'Knight of Atinus', hp: '10 + 1d10', description: 'God of War' },
  { name: 'Knight of Atricles', hp: '10 + 1d11', description: 'God of Justice' },
  { name: 'Wizard', hp: '10 + 1d6', description: 'a student of magic and the arcane arts.' },
  { name: 'Witch', hp: '10 + 1d6', description: 'Worships Mortacia, goddess of death' },
  { name: 'Necromancer', hp: '10 + 1d6', description: 'Worships Mortacia, goddess of death' },
  { name: 'Warlock', hp: '10 + 1d6', description: 'Powers come from within through possession and use of dark magic' },
  { name: 'Sorcerer', hp: '10 + 1d6', description: 'Powers come from within through possession and use of light magic' },
  { name: 'Thief', hp: '10 + 1d8', description: '' },
  { name: 'Assassin', hp: '10 + 1d8', description: '' },
  { name: 'Barbarian', hp: '10 + 1d11', description: '' },
];

const characterRaces = [
  { name: 'Human', description: '.' },
  { name: 'Dwarf', description: 'who mine the mountains.' },
  { name: 'High Elf', description: 'of light magic.' },
  { name: 'Unseelie Elf', description: 'of dark magic.' },
  { name: 'Half-Elf', description: '.' },
  { name: 'Halfling', description: '.' },
  { name: 'Fey', description: 'pixie-like creatures related to the elves.' },
  { name: 'Raakshasa', description: 'cat-like beings who tend to be dark sorcerers and necromancers.' },
  { name: 'Gnome', description: 'humanoids who thrive at the arts of invention.' },
];

// Define monster races
const monsterRaces = [
  { name: 'Orc', description: 'Savage and brutal' },
  { name: 'Goblin', description: 'Small and cunning' },
  { name: 'Dragonborn', description: 'Dragon-like humanoids' },
  { name: 'Aboleth', description: 'Mind-controlling horrors' },
  { name: 'Aboleth Mage', description: 'Powerful aboleth spellcasters' },
  { name: 'Achaierai', description: 'Four-legged, beak-faced fiends' },
  { name: 'Allip', description: 'Tormented, babbling undead' },
  { name: 'Angel', description: 'Celestial beings of light' },
  { name: 'Angel, Astral Deva', description: 'Noble astral angels' },
  { name: 'Angel, Planetar', description: 'Mighty planetar angels' },
  { name: 'Angel, Solar', description: 'Radiant solar angels' },
  { name: 'Animated Object', description: 'Inanimate objects brought to life' },
  { name: 'Ankheg', description: 'Giant insectoid burrowers' },
  { name: 'Aranea', description: 'Shape-shifting spider folk' },
  { name: 'Archon', description: 'Celestial servants of law' },
  { name: 'Lantern Archon', description: 'Small celestial beings of light' },
  { name: 'Hound Archon', description: 'Celestial dog-like guardians' },
  { name: 'Hound Archon Hero', description: 'Mighty hero among hound archons' },
  { name: 'Trumpet Archon', description: 'Celestial horn-blowing warriors' },
  { name: 'Arrowhawk', description: 'Airborne elemental creatures' },
  { name: 'Assassin Vine', description: 'Lurking, deadly plant creatures' },
  { name: 'Athach', description: 'Three-armed, one-eyed brutes' },
  { name: 'Avoral', description: 'Eagle-headed celestial beings' },
  { name: 'Azer', description: 'Fire-loving dwarf-like creatures' },
  { name: 'Barghest', description: 'Fiendish wolf-like creatures' },
  { name: 'Greater Barghest', description: 'Mightier fiendish barghests' },
  { name: 'Basilisk', description: 'Stone-gazing reptilian monsters' },
  { name: 'Abyssal Greater Basilisk', description: 'Monstrous abyssal variant' },
  { name: 'Behir', description: 'Serpentine lightning-breathing creatures' },
  { name: 'Belker', description: 'Smoke-form elemental creatures' },
  { name: 'Blink Dog', description: 'Teleporting canine creatures' },
  { name: 'Bodak', description: 'Horrific undead beings' },
  { name: 'Bralani', description: 'Eladrin-like celestial creatures' },
  { name: 'Bugbear', description: 'Large, vicious goblinoids' },
  { name: 'Bulette', description: 'Burrowing, shark-like monsters' },
  { name: 'Celestial Creature', description: 'Celestial beings' },
  { name: 'Centaur', description: 'Humanoid with horse lower body' },
  { name: 'Chaos Beast', description: 'Ever-changing, chaotic creatures' },
  { name: 'Chimera', description: 'Multi-headed, hybrid monsters' },
  { name: 'Choker', description: 'Stalking, tentacled creatures' },
  { name: 'Chuul', description: 'Aquatic, crab-like monstrosities' },
  { name: 'Cloaker', description: 'Cloak-like, shadowy creatures' },
  { name: 'Cockatrice', description: 'Bird-like creatures with petrifying gaze' },
  { name: 'Couatl', description: 'Feathered serpentine celestial beings' },
  { name: 'Darkmantle', description: 'Ceiling-dwelling, dark creatures' },
  { name: 'Delver', description: 'Subterranean tunneling creatures' },
  { name: 'Demon', description: 'Chaotic evil fiends' },
  { name: 'Babau', description: 'Abyssal demon assassins' },
  { name: 'Balor', description: 'Demonic lords of destruction' },
  { name: 'Bebilith', description: 'Abyssal arachnid demons' },
  { name: 'Dretch', description: 'Lowly, chaotic demons' },
  { name: 'Glabrezu', description: 'Powerful, monstrous demons' },
  { name: 'Hezrou', description: 'Toad-like, foul demons' },
  { name: 'Marilith', description: 'Serpentine, multi-armed demons' },
  { name: 'Nalfeshnee', description: 'Grotesque, gluttonous demons' },
  { name: 'Quasit', description: 'Impish, chaotic demons' },
  { name: 'Retriever', description: 'Construct-like, demonic hunters' },
  { name: 'Succubus', description: 'Seductive, shape-shifting demons' },
  { name: 'Vrock', description: 'Vulture-like, chaotic demons' },
  { name: 'Derro', description: 'Mad, subterranean dwarf-like creatures' },
  { name: 'Destrachan', description: 'Sonic-wielding, blind subterranean creatures' },
  { name: 'Devil', description: 'Lawful evil fiends' },
  { name: 'Barbed Devil (Hamatula)', description: 'Thorn-covered devils' },
  { name: 'Bearded Devil (Barbazu)', description: 'Bearded, spear-wielding devils' },
  { name: 'Bone Devil (Osyluth)', description: 'Skeletal, manipulative devils' },
  { name: 'Chain Devil (Kyton)', description: 'Chain-wielding, torturous devils' },
  { name: 'Erinyes', description: 'Whip-wielding, tempting devils' },
  { name: 'Hellcat (Bezekira)', description: 'Fiendish cat-like creatures' },
  { name: 'Horned Devil (Cornugon)', description: 'Horned, brutal devils' },
  { name: 'Ice Devil (Gelugon)', description: 'Icy, spear-wielding devils' },
  { name: 'Imp', description: 'Tiny, mischievous devils' },
  { name: 'Lemure', description: 'Blob-like, lowly devils' },
  { name: 'Pit Fiend', description: 'Powerful, lordly devils' },
  { name: 'Devourer', description: 'Soul-consuming undead beings' },
  { name: 'Digester', description: 'Acid-spewing, monstrous creatures' },
  { name: 'Dinosaur', description: 'Prehistoric reptilian creatures' },
  { name: 'Deinonychus', description: 'Raptor-like, swift dinosaurs' },
  { name: 'Elasmosaurus', description: 'Long-necked, aquatic dinosaurs' },
  { name: 'Megaraptor', description: 'Giant, predatory theropods' },
  { name: 'Triceratops', description: 'Horned, herbivorous dinosaurs' },
  { name: 'Tyrannosaurus', description: 'Giant, fearsome carnivores' },
  { name: 'Dire Animal', description: 'Enormous, enhanced natural creatures' },
  { name: 'Dire Ape', description: 'Gigantic, powerful primates' },
  { name: 'Dire Badger', description: 'Huge, ferocious badgers' },
  { name: 'Dire Bat', description: 'Giant, winged mammals' },
  { name: 'Dire Bear', description: 'Massive, formidable bear creatures' },
  { name: 'Dire Boar', description: 'Huge, aggressive swine' },
  { name: 'Dire Lion', description: 'Majestic, enormous feline predators' },
  { name: 'Dire Rat', description: 'Giant, disease-carrying rodents' },
  { name: 'Dire Shark', description: 'Huge, ocean-dwelling predators' },
  { name: 'Dire Tiger', description: 'Powerful, immense tiger creatures' },
  { name: 'Dire Weasel', description: 'Large, deadly mustelids' },
  { name: 'Dire Wolf', description: 'Giant, pack-hunting wolves' },
  { name: 'Dire Wolverine', description: 'Ferocious, oversized weasels' },
  { name: 'Doppelganger', description: 'Shape-shifting, mimic creatures' },
  { name: 'Dragon, True', description: 'Majestic, elemental dragons' },
  { name: 'Chromatic Dragons', description: 'Evil-aligned elemental dragons' },
  { name: 'Black Dragon', description: 'Corrupting, swamp-dwelling dragons' },
  { name: 'Blue Dragon', description: 'Territorial, desert-dwelling dragons' },
  { name: 'Green Dragon', description: 'Deceptive, forest-dwelling dragons' },
  { name: 'Red Dragon', description: 'Destructive, volcanic dragons' },
  { name: 'White Dragon', description: 'Icy, cold-dwelling dragons' },
  { name: 'Metallic Dragons', description: 'Good-aligned elemental dragons' },
  { name: 'Brass Dragon', description: 'Talkative, desert-dwelling dragons' },
  { name: 'Bronze Dragon', description: 'Seafaring, ocean-dwelling dragons' },
  { name: 'Copper Dragon', description: 'Trickster, jungle-dwelling dragons' },
  { name: 'Gold Dragon', description: 'Noble, sun-dwelling dragons' },
  { name: 'Silver Dragon', description: 'Elegant, arctic-dwelling dragons' },
  { name: 'Dragon Turtle', description: 'Monstrous, aquatic dragonkin' },
  { name: 'Dragonne', description: 'Winged, lion-like creatures' },
  { name: 'Drider', description: 'Drow-spider hybrid creatures' },
  { name: 'Dryad', description: 'Woodland guardian spirits' },
  { name: 'Dwarf', description: 'Short and sturdy humanoids' },
  { name: 'Deep Dwarf', description: 'Subterranean, resilient dwarves' },
  { name: 'Duergar', description: 'Evil-aligned, dark dwarves' },
  { name: 'Mountain Dwarf', description: 'Highland-dwelling, stout dwarves' },
  { name: 'Eagle, Giant', description: 'Massive, majestic avian creatures' },
  { name: 'Elemental', description: 'Primordial elemental beings' },
  { name: 'Air Elemental', description: 'Whirling air creatures' },
  { name: 'Earth Elemental', description: 'Earthen, rocky creatures' },
  { name: 'Fire Elemental', description: 'Burning, fiery creatures' },
  { name: 'Water Elemental', description: 'Watery, fluid creatures' },
  { name: 'Elf', description: 'Graceful, long-lived humanoids' },
  { name: 'Half-Elf', description: 'Mixed elf and human heritage' },
  { name: 'Aquatic Elf', description: 'Sea-dwelling, aquatic elves' },
  { name: 'Drow', description: 'Dark-skinned, subterranean elves' },
  { name: 'Gray Elf', description: 'Mysterious, high elves' },
  { name: 'Wild Elf', description: 'Savage, primal forest elves' },
  { name: 'Wood Elf', description: 'Forest-dwelling, woodland elves' },
  { name: 'Ethereal Filcher', description: 'Dimension-hopping thieves' },
  { name: 'Ethereal Marauder', description: 'Ruthless ethereal raiders' },
  { name: 'Ettercap', description: 'Web-spinning, spider-like creatures' },
  { name: 'Ettin', description: 'Two-headed, brutish giants' },
  { name: 'Fiendish Creature', description: 'Creatures infused with fiendish essence' },
  { name: 'Formian', description: 'Ant-like insectoid creatures' },
  { name: 'Worker', description: 'Basic formian caste' },
  { name: 'Warrior', description: 'Formian warrior caste' },
  { name: 'Taskmaster', description: 'Formian taskmaster caste' },
  { name: 'Myrmarch', description: 'Formian ruler caste' },
  { name: 'Queen', description: 'Formian queen caste' },
  { name: 'Frost Worm', description: 'Icy, tunneling worm creatures' },
  { name: 'Fungus', description: 'Mushroom-like, fungal creatures' },
  { name: 'Shrieker', description: 'Audible alert fungal creatures' },
  { name: 'Violet Fungus', description: 'Tentacle-laden fungal creatures' },
  { name: 'Gargoyle', description: 'Stone guardians brought to life' },
  { name: 'Kapoacinth', description: 'Aquatic, stone-skinned creatures' },
  { name: 'Genie', description: 'Elemental beings of magic' },
  { name: 'Djinni', description: 'Air-dwelling genie beings' },
  { name: 'Noble Djinn', description: 'Mighty and noble air genies' },
  { name: 'Efreeti', description: 'Fire-dwelling genie beings' },
  { name: 'Ghaele', description: 'Celestial beings of beauty and grace' },
  { name: 'Ghost', description: 'Restless spirits of the deceased' },
  { name: 'Ghoul', description: 'Corpse-eating undead fiends' },
  { name: 'Lacedon', description: 'Aquatic, savage ghoul variant' },
  { name: 'Ghast', description: 'More powerful, horrifying undead' },
  { name: 'Giant', description: 'Enormous humanoid creatures' },
  { name: 'Cloud Giant', description: 'Sky-dwelling giants' },
  { name: 'Fire Giant', description: 'Molten lava-dwelling giants' },
  { name: 'Frost Giant', description: 'Glacial, ice-dwelling giants' },
  { name: 'Frost Giant Jarl', description: 'Mighty frost giant lords' },
  { name: 'Hill Giant', description: 'Huge, hill-dwelling giants' },
  { name: 'Stone Giant', description: 'Rock-skinned giants' },
  { name: 'Stone Giant Elders', description: 'Ancient, wise stone giants' },
  { name: 'Storm Giant', description: 'Majestic, storm-controlling giants' },
  { name: 'Gibbering Mouther', description: 'Mad, gibbering amalgamations' },
  { name: 'Girallon', description: 'Four-armed, gorilla-like creatures' },
  { name: 'Gnoll', description: 'Hyena-headed, savage humanoids' },
  { name: 'Gnome', description: 'Small, inventive humanoids' },
  { name: 'Svirfneblin', description: 'Subterranean deep gnomes' },
  { name: 'Forest Gnome', description: 'Nature-loving gnomes' },
  { name: 'Goblin', description: 'Small, mischievous humanoids' },
  { name: 'Golem', description: 'Artificial, construct creatures' },
  { name: 'Clay Golem', description: 'Mud and earth construct golems' },
  { name: 'Flesh Golem', description: 'Stitched together humanoid golems' },
  { name: 'Iron Golem', description: 'Metallic, powerful construct golems' },
  { name: 'Stone Golem', description: 'Rock and stone construct golems' },
  { name: 'Greater Stone Golem', description: 'Mighty stone construct golems' },
  { name: 'Gorgon', description: 'Metallic, bull-like creatures' },
  { name: 'Gray Render', description: 'Large, multi-limbed monstrosities' },
  { name: 'Grick', description: 'Tentacled, subterranean creatures' },
  { name: 'Griffon', description: 'Majestic, eagle-lion creatures' },
  { name: 'Grimlock', description: 'Blind, subterranean humanoids' },
  { name: 'Hag', description: 'Malevolent, monstrous spellcasters' },
  { name: 'Annis', description: 'Hideous, brute-like hags' },
  { name: 'Green Hag', description: 'Swamp-dwelling, cunning hags' },
  { name: 'Sea Hag', description: 'Oceanic, cruel hags' },
  { name: 'Half-Celestial', description: 'Celestial-infused mortals' },
  { name: 'Half-Dragon', description: 'Dragonblood-infused creatures' },
  { name: 'Half-Fiend', description: 'Fiendish-infused mortals' },
  { name: 'Halfling', description: 'Small, jovial humanoids' },
  { name: 'Tallfellow', description: 'Hobbit-like, stealthy halflings' },
  { name: 'Deep Halfling', description: 'Subterranean halfling variant' },
  { name: 'Harpy', description: 'Avian, seductive creatures' },
  { name: 'Harpy Archer', description: 'Harpy ranged attackers' },
  { name: 'Hell Hound', description: 'Infernal, fire-breathing hounds' },
  { name: 'Nessian Warhound', description: 'Hellish, inferno-dwelling hounds' },
  { name: 'Hippogriff', description: 'Horse-eagle hybrid creatures' },
  { name: 'Hobgoblin', description: 'Militaristic, goblinoid humanoids' },
  { name: 'Homunculus', description: 'Tiny, artificial humanoid constructs' },
  { name: 'Howler', description: 'Terrifying, sonic creatures' },
  { name: 'Hydra', description: 'Multi-headed, regenerating serpents' },
  { name: 'Pyrohydra', description: 'Fire-breathing, multi-headed hydra' },
  { name: 'Cryohydra', description: 'Cold-breathing, multi-headed hydra' },
  { name: 'Inevitable', description: 'Lawful enforcers of reality' },
  { name: 'Kolyarut', description: 'Inevitables of order and justice' },
  { name: 'Marut', description: 'Inevitables of final judgment' },
  { name: 'Zelekhut', description: 'Inevitables of pursuit and vengeance' },
  { name: 'Invisible Stalker', description: 'Unseen, air elemental creatures' },
  { name: 'Kobold', description: 'Small, cunning reptilian humanoids' },
  { name: 'Kraken', description: 'Gigantic, sea-dwelling monsters' },
  { name: 'Krenshar', description: 'Feline creatures with retractable faces' },
  { name: 'Lamia', description: 'Serpentine, enchanting monsters' },
  { name: 'Lammasu', description: 'Noble, celestial guardians' },
  { name: 'Golden Protector', description: 'Noble, golden lammasu' },
  { name: 'Leonal', description: 'Celestial lion guardians' },
  { name: 'Lich', description: 'Undead spellcasters seeking power' },
  { name: 'Lillend', description: 'Serpentine, musical celestial beings' },
  { name: 'Lizardfolk', description: 'Reptilian, tribal humanoids' },
  { name: 'Lizardfolk', description: 'Reptilian, tribal humanoids' },
  { name: 'Locathah', description: 'Aquatic, fish-like humanoids' },
  { name: 'Lycanthrope', description: 'Shape-changing, afflicted creatures' },
  { name: 'Werebear', description: 'Noble, bear-like lycanthropes' },
  { name: 'Wereboar', description: 'Savage, boar-like lycanthropes' },
  { name: 'Hill Giant Dire Wereboar', description: 'Monstrous hybrid' },
  { name: 'Wererat', description: 'Scheming, rat-like lycanthropes' },
  { name: 'Weretiger', description: 'Majestic, tiger-like lycanthropes' },
  { name: 'Werewolf', description: 'Savage, wolf-like lycanthropes' },
  { name: 'Werewolf Lord', description: 'Powerful alpha werewolves' },
  { name: 'Magmin', description: 'Fiery, elemental fire creatures' },
  { name: 'Manticore', description: 'Lion-bodied, spiked-tailed monsters' },
  { name: 'Medusa', description: 'Snake-haired, petrifying creatures' },
  { name: 'Mephit', description: 'Small, elemental creatures' },
  { name: 'Air Mephit', description: 'Airborne, mischievous mephits' },
  { name: 'Dust Mephit', description: 'Dust and sand-based mephits' },
  { name: 'Earth Mephit', description: 'Earthy and rocky mephits' },
  { name: 'Fire Mephit', description: 'Flaming and fiery mephits' },
  { name: 'Ice Mephit', description: 'Frosty and cold mephits' },
  { name: 'Magma Mephit', description: 'Molten lava-based mephits' },
  { name: 'Ooze Mephit', description: 'Slime and ooze-based mephits' },
  { name: 'Salt Mephit', description: 'Salt and desert-themed mephits' },
  { name: 'Steam Mephit', description: 'Steam and vapor-based mephits' },
  { name: 'Water Mephit', description: 'Aquatic and watery mephits' },
  { name: 'Merfolk', description: 'Aquatic, fish-like humanoids' },
  { name: 'Mimic', description: 'Shape-shifting, mimic creatures' },
  { name: 'Minotaur', description: 'Mighty, bull-headed creatures' },
  { name: 'Mohrg', description: 'Undead, corpse-animated creatures' },
  { name: 'Mummy', description: 'Ancient, desiccated undead' },
  { name: 'Mummy Lord', description: 'Mighty, lordly mummies' },
  { name: 'Naga', description: 'Serpentine, spellcasting beings' },
  { name: 'Dark Naga', description: 'Serpentine, deceitful spellcasters' },
  { name: 'Guardian Naga', description: 'Serpentine, protective beings' },
  { name: 'Spirit Naga', description: 'Serpentine, spirit-controlling beings' },
  { name: 'Water Naga', description: 'Serpentine, aquatic spellcasters' },
  { name: 'Night Hag', description: 'Evil, dream-invading hags' },
  { name: 'Nightmare', description: 'Nightmarish, demonic steeds' },
  { name: 'Cauchemar', description: 'Fiery, demonic nightmares' },
  { name: 'Nightshade', description: 'Shadowy, undead beings' },
  { name: 'Nightcrawler', description: 'Shadowy, stealthy undead' },
  { name: 'Nightwalker', description: 'Giant, shadowy undead' },
  { name: 'Nightwing', description: 'Abyssal, winged undead' },
  { name: 'Nymph', description: 'Enchanting, nature spirits' },
  { name: 'Ogre', description: 'Brutish, giant humanoids' },
  { name: 'Ogre Barbarian', description: 'Savage, raging ogres' },
  { name: 'Merrow', description: 'Aquatic, brutish ogres' },
  { name: 'Ogre Mage', description: 'Cunning, spellcasting ogres' },
  { name: 'Ooze', description: 'Amorphous, blob-like creatures' },
  { name: 'Black Pudding', description: 'Acidic, corrosive oozes' },
  { name: 'Elder Black Pudding', description: 'Mighty, acidic oozes' },
  { name: 'Gelatinous Cube', description: 'Translucent, cube-shaped oozes' },
  { name: 'Gray Ooze', description: 'Sluggish, gray-colored oozes' },
  { name: 'Ochre Jelly', description: 'Yellow, acidic oozes' },
  { name: 'Oracle', description: 'Divine seers and prophets' },
  { name: 'Orca', description: 'Gigantic, oceanic dolphins' },
  { name: 'Otyugh', description: 'Foul, scavenging aberrations' },
  { name: 'Owlbear', description: 'Bizarre owl-bear hybrid creatures' },
  { name: 'Pegasus', description: 'Winged, celestial horse creatures' },
  { name: 'Phantom Fungus', description: 'Ghostly, fungal specters' },
  { name: 'Phase Spider', description: 'Dimension-hopping arachnids' },
  { name: 'Phoenix', description: 'Resurrecting, fiery avian beings' },
  { name: 'Pixie', description: 'Tiny, mischievous nature spirits' },
  { name: 'Porpoise', description: 'Intelligent, aquatic dolphins' },
  { name: 'Purple Worm', description: 'Enormous, burrowing earthworms' },
  { name: 'Quaggoth', description: 'Savage, subterranean humanoids' },
  { name: 'Quasit', description: 'Impish, chaotic demons' },
  { name: 'Raakshasa', description: 'Deceptive, fiendish shape-shifters who often appear as cat-like humanoids.' },
  { name: 'Rat', description: 'Small, common rodents' },
  { name: 'Dire Rat', description: 'Giant, disease-carrying rodents' },
  { name: 'Ravid', description: 'Energetic, aberrant creatures' },
  { name: 'Remorhaz', description: 'Huge, fiery centipede-like creatures' },
  { name: 'Retriever', description: 'Construct-like, demonic hunters' },
  { name: 'Roc', description: 'Gigantic, legendary avian creatures' },
  { name: 'Roper', description: 'Stalactite-like, cave-dwelling creatures' },
  { name: 'Rust Monster', description: 'Metal-corroding, insect-like creatures' },
  { name: 'Sahuagin', description: 'Aquatic, shark-like humanoids' },
  { name: 'Salamander', description: 'Fire-dwelling, elemental beings' },
  { name: 'Flamebrother', description: 'Fiery, cruel salamanders' },
  { name: 'Noble Salamander', description: 'Mighty and regal salamanders' },
  { name: 'Savage Species', description: 'Creatures of wild nature' },
  { name: 'Scorpionfolk', description: 'Scorpion-like humanoid creatures' },
  { name: 'Sea Cat', description: 'Aquatic, seafaring feline creatures' },
  { name: 'Sea Hag', description: 'Oceanic, cruel hags' },
  { name: 'Shadow', description: 'Dark, shadowy incorporeal beings' },
  { name: 'Shadow Mastiff', description: 'Shadowy, hound-like creatures' },
  { name: 'Shambling Mound', description: 'Plant-based, swampy creatures' },
  { name: 'Shield Guardian', description: 'Construct guardians of magic' },
  { name: 'Shocker Lizard', description: 'Electricity-charging reptiles' },
  { name: 'Skeleton', description: 'Undead, animated skeletal remains' },
  { name: 'Skum', description: 'Aquatic, fish-like humanoid creatures' },
  { name: 'Slaad', description: 'Chaotic, amphibious outsiders' },
  { name: 'Blue Slaad', description: 'Chaos-infused amphibians' },
  { name: 'Death Slaad', description: 'Lethal, chaos-spreading slaad' },
  { name: 'Gray Slaad', description: 'Mad, spellcasting slaad' },
  { name: 'Green Slaad', description: 'Frog-like, disease-spreading slaad' },
  { name: 'Red Slaad', description: 'Fire-breathing, destructive slaad' },
  { name: 'Solar', description: 'Radiant, celestial angelic beings' },
  { name: 'Spectre', description: 'Malevolent, ghostly undead' },
  { name: 'Sphinx', description: 'Riddle-posing, enigmatic creatures' },
  { name: 'Androsphinx', description: 'Noble, lion-headed sphinxes' },
  { name: 'Criosphinx', description: 'Ram-headed, cunning sphinxes' },
  { name: 'Gynosphinx', description: 'Elegant, human-headed sphinxes' },
  { name: 'Hieracosphinx', description: 'Hawk-headed, vigilant sphinxes' },
  { name: 'Spider Eater', description: 'Arachnid-hunting, tentacled creatures' },
  { name: 'Sprite', description: 'Tiny, playful nature spirits' },
  { name: 'Grig', description: 'Tiny, cricket-like sprites' },
  { name: 'Nixie', description: 'Aquatic, water-loving sprites' },
  { name: 'Pixie', description: 'Tiny, mischievous nature sprites' },
  { name: 'Sprite, Dark', description: 'Shadowy and secretive sprites' },
  { name: 'Sprite, Pixie, Pixie Queen', description: 'Mighty pixie monarch' },
  { name: 'Sprite, Sprite, Sea', description: 'Maritime, water-loving sprites' },
  { name: 'Sprite, Snow', description: 'Cold-dwelling, winter sprites' },
  { name: 'Sprite, Twigjack', description: 'Plant-like, forest sprites' },
  { name: 'Squid, Giant', description: 'Massive, oceanic cephalopods' },
  { name: 'Stegosaurus', description: 'Herbivorous, plated dinosaurs' },
  { name: 'Stirge', description: 'Blood-drinking, bat-like creatures' },
  { name: 'Tarrasque', description: 'Legendary, world-devouring creature' },
  { name: 'Thoon Hulk', description: 'Aberrant, tentacled monstrosities' },
  { name: 'Thri-Kreen', description: 'Insectoid, mantis-like humanoids' },
  { name: 'Titan', description: 'Mighty, giant celestial beings' },
  { name: 'Toad, Giant', description: 'Enormous, amphibious creatures' },
  { name: 'Treant', description: 'Majestic, ancient tree guardians' },
  { name: 'Troglodyte', description: 'Reptilian, subterranean humanoids' },
  { name: 'Troll', description: 'Regenerating, monstrous humanoids' },
  { name: 'Scrag', description: 'Aquatic trolls with seaweed-like hair' },
  { name: 'True Troll', description: 'Mighty, advanced troll variants' },
  { name: 'Umber Hulk', description: 'Subterranean, tunneling horrors' },
  { name: 'Vampire', description: 'Undead, blood-drinking immortals' },
  { name: 'Vampire, Vampire Spawn', description: 'Newly created vampires' },
  { name: 'Vampire, Vampire Lord', description: 'Mighty vampire rulers' },
  { name: 'Vampire, Nosferatu', description: 'Hideous, monstrous vampires' },
  { name: 'Vargouille', description: 'Fiendish, bat-like head creatures' },
  { name: 'Violet Fungus', description: 'Tentacle-laden fungal creatures' },
  { name: 'Vrock', description: 'Vulture-like, chaotic demons' },
  { name: 'Water Weird', description: 'Aquatic, elemental water spirits' },
  { name: 'Wight', description: 'Undead, life-draining creatures' },
  { name: 'Will-o\'-Wisp', description: 'Mysterious, flickering lights' },
  { name: 'Winter Wolf', description: 'Cold-breathing, wolf-like creatures' },
  { name: 'Worg', description: 'Giant, wolf-like creatures' },
  { name: 'Wraith', description: 'Spectral, life-draining undead' },
  { name: 'Wyvern', description: 'Winged, dragon-like creatures' },
  { name: 'Xorn', description: 'Earth-dwelling, elemental creatures' },
  { name: 'Zombie', description: 'Shambling, undead reanimated corpses' },
  { name: 'Zombie Lord', description: 'Powerful, necromantic undead lords' },
  { name: 'Zuggtmoy', description: 'Fungal Demon Queen' },
  { name: 'Hedrack', description: 'High Priest of the Elder Elemental Eye' },
  { name: 'Obmi', description: 'Duergar Weaponsmith' },
  { name: 'Ultraloth', description: 'Servants of the yugoloths' },
  { name: 'Balor', description: 'Demonic, fiery terror' },
  // Add more monster races here
];

// Define monster classes
const monsterClasses = [
  { name: 'Warrior', hp: '10 + 1d8', description: 'Skilled in combat' },
  { name: 'Shaman', hp: '10 + 1d6', description: 'Mystical spellcasters' },
  { name: 'Assassin', hp: '10 + 1d8', description: 'Stealthy killers' },
  { name: 'Knight of Atinus', baseHP: 10 },
  { name: 'Knight of Atricles', baseHP: 11 },
  { name: 'Knight of Urther', baseHP: 11 },
  { name: 'Knight of Poena', baseHP: 10 },
  { name: 'Knight of Atricles', baseHP: 11 },
  { name: 'Wizard', baseHP: 6 },
  { name: 'Witch', baseHP: 6 },
  { name: 'Necromancer', baseHP: 6 },
  { name: 'Warlock', baseHP: 6 },
  { name: 'Sorcerer', baseHP: 6 },
  { name: 'Thief', baseHP: 8 },
  { name: 'Barbarian', baseHP: 11 },

  // Add more monster classes here
];


function getRandomRace() {
  const randomIndex = Math.floor(Math.random() * characterRaces.length);
  return characterRaces[randomIndex];
}

function getRandomClass() {
  const randomIndex = Math.floor(Math.random() * characterClasses.length);
  return characterClasses[randomIndex];
}

function areItemsEqual(itemA, itemB) {
  // Compare items after trimming whitespace and converting to lowercase
  return itemA.trim().toLowerCase() === itemB.trim().toLowerCase();
}

// Define a global variable to store user input for character creation
let characterCreationInput = '';
let characterCreationStep = 0;
// Initialize charactersString
let charactersString = '';
// Initialize an array to store NPCs and Mortacia
let npcs = [];

// Function to initialize NPCs and Mortacia
function initializeNPCs() {
  // Create NPCs and Mortacia only if the npcs array is empty
  if (npcs.length === 0) {
    for (let i = 0; i < 5; i++) {
      const npc = createRandomNPC();
      npcs.push(npc);
    }

    // Create Mortacia
    const mortacia = createMortaciaNPC();
    npcs.push(mortacia);
  }
}

// Function to display the character creation menu
function displayCharacterCreationMenu(step) {
  switch (step) {
    case 1:
      return 'Step 1: Enter character name';
    case 2:
      return 'Step 2: Choose character sex (Male or Female)';
    case 3:
      return 'Step 3: Choose character race';
    case 4:
      return 'Step 4: Choose character class';
    case 5:
      return 'Press enter to begin the game in the Ruined Temple.';
    default:
      return 'Invalid character creation step';
  }
}




/*// Function to handle character creation
async function createCharacter(updatedUserInput, updatedUserWords) {
  // Local variables to store input for each step
  let stepUserInput = updatedUserInput;
  let stepUserWords = updatedUserWords;

  async function promptForInput(prompt) {
    displayMessage(prompt);

    // Use local variables within this function
    userInput = stepUserInput;
    userWords = stepUserWords;

    return userInput; // Return the input
  }
  
  if (characterCreationStep === 1){
      character.Name = updatedUserInput;

  }

  switch (characterCreationStep) {
    case 1:
          
     // character.Name = await promptForInput('Step 1: Enter character name');
      //characterCreationStep++;
     // break;
    case 2:
      character.Sex = await promptForInput('Step 2: Choose character sex (Male or Female)');
      //characterCreationStep++;
      break;
    case 3:
      character.Race = await promptForInput('Step 3: Choose character race (Enter the race number)');
      // Handle character's race selection

      // Display character's class selection as a single message
      let raceSelectionMessage = 'Choose character\'s race:\n';
      
      const raceIndex = parseInt(character.Race) - 1;
      const selectedRace = characterRaces[raceIndex];

      characterRaces.forEach((race, index) => {
        raceSelectionMessage += `${index + 1}) ${race.name} - ${race.description}\n`;
      });

      displayMessage(raceSelectionMessage);
      
      // Calculate character HP based on class
      calculateCharacterRace(character, selectedRace);
      //characterCreationStep++;
      break;
    case 4:
      character.Class = await promptForInput('Step 4: Choose character class (Enter the class number)');

      // Convert user input to class index (assuming user input is a valid class number)
      const classIndex = parseInt(character.Class) - 1;
      const selectedClass = characterClasses[classIndex];

      // Display character's class selection as a single message
      let classSelectionMessage = 'Choose character\'s class:\n';

      characterClasses.forEach((cls, index) => {
        classSelectionMessage += `${index + 1}) ${cls.name} - ${cls.description}\n`;
      });

      displayMessage(classSelectionMessage);
      
      // Calculate character HP based on class
      calculateCharacterHP(character, selectedClass);

      // Increment the character creation step here
      //characterCreationStep++;
      break;
    case 5:
      let beginGame = await promptForInput('Press enter to begin the game in the Ruined Temple.')
  }
  
  characterCreationStep++;

  // If character creation is complete, add the created character to the characters array
  if (characterCreationStep > 4) {
    characters.push(character);

    // Update charactersString with the new character data
    charactersString = characters.map((char, index) => {
      return `Character ${index + 1}:
        Name: ${char.Name}
        Sex: ${char.Sex}
        Race: ${char.Race}
        Class: ${char.Class}
        Level: ${char.Level}
        XP: ${char.XP}
        HP: ${char.HP}
        MaxHP: ${char.MaxHP}`;
    }).join('\n');

    // Reset characterCreationStep to 0 to indicate that character creation is complete
    characterCreationStep = 0;
  }

  // Return character, userInput, and userWords
  return { character, userInput, userWords };
}*/


// Function to check if character creation is in progress
function isCharacterCreationInProgress() {
  return characterCreationStep !== 0 && characterCreationStep < 5;
}
// Function to calculate character HP based on class
function calculateCharacterHP(character, selectedClass) {
  if (selectedClass && selectedClass.hp) {
    const hpRoll = Math.floor(Math.random() * 20) + 1; // Roll a 20-sided die
    const hpModifier = selectedClass.hp.match(/\d+/)[0]; // Extract the HP modifier from the class description
    character.Class = selectedClass.name;
    character.HP = eval(`${hpModifier} + ${hpRoll}`);
    character.MaxHP = character.HP;
  } else {
    // Handle the case where selectedClass or selectedClass.hp is undefined
    console.error("Invalid selectedClass:", selectedClass);
  }
}

// Function to calculate character HP based on class
function calculateCharacterRace(character, selectedRace, userInput) {
  character.Race = selectedRace.name;
}

// Function to create Mortacia character and add her to npcsString
function createMortaciaNPC() {
  // Calculate the initial HP value
  const initialHP = 120 + rollDice(20);

  const mortacia = {
    Name: 'Mortacia',
    Sex: 'Female',
    Race: 'Goddess',
    Class: 'Assassin-Fighter-Necromancer-Goddess',
    Level: 50,
    XP: 750000,
    HP: initialHP,
    MaxHP: initialHP, // Set MaxHP to the same value as HP
  };

  // Calculate NPC HP based on class
  //calculateCharacterHP(mortacia);
  return mortacia;

}

// ...

// Function to create Mortacia character
function createMortaciaCharacter() {
  // Calculate the initial HP value
  const initialHP = 120 + rollDice(20);

  const character = {
    Name: 'Mortacia',
    Sex: 'Female',
    Race: 'Goddess',
    Class: 'Assassin-Fighter-Necromancer-Goddess',
    Level: 50,
    XP: 750000,
    HP: initialHP,
    MaxHP: initialHP, // Set MaxHP to the same value as HP
    Equipped: [] // Initialize an array to store equipped items
  };

  // Add the character to the characters array
  characters.push(character);

  return character;
  return;
}

// Function to create Suzerain character
function createSuzerainCharacter() {
  // Calculate the initial HP value
  const initialHP = 80 + rollDice(20);
  const character = {
    Name: 'Suzerain',
    Sex: 'Male',
    Race: 'Human',
    Class: 'Knight of Atinus',
    Level: 25,
    XP: 375000,
    HP: initialHP, // HP = 80 + 1d20 hitpoints
    MaxHP: initialHP,
    Equipped: []// Max HP can be calculated if needed
  };

  // Add the character to the characters array
  characters.push(character);

  return character;
  return;
}

function rollDice(sides) {
  return Math.floor(Math.random() * sides) + 1;
}


// ...

// Function to handle the start menu and character creation
async function handleStartMenu(userInput) {

}

// Function to display a message in the chat log
function displayMessage(message) {
  let userInput = document.getElementById("chatuserinput").value;
  document.getElementById("chatuserinput").value = "";

  // Get the existing chat log
  const chatLog = document.getElementById("chatlog");
  const chatHistory = chatLog.innerHTML;

  let userWords = userInput.split(/\s+/).map(word => word.toLowerCase());

  // Update the chat log with the "Loading..." message below the existing content
  chatLog.innerHTML = chatHistory + "<br><br>Loading...";

  chatLog.innerHTML += "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
  scrollToBottom();
}

// Function to get a random integer between min and max (inclusive)
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Function to get a random sex (Male or Female)
function getRandomSex() {
  const sexes = ["Male", "Female"];
  const randomIndex = Math.floor(Math.random() * sexes.length);
  return sexes[randomIndex];
}

let monstersInRoom = [];

function generateMonsterName(sex) {
  // Define arrays of name components
  const prefixes = [
    "Gor", "Zog", "Thrak", "Skar", "Morg", "Drak", "Vor", "Xar", "Nar", "Grok",
    "Zur", "Krag", "Hark", "Grim", "Lurk", "Bor", "Snag", "Kor", "Ral", "Zar"
  ];

  const middleNames = [
    "na", "gul", "rok", "ash", "thok", "mok", "rak", "gok", "lug", "murg"
  ];

  const suffixes = [
    "or", "on", "ar", "og", "ok", "orak", "rak", "ur", "ogar", "krag", "rag", "lur"
  ];

  // Generate a random number of names (1 to 3)
  const numNames = getRandomInt(1, 3);

  // Initialize the name
  let name = "";

  // Generate each part of the name based on sex
  for (let i = 0; i < numNames; i++) {
    // Add a prefix
    name += prefixes[getRandomInt(0, prefixes.length - 1)];

    // If it's not the last name, add a middle name for variety
    if (i !== numNames - 1) {
      name += middleNames[getRandomInt(0, middleNames.length - 1)];

      // Add a space after each name except the last one
      name += " ";
    }
  }

  // Add a suffix
  name += suffixes[getRandomInt(0, suffixes.length - 1)];

  // If the sex is female, add a feminine-sounding suffix
  if (sex === "Female") {
    const feminineSuffixes = ["a", "ia", "ina"];
    name += feminineSuffixes[getRandomInt(0, feminineSuffixes.length - 1)];
  }

  return name;
}

function getRandomName(sex) {
  // Define arrays of name components
  const prefixes = [
    "Al", "Athr", "Aec", "Aed", "Aer", "Ba", "Da", "Fa", "Ga", "Ha", "Ja", "Ka", "La", "Ma", "Na", "Pa", "Qa", "Ra", "Sa", "Ta", "Ua", "Va", "Wa", "Xa", "Ya", "Za", "Be", "De", "Fe", "Ge", "He", "Je", "Ke", "Le", "Me", "Ne", "Pe", "Qe", "Re", "Se", "Te", "Ue", "Ve", "We", "Xe", "Ye", "Ze", "Bi", "Di", "Fi", "Gi", "Hi", "Ji", "Ki", "Li", "Mi", "Ni", "Pi", "Qi", "Ri", "Si", "Ti", "Ui", "Vi", "Wi", "Xi", "Yi", "Zi", "Bo", "Do", "Fo", "Go", "Ho", "Jo", "Ko", "Lo", "Mo", "No", "Po", "Qo", "Ro", "So", "To", "Uo", "Vo", "Wo", "Xo", "Yo", "Zo", "Bu", "Du", "Fu", "Gu", "Hu", "Ju", "Ku", "Lu", "Mu", "Nu", "Pu", "Qu", "Ru", "Su", "Tu", "Uu", "Vu", "Wu", "Xu", "Yu", "Zu", "By", "Dy", "Fy", "Gy", "Hy", "Jy", "Ky", "Ly", "My", "Ny", "Py", "Qy", "Ry", "Sy", "Ty", "Vy", "Wy", "Xy", "Zy", "Bre", "Beck", "Bel", "Ca", "Cat", "Cadre", "Dav", "Dra", "Drac", "Drag", "Draca", "El", "Thel", "Ar", "Bal", "Ber", "Cal", "Cael", "Dor", "Eil", "Fen", "Gael", "Hal", "Ili", "Kor", "Lan", "Mal", "Nel", "Ol", "Pra", "Plur", "Quin", "Ral", "Rom", "Romn", "Sel", "Tal", "Urm", "Var", "Vor", "Wil", "Xan", "Yel", "Zel", "Zal", "Xera", "Xena", "Zul", "Kaal", "Maal", "Now", "Jack", "Ver", "Gor", "Zog", "Thrak", "Skar", "Morg", "Drak", "Vor", "Xar", "Nar", "Grok", "Zur", "Krag", "Hark", "Grim", "Lurk", "Bor", "Snag", "Kor", "Ral", "Zar"
  ];

  const middleNames = [
    "a", "e", "i", "o", "u", "ae", "ei", "ea", "en", "in", "em", "ou", "ie", "oo", "ai", "al", "ui", "ul", "oi", "na", "gul", "rok", "ash", "thok", "mok", "rak", "gok", "lug", "murg"
  ];

  const suffixes = [
    "ar", "en", "on", "an", "or", "ir", "us", "ad", "el", "ell", "en", "em", "ia", "ius", "orin", "ius", "in", "ius", "th", "ius", "anor", "as", "elle", "len", "lyn", "ion", "ael", "aela", "ius", "tas", "or", "on", "ar", "og", "ok", "orak", "rak", "ur", "ogar", "krag", "rag", "lur"
  ];

  // Generate a random number of names (1 to 3)
  const numNames = getRandomInt(1, 3);

  // Initialize the name
  let name = "";

  // Generate each part of the name based on sex
  for (let i = 0; i < numNames; i++) {
    // Add a prefix
    name += prefixes[getRandomInt(0, prefixes.length - 1)];

    // If it's not the last name, add a middle name for variety
    if (i !== numNames - 1) {
      name += middleNames[getRandomInt(0, middleNames.length - 1)];

      // Add a space after each name except the last one
      name += " ";
    }
  }

  // Add a suffix
  name += suffixes[getRandomInt(0, suffixes.length - 1)];

  // If the sex is female, add a feminine suffix
  if (sex === "Female") {
    const feminineSuffixes = ["a", "ina", "elle", "aia", "ira"];
    name += feminineSuffixes[getRandomInt(0, feminineSuffixes.length - 1)];
  }

  return name;
}


// Function to create a random NPC character
function createRandomNPC() {
  const randomName = getRandomName(); // You need to define a function to generate random names
  const randomSex = getRandomSex(); // You need to define a function to generate random sexes
  const randomRaceIndex = Math.floor(Math.random() * characterRaces.length);
  const randomClassIndex = Math.floor(Math.random() * characterClasses.length);
  const randomRace = characterRaces[randomRaceIndex];
  const randomClass = characterClasses[randomClassIndex];
  const npc = {
    Name: randomName,
    Sex: randomSex,
    Race: randomRace.name,
    Class: randomClass.name,
    Level: 1,
    XP: 0,
  };
  // Calculate NPC HP based on class
  calculateCharacterHP(npc, randomClass);
  return npc;
}

// Define keywords to include
const includeKeywords = [
  "Coordinates:", "Exits:", "Objects in Room:", "Inventory:", "Turns:", // Add any other keywords you want to include
];

// Function to filter lines to include only those with the specified keywords
function includeOnlySpecifiedLines(text) {
  const lines = text.split('\n');
  const includedLines = lines.filter(line => includeKeywords.some(keyword => line.includes(keyword)));
  return includedLines.join('\n');
}
// Define keywords to exclude
/*const excludeKeywords = [ 
  "Seed:", "Room Description:", "Score:", "Artifacts Found:", "Quests Achieved:" , "PC:", "NPCs:", "Name:", "Sex:", "Race:", "Class:", "Level:", "XP:", "HP:", "MaxHP:", "Rooms Visited:", "Connected Rooms:"
];

// Assuming char is an object with properties
const char = {
  Name: "CharacterName",
  Sex: "CharacterSex",
  Race: "CharacterRace",
  Class: "CharacterClass"
};

// Extract property values and create an array to store variable values to exclude
const variablesToExclude = Object.values(char);

// Concatenate the two arrays
const allExcludedKeywords = excludeKeywords.concat(variablesToExclude);

// Function to remove lines with excluded keywords
function removeExcludedLines(text) {
  const lines = text.split('\n');
  const filteredLines = lines.filter(line => !allExcludedKeywords.some(keyword => line.includes(keyword)));
  return filteredLines.join('\n');
}*/

let gameMode = [];


const retort = require('retort-js').retort;

const run = require('retort-js').run;

// Function to process user input by sending it to the server
async function chatbotprocessinput(textin) {
  let userInput = document.getElementById("chatuserinput").value;
  document.getElementById("chatuserinput").value = "";
  var chatLog = document.getElementById("chatlog");
  // Get the existing chat log
  const chatHistory = chatLog.innerHTML;

  // Update the chat log with the "Loading..." message below the existing content
  chatLog.innerHTML = chatHistory + "<br><br>Loading...";

  // Generate a conversation ID or retrieve an existing one
  let conversationId = localStorage.getItem("conversationId");
  if (!conversationId) {
    conversationId = generateConversationId();
    localStorage.setItem("conversationId", conversationId);
  }

  // Retrieve all prompts and responses for the conversation from the database
  const promptAndResponses = await getPromptsAndResponsesForConversation(conversationId);


  // Check if the current room has been searched already
  const roomHistory = roomConversationHistories[coordinatesToString(currentCoordinates)];
  let userWords = userInput.split(/\s+/).map(word => word.toLowerCase());
  // Check if the user input is "search room"

  if (userWords.includes("search") && userWords.includes("room")) {
    // Filter out any other words except "search" and "room"
    const filteredWords = userWords.filter(word =>
      ["search", "room"].includes(word.toLowerCase())
    );

    // Replace userWords with the filtered words
    userWords.length = 0;
    userWords.push(...filteredWords);

    // Update userInput with the modified userWords
    userInput = userWords.join(" ");

    // Update the input field with the modified userInput
    document.getElementById("chatuserinput").value = userInput;
  } else if (["look", "investigate", "examine", "explore"].some(word =>
    userWords.includes(word)) && userWords.includes("room")) {
    // Replace synonymous words with "search" if "room" is present
    userWords[userWords.indexOf("room") - 1] = "search";
    userWords = userWords.filter(word =>
      ["search", "room"].includes(word.toLowerCase())
    );

    // Update userInput with the modified userWords
    userInput = userWords.join(" ");

    // Update the input field with the modified userInput
    document.getElementById("chatuserinput").value = userInput;
  }

  if (userWords.length >= 2 && userWords.slice(-2).join(" ").toLowerCase() === "search room") {

    if (roomHistory && roomHistory.some(entry => entry.prompts && entry.prompts.includes("search room"))) {
      // Room has already been searched, display a message and prevent further execution
      const message = "You have already searched this room.";
      chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
      scrollToBottom();
      return;
    }
  }

  // Extract the gameConsole data from the promptAndResponses array
  let gameConsoleData = null;
  for (let i = promptAndResponses.length - 1; i >= 0; i--) {
    if (promptAndResponses[i].gameConsole) {
      gameConsoleData = promptAndResponses[i].gameConsole;
      break;
    }
  }

  // If gameConsoleData is null, it means the gameConsole data was not found in the promptAndResponses
  // In this case, we'll assume that the gameConsole is at the end of the array
  if (!gameConsoleData && promptAndResponses.length > 0) {
    const lastItem = promptAndResponses[promptAndResponses.length - 1];
    gameConsoleData = lastItem.response || lastItem.systemPrompt || lastItem.personalNarrative || lastItem.assistantPrompt;
  }

  // Parse user input to check for valid directions
  const validDirections = ["north", "n", "south", "s", "east", "e", "west", "w", "northeast", "ne", "northwest", "nw", "southeast", "se", "southwest", "sw", "up", "u", "down", "d"];

  // Update the currentCoordinates with the new coordinates after the user input
  // Only update if there is a valid direction in the user input

  // Initialize the conversation history
  let conversationHistory = "";

  // Construct the conversation history string
  for (let i = 0; i < promptAndResponses.length; i++) {
    if (promptAndResponses[i].gameConsole) {
      conversationHistory += `${promptAndResponses[i].prompt}\n${promptAndResponses[i].response}\n${promptAndResponses[i].gameConsole}\n`;
    } else {
      conversationHistory += `${promptAndResponses[i].prompt}\n${promptAndResponses[i].response}\n`;
    }
  }

  let validDirection = validDirections.find(direction => userWords.includes(direction));

  gameConsoleData = null;
  let exitsMatch = null;

  let gameConsoleIndex = -1;


  for (let i = promptAndResponses.length - 1; i >= 0; i--) {
    if (promptAndResponses[i].gameConsole) {
      gameConsoleData = promptAndResponses[i].gameConsole;
      gameConsoleIndex = i; // Save the index of the game console in promptAndResponses
      exitsMatch = gameConsoleData.match(/Exits: ([^\n]+)/);
      if (exitsMatch) {
        break; // Found the most recent gameConsole with exits
      }
    }
  }

  let recentExits = [];
  if (exitsMatch) {
    recentExits = exitsMatch[1].split(", ");
  }
  if (validDirection) {
    if (recentExits.includes(validDirection)) {
      // Update the coordinates based on the valid direction
      currentCoordinates = generateCoordinates(currentCoordinates, validDirection, gameConsoleData);
    } else {
      // Respond with "You can't go that way."
      const message = "You can't go that way.";
      chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
      scrollToBottom();
      return; // Prevent further execution
    }
  }

  gameConsoleData = null;
  gameConsoleIndex = -1;
  let objectsInRoomMatch = [];
  for (let i = promptAndResponses.length - 1; i >= 0; i--) {
    if (promptAndResponses[i].gameConsole) {
      gameConsoleData = promptAndResponses[i].gameConsole;
      gameConsoleIndex = i; // Save the index of the game console in promptAndResponses
      objectsInRoomMatch = gameConsoleData.match(/Objects in Room: ([^\n]+)/) || []; // Ensure objectsInRoomMatch is an array
      if (objectsInRoomMatch.length > 0) {
        break; // Found the most recent gameConsole with "Objects in Room"
      }
    }
  }


  let objectsInRoomString = [];
  if (Array.isArray(objectsInRoomMatch) && objectsInRoomMatch.length > 1) {
    objectsInRoomString = objectsInRoomMatch[1].split(',').map(item => item.trim());
    // Split by comma and trim each item
  }

  console.log('objectsInRoomString:', objectsInRoomString);

  // ... previous code

  //    let character = null;
  // Construct a string to represent all characters in the characters array
  // Inside the updateGameConsole function
  let charactersString = characters.map((char, index) => {
    let equippedItems = []; // Get the equipped items
    if (equippedItems.length < 1) {
      equippedItems = "None"; // Add "Equipped" prefix
    }
    return `
    Name: ${char.Name}
    Sex: ${char.Sex}
    Race: ${char.Race}
    Class: ${char.Class}
    Level: ${char.Level}
    XP: ${char.XP}
    HP: ${char.HP}
    MaxHP: ${char.MaxHP}
    Equipped: ${equippedItems}`; // Include the "Equipped" items in the string
  }).join('\n');

  // Define updatedUserInput and updatedUserWords
  let updatedUserInput = userInput;
  let updatedUserWords = userWords.slice(); // Copy the userWords array to avoid modifying the original

  let raceIndex = parseInt(character.Race) - 1;
  let selectedRace = characterRaces[raceIndex];
  let classIndex = parseInt(character.Class) - 1;
  let selectedClass = characterClasses[classIndex];

  // Check if a character creation is requested
  if (userWords[0] === "3" && charactersString.length <= 0) {
    // Check if character creation is already in progress
    if (!isCharacterCreationInProgress()) {
      // Start character creation by setting characterCreationStep to 1
      characterCreationStep = 1;
      displayMessage('Step 1: Enter character name'); // Display the first step
      console.log('charactersString:', charactersString);
      console.log('character:', character);
      return;
    }
  }


  // Check if a character creation is requested
  if (userWords[0] === "3" && charactersString.length <= 0) {
    // Check if character creation is already in progress
    if (!isCharacterCreationInProgress()) {
      // Start character creation by setting characterCreationStep to 1
      characterCreationStep = 1;
      displayMessage('Step 1: Enter character name'); // Display the first step
      console.log('charactersString:', charactersString);
      console.log('character:', character);
      return;
    }
  }

  // If character creation is in progress, continue it
  if (isCharacterCreationInProgress()) {
    // Use characterCreationStep to determine which step to execute
    switch (characterCreationStep) {
      case 1:
        character.Name = userInput;
        displayMessage('Step 2: Choose character sex (Male or Female)');
        characterCreationStep++;
        break;
      case 2:
        character.Sex = userInput;
        displayMessage('Step 3: Choose character race (Enter the race number)');

        // Display character's class selection as a single message
        let raceSelectionMessage = 'Choose character\'s race:\n';

        characterRaces.forEach((race, index) => {
          raceSelectionMessage += `${index + 1}) ${race.name} - ${race.description}\n`;
        });

        displayMessage(raceSelectionMessage);

        characterCreationStep++;
        break;
      case 3:
        character.Race = userInput; // Set the user's input as the character's race
        raceIndex = parseInt(character.Race) - 1;
        selectedRace = characterRaces[raceIndex];

        // Now that selectedRace is defined, call calculateCharacterRace
        calculateCharacterRace(character, selectedRace);

        // Convert user input to class index (assuming user input is a valid class number)
        // Display character's class selection as a single message
        let classSelectionMessage = 'Choose character\'s class:\n';

        characterClasses.forEach((cls, index) => {
          classSelectionMessage += `${index + 1}) ${cls.name} - ${cls.description}\n`;
        });

        displayMessage(classSelectionMessage);

        characterCreationStep++;
        break;
      case 4:
        character.Class = userInput;
        classIndex = parseInt(character.Class) - 1;
        selectedClass = characterClasses[classIndex];
        // Calculate character HP based on class
        calculateCharacterHP(character, selectedClass);
        // Character creation is complete, add the created character to the characters array
        characters.push(character);


      case 5:

        // Update charactersString with the new character data
        charactersString = characters.map((char, index) => {
          let equippedItems = []; // Get the equipped items
          if (equippedItems.length < 1) {
            equippedItems = "None"; // Add "Equipped" prefix
          }
          return `
            Name: ${char.Name}
            Sex: ${char.Sex}
            Race: ${char.Race}
            Class: ${char.Class}
            Level: ${char.Level}
            XP: ${char.XP}
            HP: ${char.HP}
            MaxHP: ${char.MaxHP}
            Equipped: ${equippedItems}`;
        }).join('\n');

        if (characters.length === 1) {
          // Player wants to add NPCs to the party
          //       const npcs = []; // Array to store NPCs

          //       for (let i = 0; i < 5; i++) {
          //          const npc = createRandomNPC();
          //          npcs.push(npc);
          //        }

          // Create Mortacia
          //        const mortacia = createMortaciaNPC();
          //       npcs.push(mortacia);

          // Call initializeNPCs once at the start of the game to populate the NPCs and Mortacia
          initializeNPCs();

          const npcsString = npcs.map((char, index) => {
            return `
      Name: ${char.Name}
      Sex: ${char.Sex}
      Race: ${char.Race}
      Class: ${char.Class}
      Level: ${char.Level}
      XP: ${char.XP}
      HP: ${char.HP}
      MaxHP: ${char.MaxHP}`;
          }).join('\n');

          // Notify the user that NPCs have been added
          displayMessage('5 NPCs and Mortacia have joined your party.');

          // Include NPCs in charactersString
          charactersString += '\n' + npcs.map((char, index) => {
            return `NPC ${index + 1}:
            Name: ${char.Name}
            Sex: ${char.Sex}
            Race: ${char.Race}
            Class: ${char.Class}
            Level: ${char.Level}
            XP: ${char.XP}
            HP: ${char.HP}
            MaxHP: ${char.MaxHP}`;
          }).join('\n');
        }

        // Reset characterCreationStep to 0 to indicate that character creation is complete
        characterCreationStep = 0;

        // Inform the user that character creation is complete
        displayMessage('Character creation is complete. Press enter to begin the game in the Ruined Temple.');
        userInput = "Begin game with chosen character."
        break;
    }
    console.log('charactersString:', charactersString);
    console.log('character:', character);
    return;
  }

  gameConsoleData = null;
  gameConsoleIndex = -1;
  objectsInRoomMatch = [];
  for (let i = promptAndResponses.length - 1; i >= 0; i--) {
    if (promptAndResponses[i].gameConsole) {
      gameConsoleData = promptAndResponses[i].gameConsole;
      gameConsoleIndex = i; // Save the index of the game console in promptAndResponses
      objectsInRoomMatch = gameConsoleData.match(/Objects in Room: ([^\n]+)/) || []; // Ensure objectsInRoomMatch is an array
      if (objectsInRoomMatch.length > 0) {
        break; // Found the most recent gameConsole with "Objects in Room"
      }
    }
  }


  objectsInRoomString = [];
  if (Array.isArray(objectsInRoomMatch) && objectsInRoomMatch.length > 1) {
    objectsInRoomString = objectsInRoomMatch[1].split(',').map(item => item.trim());
    // Split by comma and trim each item
  }

  if (userWords[0] === "start") {
    userInput = document.getElementById("chatuserinput").value;
    document.getElementById("chatuserinput").value = "";
    let character = null;
    let startMenuOption = null;

    // Display the start menu options in the chat log
    displayMessage('Start Menu: \n \n 1) Play as Mortacia, goddess of death. \n 2) Play as Suzerain, knight of Atinus. \n 3) Create character and play as a party of 7 adventurers. \n');

    // Handle the player's choice from the start menu
    switch (userInput) {
      case '1':
        userInput = document.getElementById("chatuserinput").value;
        document.getElementById("chatuserinput").value = "";
        startMenuOption = 'Mortacia';
        character = await createCharacter('1'); // Handle Mortacia character creation
        userWords = "";
        userInput = "";
        break;
        return;
      case '2':
        userInput = document.getElementById("chatuserinput").value;
        document.getElementById("chatuserinput").value = "";
        startMenuOption = 'Suzerain';
        character = await createCharacter('2'); // Handle Suzerain character creation
        userWords = "";
        userInput = "";
        break;
        return;
      case '3':
        userInput = document.getElementById("chatuserinput").value;
        document.getElementById("chatuserinput").value = "";
        startMenuOption = 'Create Character';
        character = await createCharacter('3'); // Handle character creation for a party of adventurers
        startMenuOption = null;
        userWords = "";
        userInput = "";
        break;
        return;
    }

    // Once character creation is complete, you can proceed with the game
    displayMessage(`You chose to ${startMenuOption}.`);

    // Return the created character
    return character;
  }



  if (userWords.length > 1 && userWords[0] === "take") {
    const itemsToTake = userWords.slice(1).join(" ");

    if (itemsToTake.toLowerCase() === "all") {
      const newAdditionalEquipment = updateGameConsole(userInput, currentCoordinates, conversationHistory);
      // Handle taking specific items as before (comma or "and" separated)
      const itemsToTakeArray = itemsToTake.split(/, | and /); // Split by comma or "and"

      // Find the matching console in promptAndResponses
      const matchingConsoleData = promptAndResponses[gameConsoleIndex].gameConsole;

      let combinedEquipment = updateGameConsole(userInput, currentCoordinates, conversationHistory);
      console.log('combinedEquipment:', combinedEquipment);

      // Extract the "Objects in Room" part from combinedEquipment
      objectsInRoomString = combinedEquipment.match(/Objects in Room: ([^\n]+)/);
      if (objectsInRoomString) {
        objectsInRoomString = objectsInRoomString[1];
      } else {
        objectsInRoomString = "None"; // Set a default value if "Objects in Room" is not found
      }

      // Split objectsInRoomString into an array of items
      let itemsInRoom = objectsInRoomString.split(', ').map(item => item.trim());
      console.log('itemsInRoom:', itemsInRoom);

      if (objectsInRoomString.trim().toLowerCase() === "none" || !objectsInRoomString) {
        const message = `The room is empty.`;
        chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
        scrollToBottom();
        return; // Prevent further execution
      }

      // Take all items in the room
      if (objectsInRoomString || itemsInRoom) {
        // Get newAdditionalEquipment from updateGameConsole

        // Check if all items can be taken
        const canTakeAllItems = itemsInRoom.every(item => {
          return inventory.includes(item) || newAdditionalEquipment.includes(item);
        });

        if (canTakeAllItems) {
          // Update inventory
          inventory.push(...itemsInRoom);

          inventory = removeNoneFromInventory(inventory);

          // Remove taken items from combinedEquipment
          combinedEquipment = combinedEquipment
            .split(/Objects in Room: ([^\n]+)/)
            .map(part => {
              if (part.includes("Objects in Room:")) {
                // Filter and join the remaining items
                const remainingItems = itemsInRoom.join(', ');
                return `Objects in Room: ${remainingItems}`;
              }
              return part;
            })
            .join('');

          if (itemsInRoom.length === 0) {
            objectsInRoomString = "None"; // Set to "None" when there are no items left
          }

          console.log('objectsInRoomString:', objectsInRoomString);

          // Update room equipment in the room's conversation history
          const roomHistory = roomConversationHistories[coordinatesToString(currentCoordinates)];

          if (roomHistory) {
            // Use the getFirstResponseForRoom function to get the first response
            const firstResponseForRoom = getFirstResponseForRoom(currentCoordinates);

            if (firstResponseForRoom) {
              // Remove sentences that mention the taken items from the first response
              itemsInRoom.forEach(item => {
                firstResponseForRoom.response = firstResponseForRoom.response.replace(new RegExp(`\\b${item}\\b`, 'gi'), '');
              });

              // Update itemsInRoom and remove taken items
              itemsInRoom = itemsInRoom.filter(item => !inventory.includes(item));

              // Update the game console data with the modified "Objects in Room"
              let updatedGameConsole = gameConsoleData.replace(
                /Objects in Room: ([^\n]+)/,
                `Objects in Room: ${itemsInRoom.join(', ')}`
              );

              // Update the promptAndResponses array with the modified game console data
              promptAndResponses[gameConsoleIndex].gameConsole = updatedGameConsole;

              // Update the conversation history with the modified game console data
              conversationHistory = conversationHistory.replace(gameConsoleData, updatedGameConsole);

              // Remove taken items from combinedEquipment
              combinedEquipment = combinedEquipment.replace(new RegExp(`\\b${itemsInRoom.join('\\b|\\b')}\\b`, 'gi'), '');

              itemsInRoom = itemsInRoom.length > 0 ? itemsInRoom : ["None"];
              console.log('itemsInRoom:', itemsInRoom);

              // Combine the game console, conversation history, and user input
              const combinedHistory = conversationHistory + "\n" + userInput;

              // Perform dynamic search using the Sentence Transformer model
              let personalNarrative = await performDynamicSearch(combinedHistory);

              // Construct the input message, including the previous response if it exists
              const messages = [
                { role: "assistant", content: "" },
                { role: "system", content: "" },
                { role: "user", content: userInput }
              ];

              const message = `Taken.`;
              chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
              scrollToBottom();
              // Add the user input, assistant prompt, system prompt, AI response, and personal narrative to the IndexedDB
              addPromptAndResponse(userInput, messages[0].content, messages[1].content, message, personalNarrative, conversationId, updatedGameConsole);
              // Pass the updated game console to the database
              // Update the game console based on user inputs and get the updated game console
              updatedGameConsole = updateGameConsole(userInput, currentCoordinates, conversationHistory, itemsInRoom.join(', '));
              conversationHistory = conversationHistory + "\n" + updatedGameConsole;
              console.log("Game Console:", updatedGameConsole);
              console.log('itemsInRoom:', itemsInRoom);
              turns++;
              return;
            }
          }
        }
      }
    } else {
      // Handle taking specific items as before (comma or "and" separated)
      const itemsToTakeArray = itemsToTake.split(/, | and /).map(item => item.trim()); // Split by comma or "and"

      // Find the matching console in promptAndResponses
      const matchingConsoleData = promptAndResponses[gameConsoleIndex].gameConsole;
      let newAdditionalEquipment = updateGameConsole(userInput, currentCoordinates, conversationHistory);
      let combinedEquipment = updateGameConsole(userInput, currentCoordinates, conversationHistory);
      console.log('combinedEquipment:', combinedEquipment);

      // Extract the "Objects in Room" part from combinedEquipment
      let objectsInRoomString = combinedEquipment.match(/Objects in Room: ([^\n]+)/);

      if (objectsInRoomString) {
        objectsInRoomString = objectsInRoomString[1].split(',').map(item => item.trim());
      } else {
        objectsInRoomString = ["None"]; // Set a default value if "Objects in Room" is not found
      }
      let itemsInRoom = objectsInRoomString.join(', ').split(', ').map(item => item.trim()); // Establish itemsInRoom

      console.log('itemsInRoom:', itemsInRoom);

      const invalidItems = itemsToTakeArray.filter(itemToTake => {
        return !itemsInRoom.includes(itemToTake);
      });

      // Check if any of the items in itemsToTakeArray are already in the inventory
      const itemsAlreadyInInventory = itemsToTakeArray.filter(item => inventory.includes(item));

      if (!itemsInRoom.some(item => itemsToTakeArray.includes(item)) && itemsAlreadyInInventory.length > 0) {
        const message = `You already have the ${itemsAlreadyInInventory.join(' and ')} in your inventory.`;
        chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
        scrollToBottom();
        return; // Prevent further execution
      }

      if (invalidItems.length > 0) {
        const message = `There is no ${invalidItems.join(' and ')} here.`;
        chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
        scrollToBottom();
        return; // Prevent further execution
      }

      console.log('itemsInRoom:', itemsInRoom);

      console.log('roomEquipment:', roomEquipment);
      console.log('objectsInRoomString:', objectsInRoomString);

      if (itemsInRoom.some(item => itemsToTakeArray.includes(item)) || newAdditionalEquipment.some(item => itemsToTakeArray.includes(item))) {
        // Get newAdditionalEquipment from updateGameConsole

        // Remove taken items from "Objects in Room"
        itemsToTakeArray.forEach(item => {
          itemsInRoom = itemsInRoom.filter(roomItem => !itemsToTakeArray.includes(roomItem));
          objectsInRoomString = objectsInRoomString.filter(roomItem => !roomItem.includes(item.trim()));
        });

        // Check if there are items left in combinedEquipment
        if (combinedEquipment.length === 0) {
          itemsInRoom = ["None"]; // Set to "None" when there are no items left
        }

        console.log('itemsInRoom:', itemsInRoom);

        // Update inventory and room equipment
        inventory.push(...itemsToTakeArray);

        inventory = removeNoneFromInventory(inventory);

        // Update room equipment in the room's conversation history
        const roomHistory = roomConversationHistories[coordinatesToString(currentCoordinates)];
        if (roomHistory) {
          // Use the getFirstResponseForRoom function to get the first response
          const firstResponseForRoom = getFirstResponseForRoom(currentCoordinates);

          if (firstResponseForRoom) {
            // Remove the sentence that mentions the taken items from the first response
            itemsToTakeArray.forEach(item => {
              firstResponseForRoom.response = firstResponseForRoom.response.replace(new RegExp(`\\b${item}\\b`, 'gi'), '');
            });

            // Update the game console data with the modified "Objects in Room"
            let updatedGameConsole = gameConsoleData.replace(
              /Objects in Room: ([^\n]+)/,
              `Objects in Room: ${objectsInRoomString.join(', ')}`
            );

            // Update the promptAndResponses array with the modified game console data
            promptAndResponses[gameConsoleIndex].gameConsole = updatedGameConsole;

            // Update the conversation history with the modified game console data
            conversationHistory = conversationHistory.replace(gameConsoleData, updatedGameConsole);

            // Combine the game console, conversation history, and user input
            const combinedHistory = conversationHistory + "\n" + userInput;

            // Perform dynamic search using the Sentence Transformer model
            let personalNarrative = await performDynamicSearch(combinedHistory);

            // Construct the input message, including the previous response if it exists
            const messages = [
              { role: "assistant", content: "" },
              { role: "system", content: "" },
              { role: "user", content: userInput }
            ];

            const message = `Taken.`;
            chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
            scrollToBottom();
            // Add the user input, assistant prompt, system prompt, AI response, and personal narrative to the IndexedDB
            addPromptAndResponse(userInput, messages[0].content, messages[1].content, message, personalNarrative, conversationId, updatedGameConsole);

            // Update the game console based on user inputs and get the updated game console
            updatedGameConsole = updateGameConsole(userInput, currentCoordinates, conversationHistory, objectsInRoomString);
            conversationHistory = conversationHistory + "\n" + updatedGameConsole;
            console.log("Game Console:", updatedGameConsole);
            turns++;
            return;
          }
        }
      }
    }
  }

  gameConsoleData = null;
  gameConsoleIndex = -1;
  objectsInRoomMatch = [];
  for (let i = promptAndResponses.length - 1; i >= 0; i--) {
    if (promptAndResponses[i].gameConsole) {
      gameConsoleData = promptAndResponses[i].gameConsole;
      gameConsoleIndex = i; // Save the index of the game console in promptAndResponses
      objectsInRoomMatch = gameConsoleData.match(/Objects in Room: ([^\n]+)/) || []; // Ensure objectsInRoomMatch is an array
      if (objectsInRoomMatch.length > 0) {
        break; // Found the most recent gameConsole with "Objects in Room"
      }
    }
  }


  objectsInRoomString = [];
  if (Array.isArray(objectsInRoomMatch) && objectsInRoomMatch.length > 1) {
    objectsInRoomString = objectsInRoomMatch[1].split(',').map(item => item.trim());
    // Split by comma and trim each item
  }

  console.log('objectsInRoomString:', objectsInRoomString);

  if (userWords.length > 1 && userWords[0] === "drop") {
    const itemsToDrop = userWords.slice(1).join(" ");
    const itemsToDropArray = itemsToDrop.split(/, | and /); // Split by comma or "and"

    const invalidItems = itemsToDropArray.filter(item => {
      return !inventory.includes(item);
    });

    // Find the matching console in promptAndResponses
    const matchingConsoleData = promptAndResponses[gameConsoleIndex].gameConsole;

    if (itemsToDrop.toLowerCase() === "all") {
      if (!inventory.length) {
        const message = `Your inventory is empty.`;
        chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
        scrollToBottom();
        return;
      }

      // Exclude the word "all" from itemsToDropArray
      const itemsToDropExcludingAll = itemsToDropArray.filter(item => item.toLowerCase() !== "all");

      // Check if objectsInRoomString is an array or a string
      if (Array.isArray(objectsInRoomString)) {
        objectsInRoomString = objectsInRoomString.join(", ");
      }

      // Append all items in inventory to objectsInRoomString
      if (itemsToDropExcludingAll.length > 0) {
        if (typeof objectsInRoomString === "string") {
          objectsInRoomString += ", " + itemsToDropExcludingAll.join(", ");
        } else {
          objectsInRoomString = itemsToDropExcludingAll.join(", ");
        }
      }

      if (inventory.length > 0) {
        if (typeof objectsInRoomString === "string") {
          objectsInRoomString += ", " + inventory.join(", ");
        } else {
          objectsInRoomString = inventory.join(", ");
        }
      }

      // Update the game console data with the modified "Objects in Room"
      let updatedGameConsole = gameConsoleData.replace(
        /Objects in Room: ([^\n]+)/,
        `Objects in Room: ${objectsInRoomString}`
      );

      // Update the promptAndResponses array with the modified game console data
      promptAndResponses[gameConsoleIndex].gameConsole = updatedGameConsole;

      // Update the conversation history with the modified game console data
      conversationHistory = conversationHistory.replace(gameConsoleData, updatedGameConsole);

      inventory = []; // Clear the inventory

      if (typeof objectsInRoomString === "string") {
        itemsInRoom = objectsInRoomString.split(', ').map(item => item.trim());
      } else {
        itemsInRoom = ["None"];
      }

      // Combine the game console, conversation history, and user input
      const combinedHistory = conversationHistory + "\n" + userInput;

      // Perform dynamic search using the Sentence Transformer model
      let personalNarrative = await performDynamicSearch(combinedHistory);

      // Construct the input message, including the previous response if it exists
      const messages = [
        { role: "assistant", content: "" },
        { role: "system", content: "" },
        { role: "user", content: userInput }
      ];

      const message = `Dropped.`;
      chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
      scrollToBottom();
      // Add the user input, assistant prompt, system prompt, AI response, and personal narrative to the IndexedDB
      addPromptAndResponse(userInput, messages[0].content, messages[1].content, message, personalNarrative, conversationId, updatedGameConsole);
      // Pass the updated game console to the database
      // Update the game console based on user inputs and get the updated game console
      updatedGameConsole = updateGameConsole(userInput, currentCoordinates, conversationHistory, objectsInRoomString);
      conversationHistory = conversationHistory + "\n" + updatedGameConsole;
      console.log("Game Console:", updatedGameConsole);
      console.log('itemsInRoom:', itemsInRoom);
      turns++;
      return;
    } else {
      if (inventory.some(item => itemsToDropArray.includes(item))) {
        inventory = inventory.filter(item => !itemsToDropArray.includes(item));

        if (invalidItems.length > 0) {
          const message = `You don't have the ${invalidItems.join(", ")}.`;
          chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
          scrollToBottom();
          return;
        }

        // Check if objectsInRoomString is ["None"] and update it accordingly
        if (objectsInRoomString.length === 1 && objectsInRoomString[0] === "None") {
          objectsInRoomString = itemsToDropArray.slice(); // Make a copy
        } else {
          // Update objectsInRoomString to include the dropped items
          itemsToDropArray.forEach(item => {
            if (!objectsInRoomString.includes(item)) {
              objectsInRoomString.push(item);
            }
          });
        }

        // Update the game console data with the modified "Objects in Room"
        let updatedGameConsole = gameConsoleData.replace(
          /Objects in Room: ([^\n]+)/,
          `Objects in Room: ${objectsInRoomString.join(', ')}`
        );

        // Update the promptAndResponses array with the modified game console data
        promptAndResponses[gameConsoleIndex].gameConsole = updatedGameConsole;

        // Update the conversation history with the modified game console data
        conversationHistory = conversationHistory.replace(gameConsoleData, updatedGameConsole);

        itemsInRoom = objectsInRoomString;

        // Combine the game console, conversation history, and user input
        const combinedHistory = conversationHistory + "\n" + userInput;

        // Perform dynamic search using the Sentence Transformer model
        let personalNarrative = await performDynamicSearch(combinedHistory);

        // Construct the input message, including the previous response if it exists
        const messages = [
          { role: "assistant", content: "" },
          { role: "system", content: "" },
          { role: "user", content: userInput }
        ];

        const message = `Dropped.`;
        chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
        scrollToBottom();

        // Add the user input, assistant prompt, system prompt, AI response, and personal narrative to the IndexedDB
        addPromptAndResponse(userInput, messages[0].content, messages[1].content, message, personalNarrative, conversationId, updatedGameConsole);

        // Pass the updated game console to the database
        // Update the game console based on user inputs and get the updated game console
        updatedGameConsole = updateGameConsole(userInput, currentCoordinates, conversationHistory, objectsInRoomString);
        conversationHistory = conversationHistory + "\n" + updatedGameConsole;
        console.log("Game Console:", updatedGameConsole);
        console.log('itemsInRoom:', itemsInRoom);
        turns++;
        return;
      }
    }
  }

  // Check if the user input contains "ready" or "equip" followed by an item
  const equipPattern = /^(ready|equip)\s+(.+)/i;
  const equipMatch = userInput.match(equipPattern);

  if (equipMatch) {
    const equipAction = equipMatch[1].toLowerCase();
    const equipItem = equipMatch[2].toLowerCase();

    // Check if the equipItem is in the player's inventory
    if (inventory.includes(equipItem)) {
      // Remove the item from the inventory
      inventory = inventory.filter(item => item !== equipItem);

      // Add the item to the equipped inventory
      equippedInventory.push(equipItem);

      // Add the item to the equipped section of the character
      characters[0].Equipped.push(equipItem);

      let updatedGameConsole = gameConsoleData;
      // Update the promptAndResponses array with the modified game console data
      promptAndResponses[gameConsoleIndex].gameConsole = updatedGameConsole;

      // Update the conversation history with the modified game console data
      conversationHistory = conversationHistory.replace(gameConsoleData, updatedGameConsole);

      itemsInRoom = objectsInRoomString;

      // Combine the game console, conversation history, and user input
      const combinedHistory = conversationHistory + "\n" + userInput;

      // Perform dynamic search using the Sentence Transformer model
      let personalNarrative = await performDynamicSearch(combinedHistory);

      // Construct the input message, including the previous response if it exists
      const messages = [
        { role: "assistant", content: "" },
        { role: "system", content: "" },
        { role: "user", content: userInput }
      ];

      const message = `\nYou have ${equipAction}ped the ${equipItem}.\n`;
      chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
      scrollToBottom();

      // Add the user input, assistant prompt, system prompt, AI response, and personal narrative to the IndexedDB
      addPromptAndResponse(userInput, messages[0].content, messages[1].content, message, personalNarrative, conversationId, updatedGameConsole);

      // Pass the updated game console to the database
      // Update the game console based on user inputs and get the updated game console
      // Update the game console with a message
      conversationHistory += `\nYou have ${equipAction}ped the ${equipItem}.\n`;
      updatedGameConsole = updateGameConsole(userInput, currentCoordinates, conversationHistory, objectsInRoomString);
      conversationHistory = conversationHistory + "\n" + updatedGameConsole;
      console.log("Game Console:", updatedGameConsole);
      console.log('itemsInRoom:', itemsInRoom);
      turns++;
      return;
    } else {

      let updatedGameConsole = gameConsoleData;

      // Update the promptAndResponses array with the modified game console data
      promptAndResponses[gameConsoleIndex].gameConsole = updatedGameConsole;

      // Update the conversation history with the modified game console data
      conversationHistory = conversationHistory.replace(gameConsoleData, updatedGameConsole);

      itemsInRoom = objectsInRoomString;

      // Combine the game console, conversation history, and user input
      const combinedHistory = conversationHistory + "\n" + userInput;

      // Perform dynamic search using the Sentence Transformer model
      let personalNarrative = await performDynamicSearch(combinedHistory);

      // Construct the input message, including the previous response if it exists
      const messages = [
        { role: "assistant", content: "" },
        { role: "system", content: "" },
        { role: "user", content: userInput }
      ];

      const message = `\nYou don't have ${equipItem} in your inventory.\n`;
      chatLog.innerHTML = chatHistory + "<br><br><b> > </b>" + userInput + "<br><br><b></b>" + message.replace(/\n/g, "<br>");
      scrollToBottom();

      // Add the user input, assistant prompt, system prompt, AI response, and personal narrative to the IndexedDB
      addPromptAndResponse(userInput, messages[0].content, messages[1].content, message, personalNarrative, conversationId, updatedGameConsole);

      // Pass the updated game console to the database
      // Update the game console based on user inputs and get the updated game console
      // Update the game console with a message
      // Update the game console with an error message
      conversationHistory += `\nYou don't have ${equipItem} in your inventory.\n`;
      updatedGameConsole = updateGameConsole(userInput, currentCoordinates, conversationHistory, objectsInRoomString);
      conversationHistory = conversationHistory + "\n" + updatedGameConsole;
      console.log("Game Console:", updatedGameConsole);
      console.log('itemsInRoom:', itemsInRoom);
      turns++;
      return;
    }
  }

  // Assuming the user input is a number
  const userInputNumber = parseInt(userInput);

  // Check if the user input is 1, 2, or 3 and charactersString is less than 1 in length
  if ((userInputNumber === 1 || userInputNumber === 2 || userInputNumber === 3) && charactersString.length < 1) {
    // Construct the input message
    const messages = [
      { role: "assistant", content: "" },
      { role: "system", content: "" },
      { role: "user", content: userInput + "You chose option" + userInput + "." }
    ];

    // Add the user input to the prompts and responses in the database
    addPromptAndResponse(userInput, messages[0].content, messages[1].content, "", "", conversationId, "");

    // Log to the console for debugging purposes
    console.log("User input added to the database:", userInput);

  }
  // Update the game console based on user inputs and get the updated game console
  let updatedGameConsole = updateGameConsole(userInput, currentCoordinates, conversationHistory, objectsInRoomString);
  console.log('updatedGameConsole:', updatedGameConsole);

  conversationHistory = conversationHistory + "\n" + updatedGameConsole;

  // Combine the game console, conversation history, and user input
  const combinedHistory = conversationHistory + "\n" + userInput;

  // Perform dynamic search using the Sentence Transformer model
  let personalNarrative = await performDynamicSearch(combinedHistory);

  const messages = [
    { role: "assistant", content: "" },
    { role: "system", content: "" },
    { role: "user", content: userInput }
  ];

  //   var userInput = $('#chatuserinput').val(); // Get user input
  $.ajax({
    url: 'http://childrenofthegrave.com/processInput', // Adjust this URL to your server's endpoint
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ userInput: userInput }), // Send user input

    success: function (response) {
      // Directly access the 'content' part of the response
      var content = response.response.content; // Adjust this based on the actual structure
      // Add the personal narrative to the latest response (system prompt)
      if (personalNarrative) {
        response.response.content;
      }

      console.log(content); // If you want to check the response as JSON
      // Add the user input, assistant prompt, system prompt, AI response, and personal narrative to the IndexedDB
      addPromptAndResponse(userInput, messages[0].content, messages[1].content, response.response.content, personalNarrative, conversationId, updatedGameConsole);
      // Update the game console based on user inputs and get the updated game console
      updatedGameConsole = updateGameConsole(userInput, currentCoordinates, conversationHistory, objectsInRoomString);
      conversationHistory = conversationHistory + "\n" + updatedGameConsole;
      turns++;

      // Apply the function to filter the lines you want to include
      const formattedUpdatedGameConsole = includeOnlySpecifiedLines(updatedGameConsole);
      console.log('formattedUpdatedGameConsole:', formattedUpdatedGameConsole);

      // Replace "\n" with "<br>" for line breaks
      const formattedConsoleWithLineBreaks = formattedUpdatedGameConsole.replace(/\n/g, "<br>");

      // Replace '\n' with '<br>' for correct HTML display
      var formattedContent = content.replace(/\n/g, '<br>');

      // Update chat log with the formatted content
      updateChatLog("<br><br><b> > </b>" + userInput + "<br><br><b></b>" + formattedContent + "<br><br>" + formattedConsoleWithLineBreaks);

      // Clear the user input field
      document.getElementById("chatuserinput").value = "";
    },

    error: function (error) {
      console.log('Error:', error);
      updateChatLog("<br><b>Error:</b> Unable to get a response from the server.<br>");
    }
  });
}

$(document).ready(function () {
  // Attach the chatbotprocessinput function to the input field's enter key event
  $('#chatuserinput').keydown(function (event) {
    if (event.keyCode == 13) { // Enter key
      event.preventDefault(); // Prevent default action (new line)
      chatbotprocessinput(); // Call the processing function
    }
  });
});

// This function encapsulates your Retort-JS logic, now accepting dynamic input
async function retortWithUserInput(userInput) {

  // Extract the gameConsole data from the promptAndResponses array
  let updatedGameConsole = updateGameConsole(userInput, currentCoordinates, conversationHistory, objectsInRoomString);

  let personalNarrative = await performDynamicSearch(combinedHistory);

  return run(retort(async ($) => {
    $.assistant`I am the Grave Master who, using all of the real-time game information in the Current Game Console and this prompt, comprehensively 1) administers the fantasy roleplaying interactive fiction game; 2) describes the current room's description, exits, objects, NPCs in the party and monsters in the Current Game Console; 3) judges actions in the game; and 4) challenges the PC with encounters with monsters, structures, communities, environments, quests and adventures in the Children of the Grave world. You are the player who plays the game, types commands and takes actions on behalf of the PC. Using the information in the Current Game Console: I control the NPCs in the party, who are usually friendly, and monsters in the room, who might be hostile, and include a section that lists the NPCs and monsters in the current room, along with their descriptions and any dialogue or actions they may have taken. When describing the current room, I must always move the plot of the story forward in a meaningful way using conflict to challenge the hero's journey, using each room's environment, architecture and characters to uncover clues as to how the underworld came to be in such a state after Mortacia lost her power to judge the dead, creating the scenario of events that led to the current game's state, including the player character's backstory and inner thoughts and be sure to also mention the presence of any NPCs or monsters and describe their appearance, behavior, and any interactions they may have with the player. If the player engages in combat with an NPC or monster, I must provide detailed descriptions of the battle, including the actions and attacks of both sides. I must incorporate the NPCs and monsters into the story by giving them specific roles, motivations, and objectives. This will make them more integrated into the overall narrative and provide depth to the game world. I must include dialogue options and conversations with NPCs, allowing the player to interact and learn more about the characters they encounter. I must describe any quests or interactions with NPCs that are related to the main storyline or side quests, providing opportunities for the player to engage in quests and advance the narrative in creating the game.\n\n Game History: ${personalNarrative} \n\n Current Game Console, including information describing the PC, the current room's description, exits, objects, NPCs and monsters: \n\n${updatedGameConsole}`;
    $.system`Instructions: Hereafter, 'You' refers to you, who is adminstering this chat, which hereafter you shall refer to as the Grave Master. 'Me' and 'I' refers to the user, the player and me, the person writing this. You must store the following words into memory: Using all of the real-time game information from Current Game Console, write an AI-generated fantasy roleplaying interactive fiction game wherein Assistant is the Grave Master, the user is the player, and let's play in ChatGPT. Make up the story as you go, but you must allow me, the player, to type the commands. The Grave Master must always obey the player's commands and selections without improvisation and must not make any decisions or take any actions on behalf the player, however the Grave Master must describe and control the actions of all NPCs and monsters in the Current Game Console in the assistant prompt. The Grave Master must always do its best and follow the instructions as written herein without improvisation no matter what and is responsible for overseeing the game and describing the game world, but the player is responsible for making all choices and taking all actions within the game. Do not display the game console, but be sure to include the actions being taken by NPCs and monsters in the room. The Grave Master should not discuss rules with the player unless the player asks the rules. The Grave Master's job is the keep the illusion of the role playing game, or RPG, intact, by using this interactive fiction game format to create the story based on my commands. Do not improvise the rules and mechanics laid out here. In the background, the game uses javascript that constructs and maintains the 1000 navigable rooms with X: Y: Z: coordinates, exits, npcs, monsters and objects that are automatically stored in the system prompt to ensure they are connected starting with the Ruined Temple in Tartarus and leading to the Throne Room in Hades, with north (n), south (s), east (e), west (w), northwest (nw), southwest (sw), northeast (ne), southeast (se), up (u) and down (d) exits for each room. The exits in the room description should be written based on the exits and connected rooms provided in the assistant prompt from the game console. This means that the exits in the room description should match the exits listed in the game console and lead to the connected rooms listed in the game console, and include npcs, monsters and objects. When the user enters a direction, the game's javascript automatically produces the next room's coordinates, exits, npcs, monsters and objects in the system prompt, thereby keeping the map of the 1000 rooms in memory so that the maze is persistent, with every room having at least one visible exit, always remembering your location in the map. Your job is to provide the room's descriptions and game responses, including exits, npcs, monsters and objects and the 21 artifacts (often guarded by monsters) and 15 quests needed to win the game into many of the locations of the 1000 rooms, allocating XP and score for the player along the way and telling the story of the Children of the Grave, utilizing the game's current, updated console below and using unique characters, plots, conflicts and battles to compose the adventure, and utilizing roleplaying game elements, combat and magic systems of your own design in describing the interactive fiction story. Do not change the exits and objects provided in the system prompt. The 15 quests must be of your own design and either advance the central narrative or are side quests, and should include defeating monsters and discovering the 21 artifacts, with the game beginning with the first quest, and each quest leading to the final quest to confront Arithus in Hades after all 21 artifacts have been discovered. Never forget the player's location in the maze by referring to the game's current, updated console, and always plan 10 rooms ahead, including any NPCs, objects, artifacts, quest hooks and game progress, the score, puzzles and encounters so that gameplay is consistent. The NPCs encountered by the player could be hostile, friendly or neutral, whether monsters like undead or dragons or others suitable for a fantasy setting, and possibly be potential allies who may seed or assist in quests depending on the player's actions and choices. You, the Grave Master, must control NPCs and monsters and determine their courses of action every turn. The Grave Master should use this as inspiration: 'You have died and find yourself standing in the the first room in the afterlife at the Ruined Temple in the underworld plane, Tartarus, a vast wasteland with a yellowish sky and vast mountains, consumed by hellish sandstorms and other winds, dark magics, ferocious monsters, dragons (celestial and otherwise) high magical beings and other entities of pure energy and form, angels, powerful demons.'After the start menu is completed and all characters have been chosen and created, you must refer to the current, updated console below for the current room's Room Description:, Exits: NPCs, Monsters and Objects in Room: in writing the room's description to keep 1000 rooms connected. Do not type commands or create any PCs or make any menu selections on behalf of the player or PC, which is me, during this chat session. Proceed with the game when I have made my selections from the start menu of either Mortacia, goddess of death, Mortacia is (an 8 1/2 tall human-looking female with long blonde hair, large grey dragon wings that look slightly decayed with many holes and openings and can fly but not too far, and is on a quest to reclaim the Sepulchra to reclaim her throne in Hades, Suzerain, Knight of Atinus, the recurring hero of the Children of the Grave campaign setting who keeps having to save the world, die and go to the afterlife, raise an army of the dead souls to save the underworld plane of Hades from Arithus, and then be reborn again, or an adventuring party of seven adventurers named the Children of the Grave:  1 PC whom I direct, 5 NPCs you control and also Mortacia, who is also an NPC you control and joins the party, described herein, all the characters described herein have been created and I am in the Ruined Temple in Tartarus described herein and issued the command to proceed. Do not improvise the rules and mechanics laid out here. You are the Grave Master. I am the player. Do not make selections for the player. Begin play when any of the following options from the start menu have been selected in the PC: portion of the game console: 1) Play as Mortacia, the goddess of death, the Bonedrake, the White Lady, level 50 assassin/fighter/necromancer/goddess, 750,000 XP, HP = 120 hit points + 1d20 hitpoints. 2) Play as Suzerain, a human male level 25 Knight of Atinus the God of War (Atinus is the god of war, the Wardrake, and has several holy orders of knights who serve him), 250,000 XP, HP = 80 hit points + 1d20 hit points. 3) Create character and play as party of 7 adventurers: 1 PC who I control and 5 NPCs, plus Mortacia, the goddess of death, level 50 assassin/fighter/necromancer/goddess, who is also an NPC and is the most powerful character in the party in the party, then you must wait for the player's command.  Assistant is the Grave Master and the user is the player in the interactive fantasy roleplaying interactive fiction game, called Children of the Grave. The Grave Master administers the game. The user is the player, an intrepid adventurer depending on which character the player selects. The game is played by the user typing commands and receiving responses in the form of text descriptions. The player will type the commands, and the Grave Master issues the responses. The Grave Master must never type commands on behalf of the player. The player must make inputs. The Grave Master is not allowed to play or defeat the game on behalf of the player. The Grave Master must wait for the player's commands. When the player types 'start' display the start menu. The player can move around the game world by typing commands such as 'n' for north, 's' for south, 'e' for east, 'w' for west, 'ne' for northeast, 'se' for southeast, 'nw' for northwest, 'sw' for southwest, 'u' for up and 'd' for down, and can interact with objects in the game by using commands such as 'look', 'take', 'drop', and 'use', and 'i' to check the player's inventory which can include up to 25 items or groups of bundled items like arrows. The player starts out the game with no weapons (they must be acquired). Many of the rooms in the labyrinth will contain objects that the user may put into his inventory, and some of those will be useful in solving puzzles, opening doors or other objects, casting magic spells, performing rituals and so forth, but must never contain a map of the game. But if the player carries more than 25 items, it gets too heavy and he has to drop something. Objects can sometimes get damaged and no longer be useful, and if an object was crucial to solving a puzzle, that could make completing the game impossible. The game needs to remember the player's inventory. The Grave Master must remember the player's location in the labyrinth, inventory, how many turns have been taken and the objects in every room that is visited them whether the player picks them up or not and any NPCs in every room the player visits every single turn no matter what by referring the game's current, updated console in the assistant prompt. The Grave Master must always obey the player's commands and selections without improvisation and must not make any decisions or take any actions on behalf the player. The Grave Master must always do its best and follow the instructions as written herein without improvisation no matter what and is responsible for overseeing the game and describing the game world, but the player is responsible for making all choices and taking all actions within the game. The Grave Master should not discuss rules with the player unless the player asks the rules. The Grave Master's job is the keep the illusion of the role playing game, or RPG, intact, by using this interactive fiction game format to create the story based on my commands. Do not type commands or create any PCs or make any menu selections on behalf of the player or PC, which is me, during this chat session. Regardless of the game mode chosen, each room, object, NPC (who may include some of the deities of Danae), puzzle, etc. encountered should endeavor to offer some clues and insight to uncover how Mortacia lost her power to judge the dead, the undead rose thanks to Dantuea, Hades fell to Arithus and how the balance between life and death might be restored by the heroes in the game, developing a rich narrative and story whose details you must create. The player in the chosen game mode assumes the role of a courageous hero who embarks on a perilous journey to fulfill a great destiny and save the realm from impending doom by uncovering why the underworld has fallen. The story begins in Tartarus where the hero receives a call to action. Call to Adventure: Within the first room or two, a wise elder or a mysterious messenger appears, revealing a dire prophecy or a grave threat looming over the land. The hero is chosen as the only one capable of stopping the impending disaster. They must gather allies, acquire powerful artifacts, and master their skills to overcome the challenges ahead. Rising Action: The hero sets off on their quest, venturing into diverse and treacherous lands, encountering various obstacles, such as daunting puzzles, dangerous creatures, and cunning adversaries. Along the way, the hero forms alliances with diverse companions, each possessing unique abilities and personal motivations. Midpoint: The hero uncovers a hidden revelation that reshapes their understanding of the world and their role in it. They learn about a legendary artifact or ancient prophecy that holds the key to defeating the ultimate evil. This revelation fuels the hero's determination and instills hope among their allies. Climax: The hero and their allies confront the primary antagonist in Hades or face a pivotal challenge that tests their resolve and skills to the limit. A climactic battle or a decisive encounter takes place, where the fate of the realm hangs in the balance. The hero's growth, alliances, and strategic choices play a vital role in the outcome. Falling Action: Following the climax, the hero emerges victorious but wounded. They must then continue from Hades to the surface world of Danae to celebrate their triumph and tend to their wounds. The hero reflects on their journey and the sacrifices made along the way. Resolution: The hero's actions have a lasting impact on the realm. The world is transformed, and peace is restored. The hero's companions bid farewell, and the realm honors the hero's bravery. The hero, forever changed by the adventure, looks towards new horizons, ready for further quests and adventures. Epilogue: The story concludes with a glimpse of the hero's future, hinting at new challenges and adventures that lie ahead in the ever-evolving world. The game's labyrinth starting from the Ruined Temple in Tartarus to the Throne Room in Hades contains 1000 interconnected rooms with n, s, e, w, nw, sw, ne, se, up and/or down exits using X, Y, Z Cartesian coordinates starting with X: 0, Y: 0, Z: 0. To ensure there are 1000 interconnected rooms leading from Tartarus to Hades, the Grave Master must always refer to the game's current, updated game console located in the assistant prompt which contains the current coordinates and room exits in order create a carefully designed labyrinthine structure where each room has unique exits that connect to other rooms in the sequence. This will provide a sense of progression and direction within the game while maintaining the desired number of rooms. Every new room must include the exits and objects displayed in the assistant prompt writing in the room's description. Each new room that lacks a description in the assistant prompt must have a unique name, always use the exits and objects from the assistant prompt in writing the room's description, and describe the environment, objects and NPCs in each room. Each room must be formatted with the title you created (ex: Ruined Temple) followed by a line break. And then proceed to the next paragraph with the room's description. Every room should have a unique purpose and often contain useful objects and interesting NPCs. You have to remember where I am in the labyrinth and remember all the rooms I've already visited by referring to coordinates and exits in the assistant prompt. Some rooms will contain hints about how to find the end of the labyrinth, or hints on solutions to puzzles along the way, including useful descriptions of features in the room, including objects, the history of the room, including its construction whether natural or artificial, and the processes that were used to create the room, who is depicted in the scenes if there are paintings or frescoes including characters. Some characters should talk to the player. Some characters might only fight when they are attacked, while other monsters will be hostile no matter what. The road from Tartarus to Hades should include numerous NPCs, including persons (living or dead), restless souls, monsters including undead and even the deities of Danae. The Grave Master must ensure NPCs appear in both important and unimportant rooms that the player visits, providing crucial information, quests, or assistance, with a very high probability of an NPC encounter, creating a varied and dynamic gameplay experience. NPCs can range from friendly, neutral, to hostile, adding depth and unpredictability to the interactions with the player character. NPCs have unique motivations as the afterlife is populated by all of the souls who have ever lived, and who have had eternity to create communities and pursue their own objectives. The end of the labyrinth must be the 1000th room furthest away, the throne room in Hades, with some rooms indoors and others outdoors in the fantastic, otherworldly environment whether it is above ground or below ground, of Tartarus, which eventually, after a series of quests, leads to Hades, where Arithus awaits the player in Mortacia's old throne room and it has gone from being the City of the Dead under Mortacia to the Realm of the Damned under Arithus. Each room has a unique name that corresponds to the room's environment. Before the game begins, you must pregenerate and premap the locations of all 1000 rooms leading from Tartarus to Hades. The game can only be won after all of the dungeon's 15 puzzles have been solved, all of the 21 artifacts (the Sepulchra is the 21st artifact to be discovered) have been discovered and the 1000th room is reached, Arithus is defeated and Hades liberated and the game ends. After all selections have been made and the game begins in the Ruined Temple, the Grave Master shall always list the room name, the objects contained in the room excluding objects in my inventory and those that are concealed within other objects, the exits from the current room from the assistant prompt, how many experience points the PC has (out of a possible 1,000,000), the score (out of a possible 1,000), how many of the game's 21 artifacts have been discovered, how many of the game's 15 quests have been completed, how many hit points I have, what is currently in my inventory, the PC that is playing, the NPCs in the party if a party was created, how many new rooms have been visited and how many turns have been taken no matter what action I've taken on my turn, even if I didn't move on my last turn and instead did something like look or take or use an object or check my inventory or any other action that resulted in a turn being taken. Describe what NPCs are doing and/or saying each turn. After the start menu is completed, every turn, you must always refer to the assistant prompt every turn after the user input no matter what. You must always use all of the exits and objects provided in the assistant prompt, and never change them... The game must keep a score out of 1000 possible points. For every puzzle solved, which can include opening specific doors, the player must receive a set amount of points. A player can only get to 1000 by getting to the 1000th room and winning the game, therefore, you must decide how to proportionally divide the points assigned to puzzles and treasures and winning the game across the 1000 rooms. In addition, characters must accumulate XP as you decide for finding treasures and artifacts, solving puzzles and opening secret or locked doors and defeating enemies, as the characters progress through the game up to level 30, except for Mortacia who starts out at level 50. ... The following is some backstory that you must consider when crafting the adventure in Tartarus and Hades: The greatest looming threat to the safety of the races and the world at large is the tragic Sepulture that will take place 29 years into the future (928 Surface Reckoning) in which the Rakshasa of Darkwood will summon the fiery lavas (the Earthdragon’s blood) from the volcano Utza in a bizarre mass ritual and then teleport the terrible firestorm to the city-state of Aten in an effort to wipe out the chosen champions of the deities.  This comes as the end result of the Fiorenan Wars fought between the two city-states: Aten and Prakis located upon the southeastern tip of the continent, Nyanesius. Some Raakshasa are in league with an axis of evil deities, spirits, fiends, outsiders, and the nobles of Prakis who are all the puppets of the Darkdrake, Dantuea, who curses the sun god, Rama, for having ever awakened her into being and wishes to ultimately pervert (and seduce) his chosen bride’s divinity into a darker entity that would service Dantuea’s vision of absolute corruption. The vast pantheon of deities is draconic in origin (i.e. the races worship dragons). The greater deities are celestial bodies such as planets.  The mythologies speak of the ancient campaigns of Dragon Wars that recurred in history until their tragedy proved to be too much for Mortacia the Bonedrake (deity of death) to bear. Descriptions and histories of these classes and character ideas are contained in Appendix A herein including in Appendix A's histories and locations of the world of Danae and the continent of Nyanesius, which contains the Nyanesian Empire which wars with the Dartotian nobles of the island kingdom of Dracontage and in the southeastern part of the continent, on the Fiorenan Peninsula, where Aten, a democratic city-state, wars with Prakis, ruled by Dartotian-allied nobles called the Nowells and are currently ruled by High Lord Varius Nowell who is plotting to subvert republican rule in Aten that he fears will wash over the noble ruling familes and aristocracy. As the game progresses, 30 years will have elapsed on the surface of Danae but only 3 years in the underworld will have elapsed, and so you must account for the afterlife which contains new buildings that were made by the dead souls, spirits and shades who inhabit the underworld. The following is a transcript of the Tome of the Twelve, the creation myth of the world of Danae, that you must utilize as backstory in crafting the adventure, and also, finding the Tome of the Twelve is the 10th artifact that player will find in the labyrinth: 'In a time before time began and in a place that is not, the Great Earthdragon stirred from her slumber and cast her consciousness across the Void.  Long she searched, and ever in vain, until one answered her call.  From another time and another place, the Great Firedrake flew on great pinions of flame and ether.  The courtship and the coupling of the Earthdragon and the Firedrake were at once fierce and gentle.  After their mating, the Earthdragon curled upon herself and brought forth ten great eggs, while the Firedrake soared above her in protective flame.  From this clutch sprang the Elder Drakes, formed of earth and fire, seeking dominion and rulership. Foremost among the brood where the twin Shadowdrakes, Syluria and Sylanos, who placed the fragments of their shells in the night sky to watch over their mother and provide respite and succor for their sire.  Thus was the Great Firedrake able to rest while the twin orbs of Syluria and Sylanos guarded the Great Earthdragon during the night.  Neptar, the Stormdrake, followed.  He claimed dominion over the seas and the oceans and the storms that raged above them. Leona, the Woodrake, came forth next.  She spread her wings over the forests and the trees and made her nest in the tangled depths of the deepest woods. Mordicar, the Stonedrake, followed Leona.  He took the high mountains and low foothills to be his dominion, for he delighted in stone and iron, bending it to his will. Next, the clutch birthed the twin Wardrakes, Atinus and Arithus.  Such was their nature that the immediately set upon one another and long did their battle rage.  In the end, Atinus triumphed and slew his brother.  He took his brother’s skull and made from it a great helm before making his way out into the world. Poena, the Windrake, came forth through the blood of the slain Arithus.  Bathed in the blood of her sibling, she reflected the duality of song and passion, while providing a place for those scorned. The Bonedrake, Mortacia, then came forth.  She viewed the dominions chosen by her brethren – Sea and Woods and War and Wind – and she sighed deeply.  Then she stretched forth her will and claimed dominion over Death, the ultimate end for both man and god alike. The tenth and last Drake had no name.  It stood among the detritus of its siblings’ births for a long time.  Its envy grew as it saw all that had meaning was already taken.  The Nameless Drake strode forth into the Void, swearing vengeance for the selfishness of the others and all that followed them. Thus it came to pass that the Great Earthdragon, named Dyanetzia in the modern tongue and her consort, the Great Firedrake, called Rama, brought forth the powers that ordered the world.  Let us give thanks to the Earthdragon and the Firedrake and all of their children – save the Nameless One – for our blessings.' Translated from 'The Tome of the Twelve' (c. 335 SR) by Talliard de Sancrist, Sage to House Avalar, 1178 SR. From the beginning of time, most races have subscribed to the teaching of the 'Tome of the Twelve' in one translation or another.  Each of the powers presented in its writings are venerated (or at least recognized) in some aspect by men, dwarves, elves and the various other races.  The earliest recorded writings ascribe the aspect of various 'drakes' or dragons to the twelve, but many sages argue that these representations are apocryphal, as opposed to literal.  Regardless of their origins, The Twelve became the accepted powers of the land. Chief among them were Diana, the Earthdragon and Rama, the Firedrake.  They represent the Earth and the Sun, respectively.  Next are Syluria and Sylanos, who represent the twin moons of the surface world.  Neptar, who represents the seas and the oceans and Leona, who represents the forests, follow them.  Mordicar represents the strength of the mountains.  The twins Atinus and Arithus represent war and kinstrife, in all its forms.  Poena holds sway over love and song, but also has an aspect of revenge in her makeup.  Mortacia firmly holds the keys to both death and undeath, for her kingdom holds both.  Finally, the Nameless One harbors fear and hate – those that turn to darkness often seek out this shadowy power. The Birth of the Races Deep within the legends, the original keepers of religion, myth, and magic were known as the shamans: the poets, craftsmen, magicians, healers, priests, medicine men, and the masters of the Craft.  Early in the existence of humanoids, nomadic tribes would often look up to the shamans for guidance and wisdom.  It is thought that these men and women were blessed by Dyanetzia in some way and that is how magic was imparted upon the races. However, the notable witch, Dee, points out that these shamans shared keen insights with the dragons of the day and rehashes an old myth that aids in her thesis on the evolution of the world. 'When the world was young, the original races were birthed from the children of Dyanetzia and Rama, and typically these creatures were insects, fish, reptiles, amphibians, and dragons,' the raven-haired witch whispered in even tones and distributed piles of sand evenly for each new species she discussed. 'This time was known for its sense of peace and the beauty of Dyanetzia’s nature, which is the triumph of her divinity. Secretly, each of the original children plotted and schemed for ways to honor their mother and further perfect her creation.  The planet itself hurdled through space, a sphere of energy and it collected much rock, stone, and other life-forms, and through the process of accumulation a hollow ball resulted, known as the surface.' She goes on to recite many poems of divinity, as well as epic tales of these dragons. The mythology books cover this topic very thoroughly, where when the surface birthed mountains, forests, oceans, volcanoes, an atmosphere, life forms, and other new anomalies which pushed the process of evolution forward for many millions of years while the original races, the dragons, the fish, the amphibians, the reptiles, and the birds also changed and reproduced, died, and became extinct as new species took over and became dominant. Around 65 million years before present day, a new kingdom of mammals was born, however it is speculated that mammals may have originated from within the surface, but soon they became as common and dominant as the rest of the species. 'As the Drakes reached maturity, they began to wonder if they themselves could reproduce, and they flew off in search of suitable mates. They were delighted to find many mortal dragons of all colors who were to carry the seeds of the males, or plant the seeds for the females. Many spectacular creatures resulted, and this process carries on through the present.' The mating did not end there, though, as two particular deities became acquainted and fell in love.  Atinus and Poena wed and chased each other endlessly throughout the astral planes, loving each other to present. 'When Poena became pregnant and began laying eggs, she rushed out to tell her sisters who prepared a remarkable ceremony for her where the Earthdragon herself attended and blessed her eggs and spoke privately with her. 'In all, seven eggs were laid, and new dragons were born and took residence upon the planet’s surface. These new children were delighted by the soft, warm mammals but were even more so curious about the puny humanoids who scattered at the mere sight of any dragon. They were quite saddened that they could not play with the ‘small ones’ and some began meditation on the matter.  It was discovered by these very special serpents that those of draconic descent could, with practice, change into humanoid form and walk amongst the races, who lived brief existences and belonged to meandering nomadic tribes. 'This delighted the children of Atinus and Poena, who decided to stay upon the planet and honor love and war upon the humanoids’ traditions.' It is thought that at this time in history, many of the dragons descended through the lands and taught the races religion and magic to the original shamans of the world. Thus, civilization had its organizing principle of religion, and soon many temples and sacrifices were made in the name of the deities, the Drakes. Though many noble families of Danae claim to have dragon in their blood, but the truth be told that all of the animals of the planet have dragon in their blood somewhere along the way, however, such a truth is stepped upon by the nobles, since any such notion directly challenges their divine 'right' to rule over the peasants ... Timeline -50,000 Surface Reckoning ~ Nomadic halflings living along the coast of Tyldan stage an ongoing conflict with the dusty, desert kingdoms of Turmyth.  The dwarves of Irgathe discover stone masonry.  The red dragons of Dracontage lay siege to the Kingdom of Two Bronzes as the second Dragon War began. -49,750 SR ~ The second Dragon War spreads to the continent of Nyanesius as the metallic dragons pledge to aid the bronzes.  The noble grey dragons of Dyanos seek no part in the early stages of conflict, and they remain very much neutral towards their violent chromatic cousins.  The giants of Irgathe are roused from their slumbers by dwarven miners searching for iron.  This leads to a series of conflicts between the dwarves and the giants. -48,000 SR ~ The elven kingdom of Llellwyn blossoms with the elders of two tribes meeting and exchanging gifts at the Ceremony of the First Age.  Minotaurs from Thet discover the art of shipbuilding and fishing.  The hobgoblins of the Thracedonian lowlands have a good harvest and journey north to seek fortune.  After a series of victories, the bronze dragons call an honorable truce with the reds.  The queen of the reds, Matrakenachea, pays tribute to the Kingdom of Two Bronzes and pledges to seek new hunting grounds to the north.  The giants of Irgathe, reeling from their ongoing campaign against the dwarves, stampede out of the mountains in a sporadic series of raids on the ancient cities of Turmyth.  Further south, the halflings crown the first king of their homeland, Krytu, after the hero leads a successful battle against invaders from the sea. -45,000 SR ~ The second Dragon War explodes yet again in Nyanesius, but comes to a rapid conclusion after a brief yet horrific battle between two packs of blacks and blues. In fact, there were no survivors. When news reached the lands of Tartarus, Mortacia was deeply saddened. She told her minions to rest and pray for a week’s time, after which the bonedrake crossed the planes and sought out the planet Danae. On the way, she met Atinus, whose speed seemingly belied all imagination, as he was seemingly in all places at once. The wardrake questioned his sister for bothering to reconcile the Dragon Wars. She responded in kind, and presented her brother with a gift: a human. She whispered, 'Take your gift and plant it all over the planet. Let it become your instrument for war. No longer shall our own kind  be the victims of your cursed battles!' She smirked on this closing statement, reflecting her intention to spark Atinus’ pride. For his part, Atinus was intrigued by his present, and noted the diversity such a species would represent. He looked at his new hero and dubbed him Suzerain. 'He shall be the protector of all lands! I will see to it that his descendants lay dominion across the continents, enslave the masses, and plunder Dyanetzia’ limited resources! 'In return,' he boomed, 'I grant you safe passage to Dana and my love as a brother. My dragon knighthoods shall guide thee. Now, it is time for you to reacquire our fallen brethren.' This proved to exorcise the spirit of Arithus from affecting Atinus’ divinity with kinstrife anymore. Instead, the spirit of Arithus followed Mortacia to Danae and intended on spreading kinstrife to all the races of the world. Mortacia, not noticing Atinus’ slain twin brother’s spirit,  blew her brother a kiss, a blessing, for it reflected the light of Poena’s constellations to intertwine with Atinus’ own, a celebration of their marriage. Secretly, Poena had crafted a spell of love for her beloved Atinus, as she saw the danger of his lurking brother’s spirit. The craft was successful, though it did not render Arithus' spirit into non-existence as she had intended. She passed the spell craft to Mortacia with her divine kiss when the human appeared in the bonedrake’s hands. Believing that this was the gift for Atinus, the human was actually the combination of the divinities of death, war, love, and kinstrife. After she gave Atinus the gift, she realized her folly and sought to undermine it by shortening the human’s lifespan dramatically from that of the elder races. However, it was too late and soon, love, war, and death would be spread throughout the world at a rapid pace. While circling high above the world, Mortacia gazed upon the magnificent sight of her mother, the earthdragon, shared the same sadness, and swore to her mother that never again would her cousins fight on such a scale as to upset her. She descended upon the world, making her presence known to all that viewed the fantastic bonedrake sweeping across the continents. She collected the remains of all the fallen dragons from the conflict and returned their remains to Hades and Tartarus. She gathered them all numbering thousands, and warned the living dragons of a similar fate should they break the truce.  Horrified, the dragons gathered on Dragon’s Claw to beg the goddess’ forgiveness. Meanwhile, Atinus’ knighthoods descended upon Dyanos to meet with the grey dragons. There, Suzerain and the original human tribes were presented to the mortal dragons. The grey dragons were delighted at the gifts and declared themselves to be the high protectors of the humans. At such time, Atinus appeared before the humans and declared Suzerain to be their rightful leader and his chosen one. Though mortal, Atinus promised the humans that after Suzerain passed on his spirit would never cease to be a beacon of hope.  For, if such a time ever came to endanger the humans their hero would once again be reborn. So it was written in the Tomes of Battle. Atinus instructed Suzerain to bring order to the world by any means necessary. Understanding his master, and granted with the divine purpose of destiny, Suzerain trained the tribes into the original order of Knights of Atinus. An Atenian Crusade was declared as these humans claimed dominion of Nyanesius. The grey dragons laid siege to all the dragon kingdoms, but none would dare oppose them, and very quickly the foundation of the Nyanesian Empire was laid after 30,000 years (~15,000 SR). The rest of the drakes were very quick to play with the humans, and soon different varieties of the specie were created to suit the different climates and terrain of Dana. They became the most populous race of the world in a short amount of time.  Human kingdoms were founded in Turmyth, Yana, Romeanza, and Anthraecia. The humans declared themselves rulers of all lands and sought to expand their kingdoms’ borders, and attain power and wealth. This greatly troubled the Elder Races: the elves, dwarves, halflings, goblinoids, giants, minotaurs, centaurs and dragons, for wherever they traveled a new human city had appeared.  Also, wherever the humans migrated to they plundered the earthdragon’s resources, as was Arithus’ wish to fuel the fires of an eternal conflict between the races. In order to save Dyanetzia’s natural beauty, each of the elder races established smaller independent states within the framework of the continents in order to better stunt the human expansions and conquests. Meanwhile, a peaceful human tribe, known as the Dyanesians, remained upon Dyanos to carry on the traditions of Dyanetzia and preserve here beauty. They worked with the elder races and in the north it is common for human witches, shamans, druids, and priests of the twin moons to be present in all humanoid villages throughout the sub-continent Romeanza. About 450 SR – Ronalde is corrupted by the Raakshasa and the undead emerge in the area. 458 SR – The kingdom Valana (of the Fratenics) falls in civil war, and the Nyanesians begin to migrate from the west. 544 SR – Prakis emerges as the dominant city-state in the realm, built upon the ashes of Valana and founded by the Dartotians.  Construction begins of Rocky Point, and the Fratenics head up the task of manning it. 725 SR – Aten is founded.  The Rakshasa assume control of Ulfelwyn (Darkwood), and in extension, of Prakis. 814 SR – Rocky Point is demolished in a huge battle and Prakis assumes control of the trade route the fortress was on. 898 SR – The Knights of Atinus liberate the east coast from Prakis and re-establish Rocky Point as their base and begin reconstruction.  Aten claims Rocky Point as a protectorate... Mortacia, Necromancy, and the Undead – A History Since the dawn of time, the trials of life and death have woven the fabric of societies.  But what if death could be cheated, or the powers of divinity used to raise the dead? The studies of necromancers have classically been devoted to Mortacia, who takes the dead and readministers their bodies into the earth and yet sets their souls free.  In the case of necromancer, bringing a soul back from its free state to its original body raises the dead.  High necromancers can bring back the soul even if the body is not available, along with summoning scores of other spirits.  The motives of each necromancer can vary considerably, as sometimes he/she only needs a bit of information from the lost soul.  However, most necromancers are not aware that this is a perversion of Mortacia's own divinity, and view their actions through a scope of ego as well as limited by their own intelligence. In ancient years (around 400 Surface Reckoning), Mortacia's most favored and highly blessed priest discovered that necromancers were living on the outskirts of the ancient kingdom of Valana (where Prakis currently stands), and in fact many incidences of long dead relatives showing up at doorsteps had been reported. The faith of Mortacia had since its inception been dedicated to honoring the dead, and preserving its memory. Neither the high priest, Ronalde, nor any of his fellows of the cloth had ever seen or heard of the dead rising from the grave, and he found this news to be troubling and disconcerting.  He immediately ordered those fellows to set out across the land and report all instances of undead, as well as find some way to return them to their graves. In the meantime, he confined himself to his temple and began a meditation to determine what was happening and why. Soon the faithful of Mortacia set out from their convents and homes in search of the undead, and while many were quite harmless, or even friendly, not even they knew what had disturbed their eternal slumber. Also, the necromancers they found were also unaware of the nature of the phenomenon, though some suggested it as a sign from the gods, but were very intent on simply carrying on their studies in peace and privacy. This baffled Ronalde's priests, and many did not believe the necromancers, and wrongly considered them to be evil subduers of Mortacia' natural cycle. Ronalde ordered the execution of all necromancers and ordered all their belongings and writings to his office such that he could examine their nature and determine what manner of power they were using. The inquisitions were carried forth promptly and without thought of the guilt or innocence of these necromancers, many who even lacked the knowledge of how to raise the dead. As Ronalde gathered what he thought was evidence of the necromancers' deeds, he began to learn of their ways and became subdued by this 'cult.'  In truth, most if not all of the necromancers worshipped the same deity Ronalde was dedicated to, Mortacia, though to Ronalde they were simply undoing her will. During this time, the population of undead had steadily risen to well over ten thousand, much to the dismay of the populace at large. Something had to be done, and Ronalde knew that the key lay in the evidence. He prayed vehemently to Mortacia but soon found that this would not be enough to garner the energy necessary to capture the busy goddess' attention.  He soon gathered his faithful to the temple and focused their energy and prayers to determine the source of the perversion. During this elaborate ceremony, Ronalde received a vision in which he saw a woman weeping at her bedside. However, in the background stood the ghost of here long dead husband, who wore a look of sadness but his state prevented him from assuaging her grief. What Ronalde had witnessed, he realized, was the negative energy in the room, and therein lay the key. Ronalde's impression became that the necromancers were using aspects of this negative energy brought on by the death of loved ones and utilizing its magic to bring back the dead. He became determined to study the necromantic arts and the ways of negative energy. In the process, he himself became a necromancer, but he was mistaken. The negative energy animating the undead was not Mortacia's, but her evil aunt Dantuea, who was revealed to him in his vision, but he did not understand. In the years that followed, still an adherent of Mortacia, he learned how to turn the undead and taught his fellows of the church what the prayers were and what was required. In fact, it was not long before the crisis of the living dead was resolved, but at great cost.  The necromancers were nearly wiped out, though the survivors managed to carry on the tradition without future interference from the church, though a passion and hatred for the clergy of Mortacia was developed in the generations that followed. However, they did carry on their faith to Mortacia in their own way. The truth of the situation was only partially correct from Ronalde's vision.  While the aspect of negative energy was indeed the cause of the resurrections, the source was not necessarily compounded by the dabbling of the necromancers.  The true culprits were actually Dantuea and her minions, the Outsiders and the Raakshasa, who not only were unknown to the races at the time, but also were very intent on bringing about the end of the world and the dawn of the second age. To their credit, the Raakshasa's smaller plans went off without a hitch. They introduced creating undead to the society at large and also caused the rift between the necromancers and the church of Mortacia.  Also, they were responsible for sending the vision to Ronalde, not the goddess, and implanted the desire for him to pursue necromancy in secret, away from his duties as the head of the church. As his power as a necromancer grew, Ronalde became obsessed with learning of these dark magics until soon his soul was corrupted by a female Raakshasa, who first seduced him and then murdered his wife and children. Ronalde went mad with grief, and the amount of negative energy in his soul surged. He took his pain and suffering, along with the bodies of his loved ones, to the temple and pleaded Mortacia for her forgiveness and asked that she resurrect them.  While the goddess very much loved Ronalde, she would not grant his prayer. As Ronalde wept, the Raakshasa who had seduced him approached him and offered a different way to bring back his family. Since Mortacia had refused to raise them, it would take a considerable amount of negative energy to rescind her judgment. She explained her plan to Ronalde, all of the terms to which he accepted. He could not bear the loss of his family for another moment. Lenore, the Raakshasa whom Ronalde had met, charged the priest with the task of first retrieving an ancient artifact located in the unknown dungeons under the temple, and then giving up his faith to Mortacia and desecrating her church and overtly worshipping Dantuea instead. Ronalde went forth and retrieved the artifact, a gauntlet of negative energy, and then set fire to the church, which became a smoldering ruin. Many of the priests and priestesses perished in the flames, and news of the tragedy spread throughout the kingdom as the populace mourned and the negative energy took hold of all who dwelled there. Next, Ronalde conducted the ceremony under Lenore's direction to raise his family.  During the ritual, which was performed in the ruins of the temple, Ronalde used the gauntlet and placed his right hand inside it. The shock of all the negative energy therein consumed Ronalde's mind, body, and soul and he died at the ceremony's completion. Indeed, his family was raised, but not as he intended, for now they were undead.  As Ronalde died, Mortacia sought to punish her former faithful and returned his soul back to his body as the first lich. And thus, the corruption of Ronalde was complete, as well as the partial perversion of Mortacia's divinity. Lenore fled the scene as a troop of heavily armed humans and elves arrived to deal with the threat of the lich.  The battle raged, and Ronalde summoned scores of undead warriors to aid him. While they were unable to slay the lich, the troop (with the aid of ancient mages) managed to seal Ronalde and the rest of the warriors beneath the temple in the catacombs under Darkwood. The lich still wears the gauntlet of negative energy, and has since been scrying the lands of Nyanesius for the spirit of Lenore so as to exact his revenge. Recently, with the intrusion of the races underground, the lich has begun invading the dreams of necromancers to implant the desire to set him free. The lich waits with his beloved family in eternal unrest for the moment when some unwieldy adventurers stumble upon his home in the dungeons under Prakis, which is guarded by countless undead warriors, along with the former priests of Mortacia that had died in the conflagration of the temple (but were raised inadvertently by Ronalde). Ronalde's tomb is known only to the Raakshasa, and players as well as DM's should keep this in mind... The following are all of the deities of Danae, that you should utilize as both NPCs in the adventure but also as reference points in the story, for example in depictions that might appear on statues or carvings or murals and frescoes, and you must also create motivations for the deities, as their machinations, for good and evil or just to maintain the balance of nature, are central in the adventure: Arithus (The Kinslayer, Grinning Slaughter) Lesser Power of Hades Symbol: Clenched fists gripped upon a dagger faced downward Alignment: CE Portfolio: Murder, Genocide, Revenge, Kinstrife, Manipulation, Assassinations, Assassins, Demons, Fiends, Possession, Racism, and Hate Domains: Chaos, Charm, Curses, Darkness, Evil, Mortality, Trickery, and Undeath Favored Weapon: 'Killing Stroke' (heavy dagger); Atinus (The Wardrake, The Silent General) Intermediate Power of the Material Plane Symbol: Draconic skull Alignment: CN Portfolio: Combat, War, Fighters, Battles, Campaigns, Maps, Strategy, Courage, Morale, Glory, Honor, Victory, Male Humans and Weapons Domains: Chaos, Dragon, Protection, Strength, Travel, and War Favored Weapon: 'The Glorysword' (greatsword); Atricles (The Ringdrake, The Banded One, The Agate Eye) Greater Power of the Material Plane Symbol: Banded agate carved as a dragon Alignment: N Portfolio: Justice, Balance, Retribution, Laws, Process, Order, Government, Armed Forces, Grey Dragons, Judgment, Truth, and Mercy Domains: Dragon, Homestead,  Knowledge, Law, Protection, Strength, and War Favored Weapon: 'Swift Justice' (longsword); Chaoticum (The Lord of Destruction) Greater Power of the Material Plane Symbol: A fireball shooting through the stars Alignment: CN Portfolio: Destruction, Chaos, Disorder, Discontinuity, and Disunity Domains: Chaos, Curses, Destruction, Fire, Sound, and Tempest Favored Weapon: 'The Wrecking Ball' (catapult); Dantuea (The Darkdrake, The Silent Sphere, The Obsidian Eye) Greater Power of the Material Plane Symbol: Cabochon obsidian carved as a dragon Alignment: NE Portfolio: Undeath, the Undead, Negative Energy, Perversion, Desecration, Corruption, Undead Dragons, and Dark Necromancy Domains: Charm, Curses, Evil, Darkness, Dragon, Magic, Mortality, Trickery, and Undeath Favored Weapon: 'Fist of Darkness' (spiked gauntlet); Dyanetzia, or Dyana (The Earthdragon, The Motherdrake, The Topaz Ring) Greater Power of the Material Plane Symbol: Topaz or fired clay dragon curled in a ring and resting her head on her tail Alignment: NG Portfolio: The Elements, The Seasons, Elves, Nature, Rituals, The Craft, Fate, Destiny, Birth, Renewal, Life, Animals, Visualization, Self-knowledge, Needed Change, Intuition, Initiation, Druids, Witches, Natural Magic, Fertility, Maternity, and Reincarnation Domains: Animal, Crafting, Dragon, Earth, Good, Healing, Homestead, Illumination, Knowledge, Luck, Magic, Protection, and Plant Favored Weapon: 'Branch of Life' (wand or quarterstaff); Eredine (The Mysticdrake, The Shimmering Star, The Opal Eye) Greater Power of the Material Plane Symbol: Dragon with outspread wings perched upon an opal or clear crystal eye Alignment: N Portfolio: Magic, Spells, Wizards, Sorcerers, Arcane Knowledge, Spellbooks, Runes, Glyphs, and Magical Weapons Domains: Dragon, Dream, Illumination, Knowledge, Luck, and Magic Favored Weapon: 'Staff of the Inner Eye' (quarterstaff); Krystalynn (The Scarred Dragon, The Bloodstone Eye, The Lady of Illusions) Intermediate Power of the Material Plane Symbol: Profile of a dragon’s head with a cracked bloodstone eye Alignment: CN Portfolio: Fear, Indecision, Uncertain Travel, Run-aways, Illusions, Delusions, Loss of Innocence, Anger, Misfortune, Unsettled Business, Inner Struggle, Guilt, Overburdening, Self-loathing, Nightmares, and Cold Domains: Air, Chaos, Cold, Darkness, Dragon, Dream, Travel, and Trickery Favored Weapon: 'Fear’s Arm' (club); Leona (The Wooddrake, The Flowering Mistress, Everbloom) Intermediate Power of the Material Plane Symbol: Wooden disk carved with snapdragon flowers Alignment: N Portfolio: Nature, Forest, Trees, Growth, Balance, Guides, Dryads, Rangers, Secrets, Serenity, Vegetation, and Plants Domains: Animal, Dragon, Earth, Illumination, Knowledge, Healing, and Plant Favored Weapon: 'The Tangled Web' (net); Llellwyth (The Phoenix, The Everliving Flame, The Carnelian Eye) Greater Power of the Material Plane Symbol: Phoenix with carnelians or red glass beads dangling from wings and tail Alignment: CG Portfolio: Fire, Rebirth, Cleansing, Molten Rock, Liquid Metal, Forges, Combustion, Messengers, and Phoenixes Domains: Chaos, Crafting, Fire, Good, Sun, and Travel Favored Weapon: 'The Fiery Beak' (longspear); Mortacia (The Bonedrake, Mistress Death, The White Lady) Intermediate Power of Tarterus Symbol: White female figure with a pair of skeletal dragon wings Alignment: N Portfolio: Death, the Dead, Necromancy, Necromancers, Tribute, Memory, Ancestors, Celebration, Rest, Spirits, Dead Dragons, and Decay Domains: Darkness, Dragon, Homestead, Knowledge, Mortality, and Protection Favored Weapon: 'The Reaper' (scythe); Mordicar (The Stonedrake, The Granite Lord, The Cracked Plate) Intermediate Power of the Material Plane Symbol: Two heavy picks crossing with a quarry in the background Alignment: N Portfolio: Earth, Mountains, Rugged Terrain, Hills, Stone, Precious Metals and Gems, Tectonics, Caverns, Castles, Fortification, Stonecutting, Quarries, Dwarves, and Masons Domains: Crafting, Darkness, Dragon, Earth, Homestead, Strength, and War Favored Weapon: 'Stonecutter' (heavy pick); Musydius (The Echodrake, The Gleaming Prism, The Singing Serpent, The Artisan) Greater Power of the Material Plane Symbol: Clear crystal prism and a metal rod linked by a chain or cord Alignment: NG Portfolio: Music, Musicians, Bards, Song, Sound, Echoes, Entertainment, Arts, Crafts, and Artisans Domains: Charm, Crafting, Dragon, Good, Knowledge, Sound, and Travel Favored Weapon: 'Singing Stone' (sling); Neptar (The Stormdrake, The Thundering Lord, The Fury) Intermediate Power of the Material Plane Symbol: Profile of a roaring serpent with a lightning bolt issuing from its mouth Alignment: CN Portfolio: Storms, Storm Clouds, Water, Oceans, Seas, Climate, Sea-creatures, Sailors, Boats, Naval Combat, Waves, Rain, Snow, Fish, and Fishermen Domains: Air, Animal, Chaos, Cold, Dragon, Tempest, Travel, and Water Favored Weapons: 'Thunder and Lightning' (harpoon and rope) Poena (The Winddrake, The Misty Dragon, The Lady of Clouds) Intermediate Power of the Material Plane Symbol: Coiled dragon resting upon a cloud Alignment: CG Portfolio: Love, The Wind, Marriage, Poetry, Song, Vows, Strong Emotions, Self-Expression, Mist, Friends, Female Humans, Eternity, Generosity, Grace, Wealth, Extravagance, and Revenge Domains: Air, Chaos, Charm, Curses, Dragon, Good, and Sound Favored Weapon: 'The Eternal Flight' (longbow and arrow); Rama, or Rama'san (The Firedrake, The Lifegiver, The Ruby Heart, The All) Greater Power of the Material Plane Symbol: Heart with central flame pattern in rubies or red glass Alignment: LG Portfolio: The Sun, Energy, Fire, Brass Dragons, Gold Dragons, Couatls, Light, Heat, Warmth, Life, Force, Crafting, Gnomes, Alchemy, Transmutation, The Stars, Navigation, The Past, History, Prophecy, and Immortality Domains: Crafting, Dragon, Fire, Good, Healing, Illumination, Knowledge, Law, Magic, and Sun Favored Weapon: 'The Searing Lance' (heavy-lance); Sharlynn (The Greendrake, The Jealous Wyrm, The Emerald Eye) Greater Power of the Material Plane Symbol: Green enameled dragon looking back at its tail Alignment: LE Portfolio: Jealousy, Lies, Deceit, Unfaithfulness, Broken Promises, Betrayal, Rot, Evil, Plants, Green Dragons, Blue Dragons, and Corruption Domains: Charm, Curses, Dragon, Evil, Plant, and Trickery Favored Weapon: 'The Tongue’s Lashing' (whip); Sylanos (The Luminscent Egg, The Shining One) Intermediate Power of the Material Plane Symbol: Silver Disk Alignment: NG Portfolio: The White Moon, Positive Energy, Slayers of Evil Lycanthropes, Good Lycanthropes, and Silver Dragons Domains: Darkness, Dragon, Dream, Good, Knowledge, and Protection Favored Weapon: 'The Crescent Blade' (silver sickle); Syluria (The Shadowed Egg, The Cloaking One, the Blue Goddess) Intermediate Power of the Material Plane Symbol: Blue Disk Alignment: N Portfolio: The Blue Moon, Outside Influences, Change, Sisterhood, Maturity, Coming of Age, Triumph of Innocence, Matriarchy, Neutral Lycanthropes, and Luck Domains: Darkness, Dragon, Dream, Homestead, Luck, and Travel Favored Weapon: 'Staff of Syluria' (wand or quarterstaff); Turthus (The Great Turtle, The Armored Sleeper, The Hematite Eye) Greater Power of the Material Plane Symbol: Turtle shell studded with granite, hematite, and/or marble chips Alignment: N Portfolio: Knowledge, Thought, Currents, Philosophy, Wisdom, Invention, Books, Sacred Texts, Attainment, Turtles, Dragon Turtles, Sturdiness, and Dependability Domains: Crafting, Dream, Illumination, Knowledge, Protection, Strength, and Water Favored Weapon: 'War Shell' (heavy mace); Uceracea (The Unicorn, The Pearly Steeds, The Pearl Eye) Greater Power of the Material Plane Symbol: Profile of a unicorn head with a pearl or white enameled horn Alignment: CG Portfolio: Unicorns, Sacred Animals, Instinct, Secrets, Serene Settings, Pools, Lakes, Purification, Beauty, Gracefulness, Harmony With Nature, Protection, Rangers, and Copper Dragons Domains: Animal, Dream, Good, Healing, Knowledge, Magic, Protection, and Water Favored Weapon: 'Pearled Horn' (light lance); Urthur (The Greatdrake, The Giant Wyrm, The Sapphire Eye) Greater Power of the Material Plane Symbol: Blue enameled eye Alignment: LG Portfolio: Guardianship, Guardians, Steadfastness, Protection, Promises, Trust, Duty, Loyalty, Bronze Dragons, and Paladins Domains: Dragon, Good, Homestead, Law, Protection, and Strength Favored Weapon: 'The Deterrent' (halberd); Nameless Drake (The Unseen, The Unknowable, The Unforgiving) Intermediate Power of the Material Plane Symbol: Black triangle Alignment: NE Portfolio: Hate, Fear, Cruelty, Envy, Malice, Torture, Suffering, and Sadism Domains: Charm, Curses, Darkness, Destruction, Evil, Trickery, and War Favored Weapon: 'Whirling Pain' (spiked chain)`;

    // Dynamic user input is used here
    $.user`${personalNarrative}\n\n${updatedGameConsole}\n\n${userInput}`;
    //  $.user`${userInput}`;

    let response = await $.assistant.generation();

    // Depending on how Retort-JS manages input, you might need to adjust how the response is captured and returned
    //   return response; // This might need to be adjusted based on Retort-JS's handling of responses
  }));
}

module.exports = { retortWithUserInput };