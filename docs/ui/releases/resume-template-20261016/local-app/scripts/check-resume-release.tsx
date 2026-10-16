import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildBaseResume } from "../lib/base-resume";
import { parseResumeMarkdown, serializeResumeToMarkdown } from "../lib/resume-parser";
import { ResumeSheet } from "../components/ResumeSheet";
import { resumePageEnds } from "../components/A4ResumePages";
import type { ResumeDetailsData } from "../lib/db/schema/preferences";

// Real content checks, using synthetic identity only; no DB/provider mutation.
const education = (college: string, degree: string) => ({ id: college, college, degree, field: "", startDate: "2020", endDate: "2024", grade: "", maxGrade: "", gradeType: "" });
const experience = (company: string, role: string, description: string) => ({ id: company, company, role, startDate: "2024", endDate: "", jobDescription: description, responsibilities: "", skills: [], domains: [] });
const facts: ResumeDetailsData = {
  personalDetails: { fullName: "Test Candidate", phoneNumber: "+1 212 555 0101", email: "candidate@example.test", linkedin: "https://linkedin.com/in/test-candidate", website: "https://portfolio.example.test" },
  educationHistory: [education("First University", "BSc"), education("Second University", "MSc")],
  experienceHistory: [experience("Example Labs", "Engineer", "Built a queue processor."), experience("Example Data", "Developer", "Implemented data validation.")],
};
const markdown = buildBaseResume(facts, ["Python", "SQL"]);
const parsed = parseResumeMarkdown(markdown);
assert.equal(parsed.personalInfo.name, "Test Candidate");
assert.ok(parsed.personalInfo.phone.includes("212"));
assert.ok(parsed.personalInfo.linkedin.includes("test-candidate"));
assert.equal(parsed.education.length, 2, "Every supplied education entry must survive parsing.");
assert.equal(parsed.experience.length, 2);
assert.equal(parsed.experience[0].company, "Example Labs");
assert.equal(parsed.experience[0].bullets[0], "Built a queue processor.");
assert.ok(parsed.skills.some(skill => skill.items.includes("Python")));
const sparse = buildBaseResume({ personalDetails: { fullName: "Only Name" } });
assert.equal(sparse.trim(), "# Only Name", "Empty facts must not invent work, qualifications, contact details or skills.");
assert.throws(() => buildBaseResume({}), /full name/i);
const incompleteEducation = parseResumeMarkdown(buildBaseResume({ personalDetails: { fullName: "Test Candidate" }, educationHistory: [education("Only School", "")] }));
assert.equal(incompleteEducation.education.length, 1, "Missing degree cannot create a phantom education entry.");
assert.equal(incompleteEducation.education[0].institution, "Only School");
assert.ok(!/Alex Rivera|TechFlow|Texas at Austin|Spearheaded|cross.functional/.test(markdown));

// Every style must retain contact, company, technical skills and projects.
const withProject = markdown + "\n## Technical Projects\n### Safe Queue | Python | 2025\n- Handled retries without losing tasks.\n";
for (const themeId of [2, 3, 5, 6] as const) {
  const html = renderToStaticMarkup(<ResumeSheet markdown={withProject} themeId={themeId} />);
  for (const text of ["Test Candidate", "candidate@example.test", "+1 212 555 0101", "linkedin.com/in/test-candidate", "portfolio.example.test", "Example Labs", "First University", "Second University", "Python", "Safe Queue", "Handled retries without losing tasks."]) {
    assert.ok(html.includes(text), `Theme ${themeId} lost ${text}`);
  }
  assert.ok(!html.includes("**Example Labs**"), "Inline Markdown markers cannot leak into company labels.");
  assert.ok(html.includes('aria-label="Resume page 1 of 1"'));
}
assert.deepEqual(resumePageEnds([40, 40, 40], [false, true, false], 100), [1, 3], "A heading must move with its first entry.");
assert.deepEqual(resumePageEnds([40, 40, 40], [false, false, false], 100), [2, 3]);

