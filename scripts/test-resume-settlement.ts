import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

// Exercise the real worker without opening a database connection or paid AI call.
process.env.DATABASE_URL = "postgres://unused:unused@127.0.0.1:1/unused";

async function main() {
  const { pool, processRequest } = await import("../services/resume-tailor/worker");
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  const sourceHash = (text: string) => hash(text.replace(/\r\n?/g, "\n"));
  type Generation = { status: string; resume_markdown: string; source_hash: string; job_hash: string; audit_json: Record<string, unknown> };
  let row = fixture(), generation: Generation | null = null;
  let wallet = 2, transaction = "pending", refunds = 0, calls = 0, capacityFull = false;
  const usage = new Set<string>();
  function fixture() {
    return { id: randomUUID(), user_id: "synthetic-user", job_id: randomUUID(), base_resume_id: randomUUID(),
      source_text: "# Synthetic résumé", job_description: "Synthetic  job description", include_summary: true,
      lease_token: "", status: "queued", credit_state: "held" };
  }
  function reset() { row = fixture(); generation = null; wallet = 2; transaction = "pending"; refunds = 0; calls = 0; usage.clear(); }
  async function query(sql: string, values: unknown[] = []) {
    const text = sql.replace(/\s+/g, " ");
    const result = (rows: unknown[] = []) => ({ rows, rowCount: rows.length });
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return result();
    if (text.startsWith("SELECT pg_advisory_xact_lock")) return result();
    if (text.startsWith("UPDATE resume_generation_requests SET status='running'")) {
      if (capacityFull || row.status !== "queued" || row.credit_state !== "held" || values[1] !== row.id) return result();
      row.status = "running"; row.lease_token = String(values[0]); return result([{ ...row }]);
    }
    if (text.startsWith("UPDATE resume_generation_requests SET status=$1")) {
      assert.match(text, /running_slot=NULL/);
      assert.match(text, /lease_token=\$4 AND status='running' AND credit_state='held'/);
      if (values[2] !== row.id || values[3] !== row.lease_token || row.status !== "running" || row.credit_state !== "held") return result();
      row.status = String(values[0]); row.credit_state = text.includes("credit_state='consumed'") ? "consumed" : "released";
      return result([{ id: row.id }]);
    }
    if (text.startsWith("SELECT status FROM resume_generation_requests")) return result([{ status: row.status }]);
    if (text.startsWith("SELECT status,resume_markdown")) {
      assert.match(text, /user_id=\$2 AND job_id=\$3 AND base_resume_id=\$4/);
      return result(generation && values[0] === row.id && values[1] === row.user_id && values[2] === row.job_id && values[3] === row.base_resume_id ? [generation] : []);
    }
    if (text.startsWith("INSERT INTO resume_ai_calls")) { assert.match(text, /ON CONFLICT\(id\) DO NOTHING/); usage.add(String(values[0])); return result(); }
    if (text.startsWith("UPDATE wallets")) { wallet++; return result(); }
    if (text.startsWith("UPDATE credit_transactions")) { transaction = text.includes("status='refunded'") ? "refunded" : "completed"; return result(); }
    if (text.startsWith("INSERT INTO credit_transactions")) { refunds++; return result(); }
    throw new Error(`Unexpected test query: ${text}`);
  }
  Object.assign(pool, { query, connect: async () => ({ query, release() {} }) });
  const agent = (status: string, mutate?: (saved: Generation) => void, crash = false) => async (_command: string, args: string[]) => {
    calls++;
    const markdown = "# Synthetic tailored résumé";
    generation = { status, resume_markdown: markdown, source_hash: sourceHash(row.source_text), job_hash: hash(row.job_description.replace(/\s+/gu, " ").trim()),
      audit_json: { status, resume_markdown: markdown, source_hash: sourceHash(row.source_text), job_hash: hash(row.job_description.replace(/\s+/gu, " ").trim()),
        error: status === "needs_review" ? "experience.roles" : null,
        usage: [{ model: "mock", stage: "mock", input_tokens: 2, output_tokens: 3, estimated_cost_usd: 0 }] } };
    mutate?.(generation);
    if (crash) throw new Error("mock_crash_after_save");
    await writeFile(args[args.indexOf("--out") + 1], markdown);
    return status === "needs_review" ? 2 : 0;
  };
  for (const status of ["completed", "completed_with_estimates", "needs_review"]) {
    reset();
    await processRequest(row.id, agent(status));
    assert.equal(row.status, status === "needs_review" ? "needs_review" : "completed");
    assert.equal(row.credit_state, "consumed"); assert.equal(wallet, 2); assert.equal(transaction, "completed"); assert.equal(refunds, 0); assert.equal(usage.size, 1);
    assert.equal(await processRequest(row.id, agent(status)), false); assert.equal(calls, 1); assert.equal(wallet, 2);
  }
  for (const mutate of [
    (saved: Generation) => { saved.resume_markdown = "   "; },
    (saved: Generation) => { saved.audit_json.status = "completed"; },
    (saved: Generation) => { saved.audit_json.usage = []; },
    (saved: Generation) => { saved.source_hash = "other-source"; saved.audit_json.source_hash = "other-source"; },
    (saved: Generation) => { saved.job_hash = "other-job"; saved.audit_json.job_hash = "other-job"; },
  ]) {
    reset(); await processRequest(row.id, agent("needs_review", mutate));
    assert.equal(row.credit_state, "released"); assert.equal(wallet, 3); assert.equal(refunds, 1);
    await processRequest(row.id, agent("completed")); assert.equal(refunds, 1); assert.equal(calls, 1);
  }
  reset(); await processRequest(row.id, agent("needs_review", undefined, true));
  assert.equal(row.status, "needs_review"); assert.equal(row.credit_state, "consumed"); assert.equal(wallet, 2); assert.equal(refunds, 0);
  reset(); row.source_text = "# Windows résumé\r\nExperience\rAdditional details";
  await processRequest(row.id, agent("needs_review"));
  assert.equal(row.credit_state, "consumed", "Match Python's CRLF/CR newline handling");
  reset(); await processRequest(row.id, async () => { calls++; throw new Error("mock_no_output"); });
  assert.equal(row.status, "failed"); assert.equal(wallet, 3); assert.equal(refunds, 1);
  reset(); await processRequest(row.id, agent("needs_review", () => { row.lease_token = "new-owner"; }));
  assert.equal(row.credit_state, "held"); assert.equal(transaction, "pending"); assert.equal(wallet, 2);
  reset(); capacityFull = true;
  await assert.rejects(processRequest(row.id, agent("completed")), /request_busy/);
  assert.equal(row.status, "queued"); assert.equal(row.credit_state, "held");
  assert.equal(calls, 0); assert.equal(refunds, 0); assert.equal(wallet, 2);
  capacityFull = false;
  await processRequest(row.id, agent("completed"));
  assert.equal(row.credit_state, "consumed"); assert.equal(calls, 1);
  await pool.end();
  console.log("PASS: completed/review settlement, duplicate delivery, output refunds, crash recovery, lease fencing, and queued capacity deferral without AI/refund; no DB or AI calls");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
