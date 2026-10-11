import { getCurrentUser } from "@/lib/auth/server";
import { pool } from "@/lib/db";
import { z } from "zod";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const result = await pool.query(`SELECT j.id,j.job_role_title AS "jobRoleTitle",j.company_name AS company,
    j.employment_type AS type,j.location,j.job_description AS "jobDescription",'' AS salary,'[]'::json AS categories,a.status,a.applied_at AS "appliedAt"
    FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.user_id=$1 ORDER BY a.applied_at DESC`, [user.id]);
  return Response.json({ jobs: result.rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const input = z.object({ jobId: z.string().uuid() }).strict().safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Select a published job" }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${user.id}:${input.data.jobId}`]);
    const job = await client.query("SELECT 1 FROM jobs WHERE id=$1 AND status='published'", [input.data.jobId]);
    if (!job.rowCount) { await client.query('ROLLBACK'); return Response.json({ error: "Job not available" }, { status: 404 }); }
    await client.query(`INSERT INTO applications(user_id,job_id) SELECT $1,$2
      WHERE NOT EXISTS(SELECT 1 FROM applications WHERE user_id=$1 AND job_id=$2)`, [user.id, input.data.jobId]);
    await client.query('COMMIT');
    return Response.json({ success: true });
  } catch { await client.query('ROLLBACK'); return Response.json({ error: "Could not add application" }, { status: 503 }); }
  finally { client.release(); }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const input = z.object({ jobId: z.string().uuid(), status: z.enum(['applied','interview','offer','withdrawn']) }).strict().safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid application status" }, { status: 400 });
  const result = await pool.query('UPDATE applications SET status=$3,updated_at=now() WHERE user_id=$1 AND job_id=$2 RETURNING id', [user.id,input.data.jobId,input.data.status]);
  return Response.json({ success: !!result.rowCount }, { status: result.rowCount ? 200 : 404 });
}
