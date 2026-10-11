import { getCurrentUser } from "@/lib/auth/server";
import { pool } from "@/lib/db";
import { isUuid } from "@/lib/resume-tailoring";

export async function PATCH(request: Request, { params }: { params: Promise<{ resumeId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { resumeId } = await params;
  const body = await request.json().catch(() => ({}));
  if (!isUuid(resumeId) || typeof body.markdown !== "string" || !body.markdown.trim() || body.markdown.length > 200_000)
    return Response.json({ error: "Invalid resume draft" }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [user.id]);
    const owned = await client.query(`SELECT r.id FROM user_pref_resumes r JOIN user_job_preferences p
      ON p.user_id=r.user_id AND p.active_resume_id=r.id
      WHERE r.id=$1 AND r.user_id=$2 AND r.is_primary=true AND r.file_key IS NOT NULL FOR UPDATE OF r,p`, [resumeId,user.id]);
    if (!owned.rows[0]) { await client.query("ROLLBACK"); return Response.json({ error: "Active resume not found. Reopen your current base resume." }, { status: 404 }); }
    const pending = await client.query("SELECT id FROM resume_generation_requests WHERE user_id=$1 AND status IN ('queued','running') LIMIT 1", [user.id]);
    if (pending.rows.length) { await client.query("ROLLBACK"); return Response.json({ error: "Wait for resume generation to finish before changing the base resume." }, { status: 409 }); }
    const details = await client.query(`UPDATE user_job_preferences SET
      resume_details=jsonb_set(resume_details,'{compiler_payload}',coalesce(resume_details->'compiler_payload','{}'::jsonb) || jsonb_build_object('markdown',$1::text)),
      active_resume_id=$2,updated_at=now(),resume_details_updated_at=now() WHERE user_id=$3 AND active_resume_id=$2 RETURNING resume_details`,
      [body.markdown.trim(),resumeId,user.id]);
    if (!details.rows[0]) throw new Error("Resume profile not found");
    const updated = await client.query("UPDATE user_pref_resumes SET content=$1,parsed_data=$2,updated_at=now() WHERE id=$3 AND user_id=$4 RETURNING id,content",
      [body.markdown.trim(),JSON.stringify(details.rows[0].resume_details),resumeId,user.id]);
    await client.query("COMMIT");
    return Response.json({ resume: updated.rows[0] });
  } catch { await client.query("ROLLBACK"); return Response.json({ error: "Could not save resume draft" }, { status: 500 }); }
  finally { client.release(); }
}
