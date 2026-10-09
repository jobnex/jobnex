import assert from "node:assert/strict";
import { normalizeResume, resumeMarkdown, resumeText } from "../lib/resume-content";

const source = {text:"Original source",compiler_payload:{templateId:"mit-capd",markdown:"# Old name\n\n## Experience\nOld role\n\n## Projects\nBuilt a queue\n\n## Skills\nSQL"},personalDetails:{fullName:"New name"},experienceHistory:[{role:"Engineer",company:"Acme",jobDescription:"Built APIs"}],educationHistory:[]};
const merged = normalizeResume(source,true);
const markdown = resumeMarkdown(merged);
assert(markdown.includes("# New name") && markdown.includes("Built APIs"));
assert(!markdown.includes("Old role") && !markdown.includes("Old name"));
assert(markdown.includes("Built a queue") && markdown.includes("SQL"));
assert.equal(merged.text,"Original source");
assert.equal((merged.compiler_payload as Record<string,unknown>).templateId,"mit-capd");
assert.equal(resumeText(JSON.stringify(merged),{}),markdown);
assert.equal(resumeText(null,{text:"Uploaded PDF text"}),"# Resume\n\nUploaded PDF text");
assert.equal(resumeText(null,{}),"");
assert.equal(resumeText("{invalid",{}),"");
assert.equal(resumeText("# Existing Markdown",{}),"# Existing Markdown");
console.log("Resume content checks passed");
