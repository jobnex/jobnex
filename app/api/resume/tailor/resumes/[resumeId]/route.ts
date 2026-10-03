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
  const updated = await pool.query(`UPDATE user_pref_resumes SET content=$1,updated_at=now() WHERE id=$2 AND user_id=$3 RETURNING id,content`,
    [body.markdown.trim(), resumeId, user.id]);
  return updated.rows[0] ? Response.json({ resume: updated.rows[0] }) : Response.json({ error: "Resume not found" }, { status: 404 });
}
