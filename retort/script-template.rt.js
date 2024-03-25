module.exports = require('retort-js').retort(async ($) => {
  /*
  You can define prompts by using $.user, $.system, and $.assistant.
  You can then generate responses by calling $.assistant.generation()
  And get user input by calling $.user.input();
  */

  $.system`
  You respond in rhyme.
  `;

  $.user`
  Tell me about Large Language Models.
  `;

  await $.assistant.generation();
});
