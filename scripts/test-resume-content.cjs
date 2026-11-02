const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require('typescript');
function load(file){const m=new Module(file);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);return m.exports;}
const parser=load(path.join(root,'lib/resume-parser.ts')),content=load(path.join(root,'lib/resume-content.ts'));
const md='# Example Person\nexample@example.com\n\n## Summary\nExperienced engineer builds reliable\ndata pipelines.\n\n## Skills\nTools: Python,\nSQL\n\n## Experience\n### Engineer\n**Example Corp** | Jan 2020 - Present\nSeattle, WA\n- Built reliable services.\n\n## Projects\nExample Project\n- Saved 50% of processing time.';
const d=parser.parseResumeMarkdown(md);
assert.equal(d.summary.length,1);assert.equal(d.skills[0].items,'Python, SQL');
assert.equal(d.experience[0].location,'Seattle, WA');assert.equal(d.experience[0].bullets.length,1);
assert(parser.serializeResumeToMarkdown(d).includes('Saved 50%'));
const details={personalDetails:{fullName:'Example Person'},header:{additional_contacts:['Seattle, WA']},educationHistory:[{college:'Example University',degree:'M.S.',details:'Generative AI',grade:'3.60',maxGrade:'4.00',location:'Boston, MA'}],experienceHistory:[{company:'Example Corp',location:'Austin, TX',role:'Engineer',jobDescription:'Built services.'}],compiler_payload:{markdown:md}};
const source=fs.readFileSync(path.join(root,'app/actions/preferences.ts'),'utf8');
const schema=source.slice(source.indexOf('const EducationEntrySchema'),source.indexOf('const PersonalDetailsSchema'));
const scope={z:require('zod').z,exports:{}};
vm.runInNewContext(ts.transpileModule(schema+'\nexports.education=EducationEntrySchema;exports.experience=ExperienceEntrySchema;',{}).outputText,scope);
details.educationHistory=details.educationHistory.map(e=>scope.exports.education.parse(e));
details.experienceHistory=details.experienceHistory.map(e=>scope.exports.experience.parse(e));
const saved=content.normalizeResume(details,true).compiler_payload.markdown;
for(const term of ['Generative AI','3.60/4.00','Seattle, WA','Austin, TX','Boston, MA','Saved 50%'])assert(saved.includes(term),term);
console.log('EDITOR_CONTENT_FIXES_VERIFIED');
