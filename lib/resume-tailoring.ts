import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TailorJob = { id: string; title: string; company: string; description: string; requirements: unknown };
export type TailorResume = { id: string; markdown: string; parsed: Record<string, unknown>; fileName: string | null };

export function isUuid(value: string) { return UUID.test(value); }

export async function loadTailorJob(jobId: string): Promise<TailorJob | null> {
  const result = await pool.query(`SELECT id, job_role_title, company_name, job_description, requirements
    FROM jobs WHERE id=$1 AND status='published'`, [jobId]);
  const row = result.rows[0];
  return row && { id: row.id, title: row.job_role_title, company: row.company_name,
    description: row.job_description, requirements: row.requirements };
}

export async function loadTailorResume(userId: string, resumeId: string): Promise<TailorResume | null> {
  const result = await pool.query(`SELECT id, content, parsed_data, file_name FROM user_pref_resumes
    WHERE id=$1 AND user_id=$2`, [resumeId, userId]);
  const row = result.rows[0];
  return row && { id: row.id, markdown: row.content || "", parsed: row.parsed_data || {}, fileName: row.file_name };
}

const STOP_WORDS = new Set("about after also and are as at be by can company for from have in into is its job more must not of on or our role that the their this to use using we with you your years".split(" "));
function keywords(text: string) {
  return [...new Set((text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || [])
    .filter(word => !STOP_WORDS.has(word)))];
}

export function resumePreview(markdown: string, job: TailorJob) {
  const source = new Set(keywords(markdown));
  const requirements = Array.isArray(job.requirements) ? job.requirements.filter((x): x is string => typeof x === "string").join(" ") : "";
  const wanted = keywords(`${job.title} ${requirements} ${job.description}`).slice(0, 40);
  const matched = wanted.filter(word => source.has(word)).slice(0, 15);
  const missing = wanted.filter(word => !source.has(word)).slice(0, 15);
  return { matched, missing, sourceWordCount: keywords(markdown).length };
}

export async function enqueueTailoring(userId: string, jobId: string, resume: TailorResume, idempotencyKey: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`SELECT id,status,credit_state FROM resume_generation_requests
      WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE`, [userId, idempotencyKey]);
    if (existing.rows[0]) { await client.query("COMMIT"); return { ...existing.rows[0], duplicate: true }; }
    const job = await client.query(`SELECT job_description FROM jobs WHERE id=$1 AND status='published' FOR SHARE`, [jobId]);
    if (!job.rows[0]) throw new Error("Job is unavailable");
    await client.query(`INSERT INTO wallets(user_id,balance) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING`, [userId]);
    const wallet = await client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, [userId]);
    // The database permits one queued/running request per candidate. Check it while
    // holding the wallet lock so two browser tabs cannot reserve two credits.
    const active = await client.query(`SELECT id,status,credit_state FROM resume_generation_requests
      WHERE user_id=$1 AND status IN ('queued','running') FOR UPDATE`, [userId]);
    if (active.rows[0]) { await client.query("COMMIT"); return { ...active.rows[0], duplicate: true }; }
    if ((wallet.rows[0]?.balance ?? 0) < 1) throw new Error("Insufficient credits");
    const id = randomUUID();
    await client.query(`UPDATE wallets SET balance=balance-1,updated_at=now() WHERE user_id=$1`, [userId]);
    await client.query(`INSERT INTO credit_transactions(user_id,amount,transaction_type,status,reference_id,metadata)
      VALUES($1,-1,'resume_tailor','pending',$2,$3)`, [userId, id, JSON.stringify({ kind: "tailor_resume_hold" })]);
    await client.query(`INSERT INTO resume_generation_requests
      (id,user_id,job_id,base_resume_id,idempotency_key,source_text,job_description,include_summary,status,credit_state,credit_cost)
      VALUES($1,$2,$3,$4,$5,$6,$7,true,'queued','held',1)`,
      [id, userId, jobId, resume.id, idempotencyKey, resume.markdown, job.rows[0].job_description]);
    await client.query("COMMIT");
    return { id, status: "queued", credit_state: "held", duplicate: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