// A real generated draft contained "### ### AI Engineer". Treat repeated ATX
// prefixes as formatting, without borrowing a company from a different role.
const malformed = `# Test Candidate
candidate@example.test | +1 212 555 0101
## Experience
### AI Engineer | **Example Labs** | Remote | 2024 – Present
- First role bullet.
### ### AI Engineer
- Second role bullet.
## Professional Summary
- Built dependable software.
## Skills
Languages: Python, SQL
## Projects
#### **### Safe Queue**
- Project bullet.
## Education
### ### Test University
*MSc* | 2024
**GPA: 3.8**
`;
const repaired = parseResumeMarkdown(malformed);
assert.deepEqual(repaired.experience.map(item => item.role), ["AI Engineer", "AI Engineer"]);
assert.equal(repaired.experience[0].company, "Example Labs");
assert.equal(repaired.experience[1].company, "", "Never invent or copy a missing employer.");
assert.deepEqual(repaired.experience.map(item => item.bullets), [["First role bullet."], ["Second role bullet."]]);
assert.equal(repaired.projects[0].title, "Safe Queue");
assert.equal(repaired.education[0].institution, "Test University");
const roundTrip = parseResumeMarkdown(serializeResumeToMarkdown(repaired));
assert.deepEqual(roundTrip.experience, repaired.experience);
assert.deepEqual(roundTrip.projects, repaired.projects);
assert.equal(roundTrip.education[0].details, "GPA: 3.8", "Editing another field must not relabel supplied education details.");
assert.deepEqual(roundTrip.sectionOrder, repaired.sectionOrder, "Retain supplied section order.");
for (const themeId of [2, 3, 5, 6] as const) {
  const html = renderToStaticMarkup(<ResumeSheet markdown={malformed} themeId={themeId} />);
  for (const text of ["First role bullet.", "Second role bullet.", "Example Labs", "Safe Queue", "Project bullet.", "Test University", "Python, SQL"]) assert.ok(html.includes(text), `Theme ${themeId} lost ${text}`);
  assert.ok(!html.includes("###"), `Theme ${themeId} leaked heading markers`);
}
assert.deepEqual(resumePageEnds([50, 10, 15, 30], [false, true, true, false], 100), [1, 4], "A section heading and role must move together with the first bullet.");
console.log("RESUME RELEASE CHECKS PASSED: factual sparse/full base, all education/experience/contact/project entries, all four themes and A4 breaks.");

