import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { dispatchRequest } from "./dispatch";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
export const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000 });

type RequestRow = { id: string; user_id: string; job_id: string; base_resume_id: string; source_text: string; job_description: string; include_summary: boolean; lease_token: string };
type Usage = { stage: string; model: string; input_tokens: number; output_tokens: number; cache_read_tokens?: number; cache_write_tokens?: number; estimated_cost_usd: number; provider_cost_usd?: number | null; request_id?: string };
function run(command: string, args: string[], cwd: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    // Drain output, but never expose agent stderr containing candidate data or secrets.
    child.stdout.resume(); child.stderr.resume();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 600000);
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("close", code => { clearTimeout(timeout);
      if (timedOut) reject(new Error("worker_timeout"));
      else if (code === 0 || code === 2) resolve(code);
      else reject(new Error("agent_failed"));
    });
  });
}

async function release(request: RequestRow, status: "failed" | "needs_review", errorCode: string) {
  const client = await pool.connect();
  try { await client.query("BEGIN");
    const released = await client.query(`UPDATE resume_generation_requests SET status=$1,credit_state='released',error_code=$2,finished_at=now()
      WHERE id=$3 AND lease_token=$4 AND status='running' AND credit_state='held' RETURNING id`, [status, errorCode.slice(0, 120), request.id, request.lease_token]);
    if (!released.rows[0]) { await client.query("COMMIT"); return; }
    await client.query(`UPDATE wallets SET balance=balance+1,updated_at=now() WHERE user_id=$1`, [request.user_id]);
    await client.query(`UPDATE credit_transactions SET status='refunded' WHERE user_id=$1 AND reference_id=$2 AND status='pending'`, [request.user_id, request.id]);
    await client.query(`INSERT INTO credit_transactions(user_id,amount,transaction_type,status,reference_id,metadata)
      VALUES($1,1,'refund','completed',$2,$3)`, [request.user_id, request.id, JSON.stringify({ reason: errorCode })]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function complete(request: RequestRow, status: "completed" | "needs_review", errorCode: string | null) {
  const client = await pool.connect();
  try { await client.query("BEGIN");
    const completed = await client.query(`UPDATE resume_generation_requests SET status=$1,credit_state='consumed',error_code=$2,finished_at=now()
      WHERE id=$3 AND lease_token=$4 AND status='running' AND credit_state='held' RETURNING id`, [status, errorCode, request.id, request.lease_token]);
    if (completed.rows[0]) await client.query(`UPDATE credit_transactions SET status='completed' WHERE user_id=$1 AND reference_id=$2 AND status='pending'`, [request.user_id, request.id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function recordUsage(request: RequestRow, usageRecords: Usage[]) {
  for (const [index, usage] of usageRecords.entries()) {
    const reserved = usage.input_tokens + usage.output_tokens + (usage.cache_read_tokens || 0) + (usage.cache_write_tokens || 0);
    await pool.query(`INSERT INTO resume_ai_calls
      (id,request_id,user_id,provider,model,stage,status,reserved_tokens,input_tokens,output_tokens,cost_usd,raw_usage,response_id,finished_at)
      VALUES($1,$2,$3,'openrouter',$4,$5,'reported',$6,$7,$8,$9,$10,$11,now()) ON CONFLICT(id) DO NOTHING`,
      [usageId(request.id, index), request.id, request.user_id, usage.model, usage.stage, reserved, usage.input_tokens, usage.output_tokens,
        usage.provider_cost_usd ?? usage.estimated_cost_usd, JSON.stringify(usage), usage.request_id || null]);
  }
}

function usageId(requestId: string, index: number) {
  const bytes = createHash("sha256").update(`${requestId}:usage:${index}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function recoverOutput(request: RequestRow) {
  const result = await pool.query(`SELECT status,resume_markdown,audit_json,source_hash,job_hash FROM resume_generations
    WHERE id=$1 AND user_id=$2 AND job_id=$3 AND base_resume_id=$4
      AND status IN ('completed','completed_with_estimates','needs_review')`,
    [request.id, request.user_id, request.job_id, request.base_resume_id]);
  const generation = result.rows[0];
  const audit = generation?.audit_json;
  if (!generation?.resume_markdown?.trim() || !audit || audit.resume_markdown !== generation.resume_markdown
      || audit.status !== generation.status
      || !Array.isArray(audit.usage) || !audit.usage.length
      || audit.source_hash !== generation.source_hash || audit.job_hash !== generation.job_hash
      // Python read_text uses universal newlines before computing the source hash.
      || generation.source_hash !== createHash("sha256").update(request.source_text.replace(/\r\n?/g, "\n")).digest("hex")
      || generation.job_hash !== createHash("sha256").update(request.job_description.normalize("NFC").replace(/\s+/gu, " ").trim()).digest("hex")) return false;
  // The persisted agent audit is authoritative; retries never invoke AI again.
  await recordUsage(request, audit.usage);
  const status = generation.status === "needs_review" ? "needs_review" : "completed";
  await complete(request, status, status === "needs_review" ? String(audit.error || "needs_review").slice(0, 120) : null);
  return true;
}

async function claim(requestId: string): Promise<RequestRow | null> {
  const client = await pool.connect(); const lease = randomUUID();
  try { await client.query("BEGIN");
    const result = await client.query(`UPDATE resume_generation_requests SET status='running',
      lease_token=$1,lease_expires_at=now()+interval '15 minutes'
      WHERE id=$2 AND status='queued' AND credit_state='held' RETURNING *`, [lease, requestId]);
    await client.query("COMMIT"); return result.rows[0] || null;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function processRequest(requestId: string, agent = run) {
  const request = await claim(requestId);
  if (!request) {
    const result = await pool.query(`SELECT status FROM resume_generation_requests WHERE id=$1`, [requestId]);
    if (result.rows[0]?.status === 'running') throw new Error("request_busy");
    if (!result.rows[0]) throw new Error("request_missing");
    return false;
  }
  const folder = await mkdtemp(join(tmpdir(), "resume-tailor-"));
  try {
    const resume = join(folder, "resume.md"), jd = join(folder, "job.txt"), output = join(folder, "tailored.md");
    await Promise.all([writeFile(resume, request.source_text), writeFile(jd, request.job_description)]);
    const code = await agent(process.env.RESUME_PYTHON || "python", ["-m", "low_risk_agent", "--resume", resume, "--jd", jd,
      "--tenant-id", request.user_id, "--job-id", request.job_id, "--base-resume-id", request.base_resume_id,
      "--generation-id", request.id, "--summary", request.include_summary ? "yes" : "no", "--out", output], folder);
    if (code === 2) {
      // A persisted review draft is billable, but remains explicitly unapproved.
      if (!await recoverOutput(request)) await release(request, "needs_review", "no_verified_review_output");
      return true;
    }
    await readFile(output, "utf8"); // Agent already persisted this exact generation ID; verify output was produced before charging.
    if (!await recoverOutput(request)) throw new Error("persisted_output_unverified");
  } catch (error) {
    console.error("resume_generation_failure", { requestId, code: (error as { code?: string }).code || "worker_failure" });
    // A crash after DB persistence is recoverable without repeating a paid call.
    if (!await recoverOutput(request)) await release(request, "failed",
      error instanceof Error && error.message === "worker_timeout" ? "worker_timeout" : "worker_failure");
  }
  finally { await rm(folder, { recursive: true, force: true }); }
  return true;
}

export async function recover() {
  // Fence expired leases before settlement. Never reclaim them for another AI run.
  const expired = await pool.query(`UPDATE resume_generation_requests SET lease_token=gen_random_uuid()
    WHERE id IN (SELECT id FROM resume_generation_requests WHERE status='running'
      AND lease_expires_at<now() ORDER BY lease_expires_at LIMIT 20 FOR UPDATE SKIP LOCKED)
    RETURNING *`);
  for (const request of expired.rows) {
    if (!await recoverOutput(request)) await release(request, "needs_review", "interrupted_attempt_no_verified_output");
  }
  const due = await pool.query(`SELECT o.request_id FROM resume_dispatch_outbox o
    JOIN resume_generation_requests r ON r.id=o.request_id
    WHERE r.status='queued' AND o.next_attempt_at<=now() AND o.attempts<10
    ORDER BY o.next_attempt_at LIMIT 10`);
  for (const row of due.rows) await dispatchRequest(pool, row.request_id);
  const exhausted = await pool.query(`SELECT count(*)::int AS count FROM resume_dispatch_outbox o
    JOIN resume_generation_requests r ON r.id=o.request_id WHERE r.status='queued' AND o.attempts>=10`);
  if (exhausted.rows[0].count) console.error("resume_dispatch_exhausted", { count: exhausted.rows[0].count });
  return { recovered: expired.rowCount, checked: due.rowCount, exhausted: exhausted.rows[0].count };
}

async function main() {
  const enabled = process.env.RESUME_GENERATION_ENABLED === "true";
  const server = createServer(async (request, response) => {
    const reply = (status: number, body: object) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); };
    if (request.method === "GET" && request.url === "/health") return reply(200, { status: "ok", enabled, mode: "tasks" });
    if (request.method !== "POST" || !["/internal/process", "/internal/recover"].includes(request.url || "")) return reply(404, { error: "Not found" });
    if (!enabled) return reply(503, { error: "Generation disabled" });
    try {
      if (request.url === "/internal/recover") return reply(200, await recover());
      let data = "";
      for await (const chunk of request) { data += chunk; if (data.length > 1024) return reply(413, { error: "Payload too large" }); }
      const body = JSON.parse(data);
      if (Object.keys(body).length !== 1 || typeof body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) return reply(400, { error: "Invalid request ID" });
      await processRequest(body.requestId);
      return reply(200, { status: "settled" });
    } catch { console.error("resume_task_failed"); return reply(503, { error: "Processing unavailable" }); }
  });
  server.listen(Number(process.env.PORT || 8080), "0.0.0.0");
  const stop = () => { server.close(() => { void pool.end(); }); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
if (process.argv[1]?.endsWith("worker.ts")) main().catch(error => { console.error(error); process.exitCode = 1; });
