"use server";

import { getCurrentUser } from "@/lib/auth/server";
import { pool } from "@/lib/db";
import { formatSalary, mapDBJobTypeToUI } from "@/lib/job-utils";
import type { Job } from "@/types";

export type ResumeApplication = Job & { requestId: string; generationStatus: string; requestedAt: string; stage: string | null };

/** Requests are the durable application intake; generating a resume is not a submission. */
export async function listResumeApplications(): Promise<{ userId: string | null; applications: ResumeApplication[] }> {
  const user = await getCurrentUser();
  if (!user) return { userId: null, applications: [] };
  const result = await pool.query(`SELECT j.*, r.id AS request_id,r.status AS generation_status,
      r.created_at AS requested_at,a.status AS application_stage
    FROM (SELECT DISTINCT ON (job_id) id,job_id,status,created_at
      FROM resume_generation_requests WHERE user_id=$1
      ORDER BY job_id,created_at DESC,id DESC) r
    JOIN jobs j ON j.id=r.job_id
    LEFT JOIN applications a ON a.job_id=j.id AND a.user_id=$1
    ORDER BY r.created_at DESC,j.id`, [user.id]);
  return { userId: user.id, applications: result.rows.map(row => ({
    id: row.id, jobRoleTitle: row.job_role_title, company: row.company_name,
    type: mapDBJobTypeToUI(row.employment_type), location: row.location,
    salary: formatSalary(row.salary_min,row.salary_max,row.currency),
    jobDescription: row.job_description, categories: [], externalApplyUrl: row.external_apply_url ?? undefined,
    requestId: row.request_id, generationStatus: row.generation_status,
    requestedAt: new Date(row.requested_at).toISOString(), stage: row.application_stage,
  })) };
}

export async function updateResumeApplicationStage(jobId: string, stage: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId) || !["applied","interview","offer"].includes(stage)) {
    throw new Error("Invalid application stage");
  }
    // Insert only for a job this user has actually requested; never trust client ownership.
    await pool.query(`INSERT INTO applications(user_id,job_id,status)
      SELECT $1,$2,$3 WHERE EXISTS (SELECT 1 FROM resume_generation_requests WHERE user_id=$1 AND job_id=$2)
      ON CONFLICT(user_id,job_id) DO UPDATE SET status=EXCLUDED.status,updated_at=now()`, [user.id,jobId,stage]);
}
