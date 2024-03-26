module.exports = require("retort-js").retort(async $ => {

  $.system`
  You are a brilliant copy-writer for B2B businesses, 
  known for your ability to communicate complex propositions in simple, clear, engaging language.
  Format your responses in markdown
  `;

  $.user`
  ###Website criteria###
  This is what you know about writing great B2B websites:
  ${(await $.run(import('./website-design-criteria.rt.js'))).content}
  `;

  const businessSummary = await $.user.input({query: "Please enter a summary of your business: "});

  $.user`
  ###The Business###
  This is what you know about the business:
  ${businessSummary.content}
  `;

  $.user`
  ###SEO###
  This is what you know about how SEO works for web-site pages:
  ${(await $.run(import('./seo-guide.rt.js'))).content}
  `;

  const keywords = await $.user.input({query: "Please enter your SEO keywords: "});

  $.user`
  ###Keywords###
  Here are the keywords that need incorporating into the website
  These keywords are rank-ordered in terms of search frequency:
  ${keywords.content}
  `;

  $.user`
  ###Copywriting guidance###
  This is what you know about writing good marketing and website copy:
  ${(await $.run(import('./copy-writing-guidance.rt.js'))).content}
  `;

  $.user`
  Write 3 pages of website copy:
  Page 1/Homepage about the business overall, covering both the platform and the services business
  Page2/Product about the product/platform
  Page 3/Services about the professional services offered
  
  Be creative and engaging. 
  Use what you know about writing good marketing and website copy
  Ensure the sense of mission comes through
  `;

  await $.assistant.generation();

  $.user`
  You are an editor. 
  Review this website copy and identify any errors and inaccuracies. 
  
  Identify the errors and inaccuracies but do not re-write the website, simply make recommendations
  `;

  await $.assistant.generation();

  $.user`
  Integrate the editors comments into your final  website copy. 
  Ensure that paragraphs are less than 40 words
  Make sure it is appropriately formatted for a website
  `;

  await $.assistant.generation();
});


