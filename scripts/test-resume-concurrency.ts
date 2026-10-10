import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

process.env.DATABASE_URL = "postgres://unused:unused@127.0.0.1:1/unused";

async function main() {
  const { pool, processRequest } = await import("../services/resume-tailor/worker");
  const rows = Array.from({ length: 4 }, () => ({ id: randomUUID(), user_id: randomUUID(), job_id: randomUUID(),
    base_resume_id: randomUUID(), source_text: "# Synthetic resume", job_description: "Synthetic job", include_summary: true,
    status: "queued", credit_state: "held", lease_token: "" }));
  const saved = new Map<string, object>();
  const folders = new Set<string>();
  const charged = new Set<string>();
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  async function query(sql: string, values: unknown[] = []) {
    const text = sql.replace(/\s+/g, " ");
    const result = (data: unknown[] = []) => ({ rows: data, rowCount: data.length });
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return result();
    if (text.startsWith("SELECT pg_advisory_xact_lock")) return result();
    if (text.startsWith("UPDATE resume_generation_requests SET status='running'")) {
      const row = rows.find(row => row.id === values[1]);
      if (!row || row.status !== "queued") return result();
      row.status = "running"; row.lease_token = String(values[0]); return result([{ ...row }]);
    }
    if (text.startsWith("SELECT status FROM")) return result(rows.filter(row => row.id === values[0]));
    if (text.startsWith("SELECT status,resume_markdown")) {
      const row = rows.find(row => row.id === values[0] && row.user_id === values[1] && row.job_id === values[2] && row.base_resume_id === values[3]);
      return result(row && saved.has(row.id) ? [saved.get(row.id)] : []);
    }
    if (text.startsWith("UPDATE resume_generation_requests SET status=$1")) {
      const row = rows.find(row => row.id === values[2] && row.lease_token === values[3] && row.status === "running");
      if (!row) return result();
      assert.match(text, /credit_state='consumed'/);
      row.status = String(values[0]); row.credit_state = "consumed"; return result([{ id: row.id }]);
    }
    if (text.startsWith("UPDATE credit_transactions")) {
      assert(rows.some(row => row.user_id === values[0] && row.id === values[1]));
      charged.add(String(values[1])); return result();
    }
    if (text.startsWith("INSERT INTO resume_ai_calls")) return result();
    throw new Error("Unexpected query: " + text);
  }
  Object.assign(pool, { query, connect: async () => ({ query, release() {} }) });
  let entered = 0;
  let unlock!: () => void;
  const barrier = new Promise<void>(resolve => { unlock = resolve; });
  const timer = setTimeout(unlock, 3000);
  try {
    const agent = async (_command: string, args: string[], folder: string) => {
      const id = args[args.indexOf("--generation-id") + 1];
      const row = rows.find(row => row.id === id)!;
      assert.equal(args[args.indexOf("--tenant-id") + 1], row.user_id);
      folders.add(folder);
      if (++entered === 4) unlock();
      await barrier;
      assert.equal(entered, 4, "Four independent users must enter the agent before any completes");
      const markdown = "# Draft " + id;
      const audit = { status: "completed", resume_markdown: markdown, source_hash: hash(row.source_text), job_hash: hash(row.job_description),
        usage: [{ model: "mock", stage: "mock", input_tokens: 1, output_tokens: 1, estimated_cost_usd: 0 }] };
      saved.set(id, { ...audit, audit_json: audit });
      await writeFile(args[args.indexOf("--out") + 1], markdown);
      return 0;
    };
    await Promise.all(rows.map(row => processRequest(row.id, agent)));
    assert.equal(folders.size, 4);
    assert.equal(charged.size, 4);
    assert(rows.every(row => row.status === "completed" && row.credit_state === "consumed"));
    await Promise.all(rows.map(row => processRequest(row.id, agent)));
    assert.equal(entered, 4, "Duplicate delivery must not repeat agent work");
    console.log("PASS: four users overlap; isolated tenant IDs, folders, outputs and credit settlement; duplicate delivery does not rerun; no DB or AI calls");
  } finally { clearTimeout(timer); await pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
