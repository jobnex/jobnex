import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

type RequestRow = { id: string; user_id: string; job_id: string; base_resume_id: string; source_text: string; job_description: string; include_summary: boolean; lease_token: string };
type Usage = { stage: string; model: string; input_tokens: number; output_tokens: number; cache_read_tokens?: number; cache_write_tokens?: number; estimated_cost_usd: number; provider_cost_usd?: number | null; request_id?: string };
function run(command: string, args: string[], cwd: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject); child.on("close", code => code === 0 || code === 2 ? resolve(code ?? 1) : reject(new Error(stderr.slice(-1000) || "resume agent failed")));
  });
}

async function release(request: RequestRow, status: "failed" | "needs_review", errorCode: string) {
  const client = await pool.connect();
  try { await client.query("BEGIN");
    const released = await client.query(`UPDATE resume_generation_requests SET status=$1,credit_state='released',error_code=$2,finished_at=now()
      WHERE id=$3 AND lease_token=$4 RETURNING id`, [status, errorCode.slice(0, 120), request.id, request.lease_token]);
    if (!released.rows[0]) { await client.query("COMMIT"); return; }
    await client.query(`UPDATE wallets SET balance=balance+1,updated_at=now() WHERE user_id=$1`, [request.user_id]);
    await client.query(`UPDATE credit_transactions SET status='refunded' WHERE user_id=$1 AND reference_id=$2 AND status='pending'`, [request.user_id, request.id]);
    await client.query(`INSERT INTO credit_transactions(user_id,amount,transaction_type,status,reference_id,metadata)
      VALUES($1,1,'refund','completed',$2,$3)`, [request.user_id, request.id, JSON.stringify({ reason: errorCode })]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function complete(request: RequestRow) {
  const client = await pool.connect();
  try { await client.query("BEGIN");
    const completed = await client.query(`UPDATE resume_generation_requests SET status='completed',credit_state='consumed',finished_at=now()
      WHERE id=$1 AND lease_token=$2 RETURNING id`, [request.id, request.lease_token]);
    if (completed.rows[0]) await client.query(`UPDATE credit_transactions SET status='completed' WHERE user_id=$1 AND reference_id=$2 AND status='pending'`, [request.user_id, request.id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function recordUsage(request: RequestRow, auditPath: string) {
  const audit = JSON.parse(await readFile(auditPath, "utf8")) as { usage?: Usage[] };
  for (const usage of audit.usage || []) {
    const reserved = usage.input_tokens + usage.output_tokens + (usage.cache_read_tokens || 0) + (usage.cache_write_tokens || 0);
    await pool.query(`INSERT INTO resume_ai_calls
      (request_id,user_id,provider,model,stage,status,reserved_tokens,input_tokens,output_tokens,cost_usd,raw_usage,response_id,finished_at)
      VALUES($1,$2,'openrouter',$3,$4,'completed',$5,$6,$7,$8,$9,$10,now())`,
      [request.id, request.user_id, usage.model, usage.stage, reserved, usage.input_tokens, usage.output_tokens,
        usage.provider_cost_usd ?? usage.estimated_cost_usd, JSON.stringify(usage), usage.request_id || null]);
  }
}

async function claim(): Promise<RequestRow | null> {
  const client = await pool.connect(); const lease = crypto.randomUUID();
  try { await client.query("BEGIN");
    const result = await client.query(`WITH next AS (SELECT id FROM resume_generation_requests
      WHERE status='queued' OR (status='running' AND lease_expires_at < now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE resume_generation_requests r SET status='running',lease_token=$1,lease_expires_at=now()+interval '12 minutes'
      FROM next WHERE r.id=next.id RETURNING r.*`, [lease]);
    await client.query("COMMIT"); return result.rows[0] || null;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function tick() {
  const request = await claim(); if (!request) return false;
  const folder = await mkdtemp(join(tmpdir(), "resume-tailor-"));
  try {
    const resume = join(folder, "resume.md"), jd = join(folder, "job.txt"), output = join(folder, "tailored.md");
    await Promise.all([writeFile(resume, request.source_text), writeFile(jd, request.job_description)]);
    const code = await run(process.env.RESUME_PYTHON || "python", ["-m", "low_risk_agent.cli", "--resume", resume, "--jd", jd,
      "--tenant-id", request.user_id, "--job-id", request.job_id, "--base-resume-id", request.base_resume_id,
      "--generation-id", request.id, "--summary", request.include_summary ? "yes" : "no", "--out", output], folder);
    if (code === 2) return void await release(request, "needs_review", "needs_review");
    await readFile(output, "utf8"); // Agent already persisted this exact generation ID; verify output was produced before charging.
    await recordUsage(request, output.replace(/\.md$/, ".audit.json"));
    await complete(request);
  } catch (error) { await release(request, "failed", error instanceof Error ? error.message : "worker_failure"); }
  finally { await rm(folder, { recursive: true, force: true }); }
  return true;
}

async function main() {
  const enabled = process.env.RESUME_GENERATION_ENABLED === "true";
  let stopping = false;
  const server = createServer((request, response) => {
    response.writeHead(request.url === "/health" ? 200 : 404, { "content-type": "application/json" });
    response.end(JSON.stringify(request.url === "/health" ? { status: "ok", enabled } : { error: "Not found" }));
  });
  server.listen(Number(process.env.PORT || 8080), "0.0.0.0");
  const stop = () => { stopping = true; server.close(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  while (!stopping) { if (enabled) await tick(); await new Promise(resolve => setTimeout(resolve, 2_000)); }
  await pool.end();
}
if (process.argv[1]?.endsWith("worker.ts")) main().catch(error => { console.error(error); process.exitCode = 1; });
