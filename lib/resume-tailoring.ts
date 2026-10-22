import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import { resumeText } from "@/lib/resume-content";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TailorJob = { id: string; title: string; company: string; description: string; requirements: unknown };
export type TailorResume = { id: string; markdown: string; parsed: Record<string, unknown>; fileName: string | null };

export function isUuid(value: string) { return UUID.test(value); }

export async function loadAvailableGeneration(userId: string, requestId: string) {
  if (!isUuid(requestId)) return null;
  const result = await pool.query(`SELECT g.id,g.job_id,g.resume_markdown,g.version,g.status,
      g.audit_json->>'error' AS review_reason
    FROM resume_generations g JOIN resume_generation_requests r ON r.id=g.id AND r.user_id=g.user_id
    WHERE g.id=$1 AND g.user_id=$2 AND g.job_id=r.job_id AND g.base_resume_id=r.base_resume_id
      AND ((r.status='completed' AND r.credit_state='consumed' AND g.status IN ('completed','completed_with_estimates'))
        OR (r.status='needs_review' AND r.credit_state IN ('consumed','released') AND g.status='needs_review'))
      AND length(trim(g.resume_markdown))>0
      AND public.resume_generation_is_publishable(g.id,g.user_id)`, [requestId, userId]);
  return result.rows[0] as { id: string; job_id: string; resume_markdown: string; version: number; status: string; review_reason: string | null } | undefined;
}

export async function loadTailorJob(jobId: string): Promise<TailorJob | null> {
  const result = await pool.query(`SELECT id, job_role_title, company_name, job_description, requirements
    FROM jobs WHERE id=$1 AND status='published'`, [jobId]);
  const row = result.rows[0];
  return row && { id: row.id, title: row.job_role_title, company: row.company_name,
    description: row.job_description, requirements: row.requirements };
}

export async function loadTailorResume(userId: string, resumeId: string): Promise<TailorResume | null> {
  const result = await pool.query(`SELECT r.id, r.content, r.parsed_data, r.file_name FROM user_pref_resumes r
    JOIN user_job_preferences p ON p.user_id=r.user_id AND p.active_resume_id=r.id
    WHERE r.id=$1 AND r.user_id=$2`, [resumeId, userId]);
  const row = result.rows[0];
  return row && { id: row.id, markdown: resumeText(row.content, row.parsed_data), parsed: row.parsed_data || {}, fileName: row.file_name };
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
    // Serialize replacement/delete with admission, then reject a stale preloaded base before holding credit.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [userId]);
    const currentBase = await client.query(`SELECT r.id,r.content,r.parsed_data FROM user_pref_resumes r
      JOIN user_job_preferences p ON p.user_id=r.user_id AND p.active_resume_id=r.id
      WHERE r.user_id=$1 AND r.id=$2 FOR SHARE OF r,p`,[userId,resume.id]);
    if (!currentBase.rows[0] || resumeText(currentBase.rows[0].content,currentBase.rows[0].parsed_data) !== resume.markdown)
      throw new Error("Your base resume changed. Refresh the preview and try again.");
    const admitted = await client.query(`SELECT i.id FROM resume_imports i
      WHERE i.user_id=$1 AND public.resume_source_is_admitted($1,$2,i.id)
        AND i.object_key=(SELECT file_key FROM user_pref_resumes WHERE user_id=$1 AND id=$3)`,[userId,resume.markdown,resume.id]);
    if (!admitted.rows.length) throw new Error("Validate and confirm a supported PDF in Manage Job Hunt before generating.");
    const job = await client.query(`SELECT job_description FROM jobs WHERE id=$1 AND status='published' FOR SHARE`, [jobId]);
    if (!job.rows[0]) throw new Error("Job is unavailable");
    await client.query(`INSERT INTO wallets(user_id,balance) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING`, [userId]);
    const wallet = await client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, [userId]);
    // Recheck after the per-user wallet lock: a concurrent tab may have committed
    // this key while we waited. Distinct jobs may queue with separate credit holds.
    const retried = await client.query(`SELECT id,status,credit_state FROM resume_generation_requests
      WHERE user_id=$1 AND idempotency_key=$2`, [userId, idempotencyKey]);
    if (retried.rows[0]) { await client.query("COMMIT"); return { ...retried.rows[0], duplicate: true }; }
    const active = await client.query(`SELECT id,status,credit_state FROM resume_generation_requests
      WHERE user_id=$1 AND job_id=$2 AND status IN ('queued','running') FOR UPDATE`, [userId, jobId]);
    if (active.rows[0]) { await client.query("COMMIT"); return { ...active.rows[0], duplicate: true }; }
    if ((wallet.rows[0]?.balance ?? 0) < 1) throw new Error("Insufficient credits");
    const id = randomUUID();
    await client.query(`UPDATE wallets SET balance=balance-1,updated_at=now() WHERE user_id=$1`, [userId]);
    await client.query(`INSERT INTO credit_transactions(user_id,amount,transaction_type,status,reference_id,metadata)
      VALUES($1,-1,'resume_tailor','pending',$2,$3)`, [userId, id, JSON.stringify({ kind: "tailor_resume_hold" })]);
    await client.query(`INSERT INTO resume_generation_requests
      (id,user_id,job_id,base_resume_id,idempotency_key,source_text,job_description,include_summary,status,credit_state,credit_cost,source_import_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,true,'queued','held',1,$8)`,
      [id, userId, jobId, resume.id, idempotencyKey, resume.markdown, job.rows[0].job_description,admitted.rows[0].id]);
    await client.query(`INSERT INTO resume_dispatch_outbox(request_id) VALUES($1)`, [id]);
    await client.query("COMMIT");
    return { id, status: "queued", credit_state: "held", duplicate: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
