import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { pool } from "@/lib/db";
import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { parseResumeMarkdown } from "@/lib/resume-parser";
import { RESUME_TEMPLATES } from "@/data/resume-templates";

export async function ownsApplication(userId: string, jobId: string) {
  return (await pool.query('SELECT 1 FROM applications WHERE user_id=$1 AND job_id=$2 LIMIT 1', [userId, jobId])).rowCount !== 0;
}

export async function latestJobResume(userId: string, jobId: string) {
  return (await pool.query('SELECT markdown,template_id,r2_object_key,status FROM user_job_resumes WHERE user_id=$1 AND job_id=$2 AND public.resume_saved_markdown_is_publishable(user_id::text,job_id,markdown)', [userId, jobId])).rows[0] ?? null;
}

export async function exportJobResume(userId: string, jobId: string, markdown: string, templateId: string, expectedGenerationId?: string) {
  const template = RESUME_TEMPLATES.find(item => item.id === templateId);
  if (!template) throw new Error("Unsupported template");
  const key = `resumes/${userId}/${jobId}/${randomUUID()}.pdf`;
  const uploadUrl = await getSignedUrl(r2Client, new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, ContentType: "application/pdf" }), { expiresIn: 120 });
  let committed = false;
  let previous: string | null = null;
  try {
    const response = await fetch(`${process.env.RESUME_COMPILER_URL || "http://127.0.0.1:8080"}/api/v1/ui-export`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(process.env.RESUME_COMPILER_SECRET ? { Authorization: `Bearer ${process.env.RESUME_COMPILER_SECRET}` } : {}) },
      body: JSON.stringify({ resume: { ...parseResumeMarkdown(markdown), rawMarkdown: undefined }, theme: template.themeId, templateId, uploadUrl }),
      signal: AbortSignal.timeout(90_000), cache: "no-store",
    });
    if (!response.ok || (await response.json()).uploaded !== true) throw new Error("PDF service unavailable or busy");
    const head = await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    if (!head.ContentLength || head.ContentType !== "application/pdf") throw new Error("Invalid uploaded PDF");
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${userId}:${jobId}`]);
      const allowed = await client.query('SELECT public.resume_saved_markdown_is_publishable($1,$2,$3) AS allowed', [userId,jobId,markdown]);
      if (!allowed.rows[0]?.allowed) throw new Error("Resume failed source verification; regenerate before export.");
      const current = await client.query(`SELECT g.id FROM resume_generations g JOIN resume_generation_requests r
        ON r.id=g.id AND r.user_id=g.user_id AND r.job_id=g.job_id AND r.base_resume_id=g.base_resume_id
        WHERE r.user_id=$1 AND r.job_id=$2 AND length(trim(g.resume_markdown))>0 AND
        ((r.status='completed' AND r.credit_state='consumed' AND g.status IN ('completed','completed_with_estimates'))
        OR (r.status='needs_review' AND g.status='needs_review' AND r.credit_state IN ('consumed','released')))
        ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE OF g`,[userId,jobId]);
      const legacy = await client.query('SELECT id FROM user_job_resumes WHERE user_id=$1 AND job_id=$2',[userId,jobId]);
      if (expectedGenerationId && (current.rows[0]?.id || legacy.rows[0]?.id) !== expectedGenerationId)
        throw new Error("A newer resume is available. Reopen the latest draft before exporting.");
      previous = (await client.query('SELECT r2_object_key FROM user_job_resumes WHERE user_id=$1 AND job_id=$2', [userId, jobId])).rows[0]?.r2_object_key ?? null;
      await client.query(`INSERT INTO user_job_resumes(user_id,job_id,markdown,r2_object_key,template_id,theme,status,file_size,exported_at)
        VALUES($1,$2,$3,$4,$5,$6,'ready',$7,now()) ON CONFLICT(user_id,job_id) DO UPDATE SET
        markdown=EXCLUDED.markdown,r2_object_key=EXCLUDED.r2_object_key,template_id=EXCLUDED.template_id,
        theme=EXCLUDED.theme,status='ready',file_size=EXCLUDED.file_size,exported_at=now(),updated_at=now()`,
        [userId, jobId, markdown, key, templateId, template.themeId, head.ContentLength]);
      // Keep the original model draft/audit intact; persist the user's exported working copy separately.
      await client.query(`UPDATE resume_generations g SET audit_json=COALESCE(g.audit_json,'{}'::jsonb) ||
        jsonb_build_object('manual_edit',jsonb_build_object('markdown',$3::text,'templateId',$4::text,'savedAt',now()::text))
        WHERE g.id=$5 AND g.user_id=$1 AND g.job_id=$2`,[userId,jobId,markdown,templateId,current.rows[0]?.id || null]);
      await client.query('COMMIT'); committed = true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    let cleanupPending = false;
    if (previous) {
      try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: previous })); }
      catch { cleanupPending = true; }
    }
    const downloadUrl = await getSignedUrl(r2Client, new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key,
      ResponseContentDisposition: `attachment; filename="${templateId}_resume.pdf"`, ResponseContentType: "application/pdf" }), { expiresIn: 900 });
    return { downloadUrl, cleanupPending };
  } catch (error) {
    if (!committed) {
      try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })); }
      catch { console.error("Uncommitted PDF cleanup failed"); }
    }
    throw error;
  }
}
