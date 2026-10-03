import { getCurrentUser } from "@/lib/auth/server";
import { isUuid, loadTailorJob } from "@/lib/resume-tailoring";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  if (!await getCurrentUser()) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { jobId } = await params;
  if (!isUuid(jobId)) return Response.json({ error: "Invalid job" }, { status: 400 });
  const job = await loadTailorJob(jobId);
  return job ? Response.json({ job }) : Response.json({ error: "Job is unavailable" }, { status: 404 });
}
