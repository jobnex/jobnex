import { getCurrentUser } from "@/lib/auth/server";
import { exportJobResume, ownsApplication } from "@/lib/job-resumes";
import { z } from "zod";
import { RESUME_TEMPLATES } from "@/data/resume-templates";
export const runtime = "nodejs";
const schema = z.object({ jobId: z.string().uuid(), markdown: z.string().trim().min(1).max(200_000), templateId: z.string(), expectedGenerationId: z.string().uuid().optional() }).strict();
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to export" }, { status: 401 });
  const text = await request.text();
  if (Buffer.byteLength(text) > 256_000) return Response.json({ error: "Resume too large" }, { status: 413 });
  let input;
  try { input = schema.parse(JSON.parse(text)); }
  catch { return Response.json({ error: "A valid job, resume and template are required" }, { status: 400 }); }
  try {
    if (!RESUME_TEMPLATES.some(template => template.id === input.templateId)) return Response.json({ error: "Unsupported template" }, { status: 400 });
    if (!await ownsApplication(user.id, input.jobId)) return Response.json({ error: "Application not found" }, { status: 404 });
    return Response.json(await exportJobResume(user.id, input.jobId, input.markdown, input.templateId, input.expectedGenerationId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("A newer resume")) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: "PDF export failed. Previous saved PDF is retained; retry shortly." }, { status: 503 }); }
}
