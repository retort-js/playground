module.exports = require("retort-js").retort(async $ => {
  $.user`
  Write a brief summary of how SEO works for website pages. 
  How should the user use keywords to optimise the web-site SEO performance? Explain any technical terms you use such as 'long-tail' or 'meta-tags'.
  Describe what makes for a good 'meta-tag' and give examples.
  `;

  return $.assistant.generation();
});
