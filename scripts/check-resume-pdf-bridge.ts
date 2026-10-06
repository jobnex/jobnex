import assert from "node:assert/strict";
import { callResumePdfBackend, exportResumePdf } from "../lib/resume-pdf-backend";

// No cloud calls or real credentials: exercise the two-token bridge and exact export.
async function main() {
  const original = globalThis.fetch;
  process.env.RESUME_PDF_BACKEND_URL = "https://pdf.example.test";
  process.env.RESUME_PDF_BACKEND_TOKEN = "synthetic-service-token";
  const calls: { url: string; init?: RequestInit }[] = [];
  let conflict = false;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("metadata.google.internal")) return new Response("synthetic-google-token");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer synthetic-service-token");
    assert.equal(headers.get("X-Serverless-Authorization"), "Bearer synthetic-google-token");
    assert.equal(headers.get("X-User-Id"), "candidate-id");
    if (String(url).endsWith("/preview")) {
      assert.deepEqual(JSON.parse(String(init?.body)), { markdown: "# Evidence", template_id: "mit-capd" });
      return Response.json({ preview_id: "preview-id", revision: "absent", pdf_sha256: "pdf-hash", markdown_sha256: "md-hash" });
    }
    assert.deepEqual(JSON.parse(String(init?.body)), { preview_id: "preview-id", expected_revision: "absent" });
    return Response.json({ revision: "saved" }, { status: conflict ? 409 : 200 });
  };
  try {
    const saved = await exportResumePdf("candidate-id", "job-id", "# Evidence", "mit-capd");
    assert.equal(saved.response.status, 200);
    assert.equal(saved.artifact?.preview_id, "preview-id");
    assert.equal(calls.length, 4);
    assert.equal(new URL(calls[0].url).searchParams.get("audience"), "https://pdf.example.test");
    conflict = true;
    assert.equal((await exportResumePdf("candidate-id", "job-id", "# Evidence", "mit-capd")).response.status, 409);
    process.env.RESUME_PDF_BACKEND_URL = "http://pdf.example.test";
    await assert.rejects(callResumePdfBackend("candidate-id", "job-id", "resume"), /not configured/);
    console.log("PASS: separate IAM/app tokens, verified identity, exact-preview export, conflict propagation, HTTPS requirement");
  } finally { globalThis.fetch = original; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
