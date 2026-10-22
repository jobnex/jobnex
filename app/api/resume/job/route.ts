import { getCurrentUser } from "@/lib/auth/server";
import { latestJobResume, ownsApplication } from "@/lib/job-resumes";
import { pool } from "@/lib/db";
import { RESUME_TEMPLATES } from "@/data/resume-templates";
import { z } from "zod";
import { getPresignedDownloadUrl } from "@/app/actions/storage";

export async function GET(request: Request) {
  if(process.env.RESUME_CERTIFIED_PUBLICATION_STRICT === "true") return Response.json({publicationStatus:"blocked",code:"USE_CERTIFIED_PUBLICATION",issues:[{code:"USE_CERTIFIED_PUBLICATION",message:"Open the certified resume preview before downloading or saving.",fieldId:null}]},{status:409});
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const input = z.string().uuid().safeParse(new URL(request.url).searchParams.get("jobId"));
  if (!input.success) return Response.json({ error: "Invalid job" }, { status: 400 });
  if (!await ownsApplication(user.id, input.data)) return Response.json({ error: "Application not found" }, { status: 404 });
  const saved = await latestJobResume(user.id, input.data);
  if (saved) {
    const signed = saved.status === 'ready' && saved.r2_object_key ? await getPresignedDownloadUrl(saved.r2_object_key) : null;
    return Response.json({ ...saved, downloadUrl: signed?.downloadUrl });
  }
  const profile = await pool.query("SELECT resume_details->'compiler_payload'->>'markdown' AS markdown, preferences->>'selectedTemplateId' AS template_id FROM user_job_preferences WHERE user_id=$1", [user.id]);
  return Response.json({ markdown: profile.rows[0]?.markdown ?? "", template_id: profile.rows[0]?.template_id ?? "mit-capd" });
}
export async function POST(request: Request) {
  if(process.env.RESUME_CERTIFIED_PUBLICATION_STRICT === "true") return Response.json({publicationStatus:"blocked",code:"USE_CERTIFIED_PUBLICATION",issues:[{code:"USE_CERTIFIED_PUBLICATION",message:"Open the certified resume preview before downloading or saving.",fieldId:null}]},{status:409});
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const input = z.object({ jobId: z.string().uuid(), markdown: z.string().min(1).max(200_000), templateId: z.string() }).strict().safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid resume" }, { status: 400 });
  const { jobId, markdown, templateId } = input.data;
  const template = RESUME_TEMPLATES.find(item => item.id === templateId);
  if (!template || !await ownsApplication(user.id, jobId)) return Response.json({ error: "Application or template not found" }, { status: 404 });
  await pool.query(`INSERT INTO user_job_resumes(user_id,job_id,markdown,template_id,theme) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(user_id,job_id) DO UPDATE SET markdown=EXCLUDED.markdown,template_id=EXCLUDED.template_id,theme=EXCLUDED.theme,status='draft',updated_at=now()`, [user.id, jobId, markdown, templateId, template.themeId]);
  return Response.json({ success: true });
}
