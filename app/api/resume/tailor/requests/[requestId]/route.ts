import { getCurrentUser } from "@/lib/auth/server";
import { pool } from "@/lib/db";
import { isUuid } from "@/lib/resume-tailoring";

export async function GET(_: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { requestId } = await params;
  if (!isUuid(requestId)) return Response.json({ error: "Invalid request" }, { status: 400 });
  const result = await pool.query(`SELECT r.id,r.status,r.credit_state,r.error_code,r.created_at,r.finished_at,
      g.resume_markdown IS NOT NULL AS ready
    FROM resume_generation_requests r LEFT JOIN resume_generations g ON g.id=r.id
    WHERE r.id=$1 AND r.user_id=$2`, [requestId, user.id]);
  return result.rows[0] ? Response.json({ request: result.rows[0] }) : Response.json({ error: "Request not found" }, { status: 404 });
}
