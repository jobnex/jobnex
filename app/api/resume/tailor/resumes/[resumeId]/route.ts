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
    const owned = await client.query("SELECT id FROM user_pref_resumes WHERE id=$1 AND user_id=$2 FOR UPDATE", [resumeId,user.id]);
    if (!owned.rows[0]) { await client.query("ROLLBACK"); return Response.json({ error: "Resume not found" }, { status: 404 }); }
    const details = await client.query(`UPDATE user_job_preferences SET
      resume_details=jsonb_set(resume_details,'{compiler_payload}',coalesce(resume_details->'compiler_payload','{}'::jsonb) || jsonb_build_object('markdown',$1::text)),
      active_resume_id=$2,updated_at=now(),resume_details_updated_at=now() WHERE user_id=$3 RETURNING resume_details`,
      [body.markdown.trim(),resumeId,user.id]);
    if (!details.rows[0]) throw new Error("Resume profile not found");
    const updated = await client.query("UPDATE user_pref_resumes SET content=$1,parsed_data=$2,updated_at=now() WHERE id=$3 AND user_id=$4 RETURNING id,content",
      [body.markdown.trim(),JSON.stringify(details.rows[0].resume_details),resumeId,user.id]);
    await client.query("COMMIT");
    return Response.json({ resume: updated.rows[0] });
  } catch { await client.query("ROLLBACK"); return Response.json({ error: "Could not save resume draft" }, { status: 500 }); }
  finally { client.release(); }
}
