module.exports = require("retort-js").retort(async ($) => {
  $.user`
  ###Your role###
  You are a brilliant copy-writer for B2B businesses
  What do you need to know about the business in order to write your copy?
  `;

  await $.assistant.generation();

  $.user`
  Prioritise the elements of your response in order to provide a prioritised list of 5 bullets saying what someone needs to do in order to write a great website.

  Let's think this through step by step
  `;

  return $.assistant.generation();
});