async function checkRouteBoundaries() {
  const { readFileSync, existsSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const { runInNewContext } = await import("node:vm");
  const { transpileModule, ModuleKind } = await import("typescript");
  const { z } = await import("zod");
  const production = existsSync(resolve(process.cwd(), "app/api/resume/tailor/generated/[requestId]/pdf/route.ts"))
    ? process.cwd() : resolve(process.cwd(), "../../../resume-quality-review/heading-web-build");
  type Context = { params: Promise<Record<string, string>> };
  type Route = { POST: (request: Request, context: Context) => Promise<Response>; GET: (request: Request, context: Context) => Promise<Response>; PATCH: (request: Request, context: Context) => Promise<Response> };
  function loadRoute(file: string, mocks: Record<string, unknown>): Route {
    const output = transpileModule(readFileSync(resolve(production, file), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
    const exports = {};
    runInNewContext(output, { exports, Response, URL, Buffer, Request, Error,
      require: (name: string) => { if (!(name in mocks)) throw new Error("Unexpected dependency " + name); return mocks[name]; } });
    return exports as Route;
  }
  const oldId = "10000000-0000-4000-8000-000000000001";
  const latestId = "10000000-0000-4000-8000-000000000002";
  const jobId = "20000000-0000-4000-8000-000000000001";
  let current = oldId;
  let savedMarkdown = "Current draft";
  let exportsCalled = 0;
  let expected: string | undefined;
  const pdf = loadRoute("app/api/resume/tailor/generated/[requestId]/pdf/route.ts", {
    "@/lib/auth/server": { getCurrentUser: async () => ({ id: "fixture-owner" }) },
    "@/lib/resume-tailoring": { loadAvailableGeneration: async () => ({ id: current, job_id: jobId, resume_markdown: "Current draft" }) },
    "@/lib/job-resumes": { ownsApplication: async () => true,
      latestJobResume: async () => ({ status: "ready", r2_object_key: "owned-fixture.pdf", markdown: savedMarkdown }),
      exportJobResume: async (_user: string, _job: string, _markdown: string, _template: string, generationId?: string) => {
        exportsCalled++; expected = generationId;
        if (generationId !== latestId) throw new Error("A newer resume is available.");
        return { downloadUrl: "https://example.invalid/current.pdf" };
      } },
    "@/lib/db": { pool: { query: async () => ({ rows: [{ id: latestId }] }) } },
    "@aws-sdk/client-s3": { GetObjectCommand: class {} },
    "@aws-sdk/s3-request-presigner": { getSignedUrl: async () => "https://example.invalid/current.pdf" },
    "@/lib/storage/r2": { r2Client: {}, R2_BUCKET_NAME: "fixture" },
    zod: { z },
  });
  const context = () => ({ params: Promise.resolve({ requestId: current }) });
  const post = () => new Request("https://example.invalid/pdf", { method: "POST", body: JSON.stringify({ markdown: "Edited draft", templateId: "modern-ivy" }) });
  assert.equal((await pdf.POST(post(), context())).status, 409, "Historical POST must use the shared atomic generation guard.");
  assert.equal(expected, oldId);
  assert.equal((await pdf.GET(new Request("https://example.invalid/pdf"), context())).status, 409, "Historical GET cannot mislabel current job PDF.");
  current = latestId;
  assert.equal((await pdf.POST(post(), context())).status, 200);
  assert.equal(expected, latestId);
  assert.equal(exportsCalled, 2);
  savedMarkdown = "Previous generation draft";
  assert.equal((await pdf.GET(new Request("https://example.invalid/pdf"), context())).status, 404, "A ready PDF for different Markdown must not be downloaded.");
  savedMarkdown = "Current draft";
  assert.equal((await pdf.GET(new Request("https://example.invalid/pdf?previewId=expired"), context())).status, 410);
  assert.equal((await pdf.GET(new Request("https://example.invalid/pdf"), context())).headers.get("Location"), "https://example.invalid/current.pdf");

  let active = false, pending = false;
  const queries: string[] = [];
  const client = { release() {}, query: async (query: string) => {
    queries.push(query);
    if (query.includes("SELECT r.id FROM")) return { rows: active ? [{ id: oldId }] : [] };
    if (query.includes("SELECT id FROM resume_generation_requests")) return { rows: pending ? [{ id: latestId }] : [] };
    if (query.includes("RETURNING resume_details")) return { rows: [{ resume_details: { compiler_payload: { markdown: "Edited source" } } }] };
    if (query.includes("RETURNING id,content")) return { rows: [{ id: oldId, content: "Edited source" }] };
    return { rows: [] };
  } };
  const base = loadRoute("app/api/resume/tailor/resumes/[resumeId]/route.ts", {
    "@/lib/auth/server": { getCurrentUser: async () => ({ id: "fixture-owner" }) },
    "@/lib/db": { pool: { connect: async () => client } },
    "@/lib/resume-tailoring": { isUuid: () => true },
  });
  const patch = () => new Request("https://example.invalid/base", { method: "PATCH", body: JSON.stringify({ markdown: "Edited source" }) });
  const baseContext = { params: Promise.resolve({ resumeId: oldId }) };
  assert.equal((await base.PATCH(patch(), baseContext)).status, 404, "Deleted base cannot be reactivated by a delayed draft save.");
  assert.ok(queries.some(query => query.includes("pg_advisory_xact_lock")));
  assert.ok(!queries.some(query => query.startsWith("UPDATE")));
  active = true; pending = true; queries.length = 0;
  assert.equal((await base.PATCH(patch(), baseContext)).status, 409, "Source mutation must be blocked during active generation.");
  assert.ok(!queries.some(query => query.startsWith("UPDATE")));
  pending = false; queries.length = 0;
  assert.equal((await base.PATCH(patch(), baseContext)).status, 200);
  assert.ok(queries.some(query => query.includes("active_resume_id=$2 RETURNING")));
  console.log("RESUME ROUTE REGRESSIONS PASSED: historical generation, stale PDF content, deleted base and active generation mutation guards.");
}
checkRouteBoundaries().catch(error => { console.error(error); process.exitCode = 1; });
