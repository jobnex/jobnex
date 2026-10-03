import { getCurrentUser } from "@/lib/auth/server";
import { isUuid, loadTailorJob, loadTailorResume, resumePreview } from "@/lib/resume-tailoring";

export async function GET(request: Request, { params }: { params: Promise<{ resumeId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { resumeId } = await params; const jobId = new URL(request.url).searchParams.get("jobId") || "";
  if (!isUuid(resumeId) || !isUuid(jobId)) return Response.json({ error: "Invalid request" }, { status: 400 });
  const [resume, job] = await Promise.all([loadTailorResume(user.id, resumeId), loadTailorJob(jobId)]);
  if (!resume || !job) return Response.json({ error: "Resume or job not found" }, { status: 404 });
  return Response.json({ preview: resumePreview(resume.markdown, job), resume: { id: resume.id, markdown: resume.markdown }, job: { id: job.id, title: job.title, company: job.company } });
}
