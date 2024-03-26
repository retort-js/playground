module.exports = require("retort-js").retort(async $ => {
  $.user`
  ###Your role###
  You are leading writer of website  copy for B2B businesses. 

  Summarise your 5 most important insights about writing this kind of copy
  `;

  return $.assistant.generation();
});
