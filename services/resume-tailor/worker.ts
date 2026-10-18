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
      else if (code === 0 || code === 2 || code === 3) resolve(code);
      else reject(new Error("agent_failed"));
    });
  });
}

async function release(request: RequestRow, status: "failed" | "needs_review", errorCode: string, expectedStatus = "running") {
  const client = await pool.connect();
  try { await client.query("BEGIN");
    const released = await client.query(`UPDATE resume_generation_requests SET status=$1,running_slot=NULL,credit_state='released',error_code=$2,finished_at=now()
      WHERE id=$3 AND lease_token IS NOT DISTINCT FROM $4::uuid AND status=$5 AND credit_state='held' RETURNING id`,
      [status, errorCode.slice(0, 120), request.id, request.lease_token, expectedStatus]);
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
    const completed = await client.query(`UPDATE resume_generation_requests SET status=$1,running_slot=NULL,credit_state='consumed',error_code=$2,finished_at=now()
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

function usableAudit(audit: Record<string, unknown>, status: string) {
  if (!Array.isArray(audit.compliance_ledger) || !audit.compliance_ledger.length) return false;
  const reviewable = new Set(["length.word_count", "length.fit_unavailable", "experience.bullet_count", "project.bullet_count", "projects.bullet_count",
    "projects.purpose_order", "skills.category_count", "experience.metric_count", "projects.metric_count"]);
  return audit.compliance_ledger.every(check => check && typeof check.code === "string"
    && typeof check.passed === "boolean" && ["error", "warning", "info"].includes(check.severity)
    && (check.passed || check.severity !== "error" || (status === "needs_review" && reviewable.has(check.code))));
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
  if (!usableAudit(audit, generation.status)) return false;
  // The persisted agent audit is authoritative; retries never invoke AI again.
  await recordUsage(request, audit.usage);
  const status = generation.status === "needs_review" ? "needs_review" : "completed";
  await complete(request, status, status === "needs_review" ? String(audit.error || "needs_review").slice(0, 120) : null);
  return true;
}

async function claim(requestId: string): Promise<RequestRow | null> {
  const client = await pool.connect(); const lease = randomUUID();
  try { await client.query("BEGIN");
    // Serialize claims for one user only. Release the lock before starting AI work.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('resume-running:' || user_id,0))
      FROM resume_generation_requests WHERE id=$1`, [requestId]);
    const result = await client.query(`UPDATE resume_generation_requests SET status='running',
      lease_token=$1,lease_expires_at=now()+interval '15 minutes',
      running_slot=(SELECT slot FROM generate_series(1,2) slot WHERE NOT EXISTS
        (SELECT 1 FROM resume_generation_requests busy WHERE busy.user_id=resume_generation_requests.user_id
          AND busy.status='running' AND busy.running_slot=slot) ORDER BY slot LIMIT 1)
      WHERE id=$2 AND status='queued' AND credit_state='held' AND EXISTS
        (SELECT 1 FROM generate_series(1,2) slot WHERE NOT EXISTS
          (SELECT 1 FROM resume_generation_requests busy WHERE busy.user_id=resume_generation_requests.user_id
            AND busy.status='running' AND busy.running_slot=slot)) RETURNING *`, [lease, requestId]);
    await client.query("COMMIT"); return result.rows[0] || null;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function processRequest(requestId: string, agent = run) {
  const request = await claim(requestId);
  if (!request) {
    const result = await pool.query(`SELECT status FROM resume_generation_requests WHERE id=$1`, [requestId]);
    if (['queued', 'running'].includes(result.rows[0]?.status)) throw new Error("request_busy");
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
    if (code === 3) {
      // Keep the held credit while the durable provider batch is processing.
      // A queued delivery replays cached stages and polls the same batch ID.
      await resumeBatch(request);
      return true;
    }
    if (code === 2) {
      // A persisted review draft is billable, but remains explicitly unapproved.
      if (!await recoverOutput(request)) await release(request, "failed", "no_verified_review_output");
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

async function resumeBatch(request: RequestRow) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paused = await client.query(`UPDATE resume_generation_requests SET status='queued',running_slot=NULL,
      lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2 AND status='running'
      AND credit_state='held' RETURNING id`, [request.id, request.lease_token]);
    if (paused.rows[0]) await client.query(`UPDATE resume_dispatch_outbox SET attempts=0,batch_poll_count=batch_poll_count+1,
      dispatched_at=NULL,next_attempt_at=now()+interval '1 minute' WHERE request_id=$1`, [request.id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function recover() {
  // Fence expired leases before settlement. Never reclaim them for another AI run.
  const expired = await pool.query(`UPDATE resume_generation_requests SET lease_token=gen_random_uuid()
    WHERE id IN (SELECT id FROM resume_generation_requests WHERE status='running'
      AND lease_expires_at<now() ORDER BY lease_expires_at LIMIT 20 FOR UPDATE SKIP LOCKED)
    RETURNING *`);
  for (const request of expired.rows) {
    if (await recoverOutput(request)) continue;
    // Cached synchronous stages are not pending batches. Replaying a crashed
    // synchronous pipeline can repeat its next paid call and hold credit forever.
    const durable = await pool.query(`SELECT 1 FROM resume_model_batches WHERE request_id=$1
      AND batch_id IS NOT NULL AND submitted=true AND response IS NULL
      AND created_at>now()-interval '48 hours' LIMIT 1`, [request.id]);
    if (durable.rows[0]) await resumeBatch(request);
    else await release(request, "failed", "interrupted_attempt_no_verified_output");
  }
  // An outbox that exhausted delivery attempts must settle, not merely log.
  // The queued-state/lease guard prevents refunding a concurrently claimed run.
  const exhausted = await pool.query(`SELECT r.* FROM resume_generation_requests r
    JOIN resume_dispatch_outbox o ON o.request_id=r.id
    WHERE r.status='queued' AND r.credit_state='held' AND o.attempts>=10`);
  for (const request of exhausted.rows) await release(request, "failed", "dispatch_exhausted", "queued");
  const due = await pool.query(`SELECT o.request_id FROM resume_dispatch_outbox o
    JOIN resume_generation_requests r ON r.id=o.request_id
    WHERE r.status='queued' AND o.next_attempt_at<=now() AND o.attempts<10
    ORDER BY o.next_attempt_at LIMIT 10`);
  for (const row of due.rows) await dispatchRequest(pool, row.request_id);
  return { recovered: expired.rowCount, checked: due.rowCount, exhausted: exhausted.rowCount };
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
