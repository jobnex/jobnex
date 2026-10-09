import { pool } from "@/lib/db";

export async function activeResumeId(userId: string): Promise<string | undefined> {
  const result = await pool.query(`SELECT r.id FROM user_job_preferences p
    JOIN user_pref_resumes r ON r.id=p.active_resume_id AND r.user_id=p.user_id
    WHERE p.user_id=$1`, [userId]);
  return result.rows[0]?.id;
}
