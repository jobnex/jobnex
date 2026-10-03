import { getCurrentUser } from "@/lib/auth/server";
import { pool } from "@/lib/db";
import { isUuid } from "@/lib/resume-tailoring";

export async function GET(_: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { requestId } = await params;
  if (!isUuid(requestId)) return Response.json({ error: "Invalid request" }, { status: 400 });
  const result = await pool.query(`SELECT resume_markdown FROM resume_generations WHERE id=$1 AND user_id=$2
    AND status IN ('completed','completed_with_estimates')`, [requestId, user.id]);
  if (!result.rows[0]) return Response.json({ error: "Generated Markdown is not ready" }, { status: 404 });
  return new Response(result.rows[0].resume_markdown, { headers: {
    "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="tailored-resume-${requestId}.md"` } });
}
