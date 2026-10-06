import { getCurrentUser } from "@/lib/auth/server";
import { enqueueTailoring, isUuid, loadTailorJob, loadTailorResume } from "@/lib/resume-tailoring";
import { pool } from "@/lib/db";
import { dispatchRequest } from "@/services/resume-tailor/dispatch";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  if (process.env.RESUME_GENERATION_ENABLED !== "true")
    return Response.json({ error: "Resume tailoring is temporarily unavailable" }, { status: 503 });
  try {
    const body = await request.json();
    if (!isUuid(body.jobId || "") || !isUuid(body.resumeId || "") || !isUuid(body.idempotencyKey || "")) throw new Error("Invalid tailoring request");
    const [job, resume] = await Promise.all([loadTailorJob(body.jobId), loadTailorResume(user.id, body.resumeId)]);
    if (!job || !resume || !resume.markdown.trim()) throw new Error("Job or resume is unavailable");
    const queued = await enqueueTailoring(user.id, job.id, resume, body.idempotencyKey);
    try { await dispatchRequest(pool, queued.id); }
    catch { console.error("resume_dispatch_deferred", { requestId: queued.id }); }
    return Response.json({ request: queued }, { status: queued.duplicate ? 200 : 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not queue tailoring";
    return Response.json({ error: message }, { status: message === "Insufficient credits" ? 402 : 400 });
  }
}
