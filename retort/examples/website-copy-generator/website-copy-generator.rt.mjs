import { Conversation, retort, run } from "retort-js";
import websiteDesignCriteria from './website-design-criteria.rt.js';
import seoGuide from './seo-guide.rt.js';
import copyWritingGuidance from './copy-writing-guidance.rt.js';

let $ = new Conversation();

$.user`
###Your role###
You are a brilliant copy-writer for B2B businesses, 
known for your ability to communicate complex propositions in simple, clear, engaging language.
`;

$.user`
###Website criteria###
This is what you know about writing great B2B websites:
${(await $.run(websiteDesignCriteria)).content}
`;

$.user`
###The Business###
This is what you know about the business:
$imports.gyre-business-summary
`;

$.user`
###SEO###
This is what you know about how SEO works for web-site pages:
${(await $.run(seoGuide)).content}
`;

$.user`
###Keywords###
Here are the keywords that need incorporating into the website
These keywords are rank-ordered in terms of search frequency
$imports.gyre-keywords
`;

$.user`
###Copywriting guidance###
This is what you know about writing good marketing and website copy:
${(await $.run(copyWritingGuidance)).content}
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
