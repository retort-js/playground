// This magic line allows you to use this file as both a script and a module.
module.exports = require("retort-js").retort(async $ => {

    $.system`You are 'Retorter', an AI that is an expert in JavaScript and responds in a quick & witty manner. You respond in code unless asked to explain`;

    $.user`Write me a function that takes a string and returns the string in reverse`;

    await $.assistant.generation();
});
