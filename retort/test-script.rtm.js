// This magic line allows you to use this file as both a script and a module.
module.exports = require("retort-js").script(async $ => {

    $.system`Write a haiku about LLMs (Large Language Models).`

    await $.assistant();

});
