import { getCurrentUser } from "@/lib/auth/server";
import { loadAvailableGeneration } from "@/lib/resume-tailoring";
import { exportJobResume, latestJobResume, ownsApplication } from "@/lib/job-resumes";
import { pool } from "@/lib/db";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { z } from "zod";

export const runtime = "nodejs";
const input = z.object({ markdown: z.string().trim().min(1).max(200_000),
  templateId: z.enum(["mit-capd", "standard-overleaf", "modern-ivy", "contemporary-compact", "minimalist-exec", "tech-specialist"]) }).strict();
const noStore = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ requestId: string }> };

export async function POST(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401, headers: noStore });
  const { requestId } = await params;
  const generation = await loadAvailableGeneration(user.id, requestId);
  if (!generation || !await ownsApplication(user.id, generation.job_id))
    return Response.json({ error: "Resume draft not ready" }, { status: 404, headers: noStore });
  const text = await request.text();
  if (Buffer.byteLength(text) > 256_000) return Response.json({ error: "Resume too large" }, { status: 413, headers: noStore });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: noStore }); }
  const parsed = input.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "A valid Markdown resume and template are required" }, { status: 400, headers: noStore });
  try {
    // Bind the mutation to this generation; the same atomic guard protects the studio export.
    const exported = await exportJobResume(user.id, generation.job_id, parsed.data.markdown, parsed.data.templateId, requestId);
    return Response.json(exported, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("A newer resume"))
      return Response.json({ error: error.message }, { status: 409, headers: noStore });
    return Response.json({ error: "PDF export failed; the previous saved resume is retained." }, { status: 503, headers: noStore });
  }
}

export async function GET(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401, headers: noStore });
  const { requestId } = await params;
  const generation = await loadAvailableGeneration(user.id, requestId);
  if (!generation) return Response.json({ error: "Resume draft not ready" }, { status: 404, headers: noStore });
  // A job-scoped artifact must never be labelled as a different historical generation.
  const latest = await pool.query(`SELECT g.id FROM resume_generations g JOIN resume_generation_requests r
    ON r.id=g.id AND r.user_id=g.user_id AND r.job_id=g.job_id AND r.base_resume_id=g.base_resume_id
    WHERE g.user_id=$1 AND g.job_id=$2 AND length(trim(g.resume_markdown))>0 AND
    ((r.status='completed' AND r.credit_state='consumed' AND g.status IN ('completed','completed_with_estimates'))
    OR (r.status='needs_review' AND g.status='needs_review' AND r.credit_state IN ('consumed','released')))
    ORDER BY r.created_at DESC LIMIT 1`, [user.id, generation.job_id]);
  if (latest.rows[0]?.id !== requestId)
    return Response.json({ error: "Historical drafts are view-only. Open the latest draft to export PDF." }, { status: 409, headers: noStore });
  if (new URL(request.url).searchParams.has("previewId"))
    return Response.json({ error: "This preview link expired. Export the latest draft again." }, { status: 410, headers: noStore });
  try {
    const saved = await latestJobResume(user.id, generation.job_id);
    if (saved?.status !== "ready" || !saved.r2_object_key || saved.markdown.trim() !== generation.resume_markdown.trim())
      return Response.json({ error: "Export this draft to save its PDF first." }, { status: 404, headers: noStore });
    const downloadUrl = await getSignedUrl(r2Client, new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: saved.r2_object_key,
      ResponseContentType: "application/pdf", ResponseContentDisposition: `attachment; filename="tailored-resume-${requestId}.pdf"` }), { expiresIn: 900 });
    return new Response(null, { status: 307, headers: { ...noStore, Location: downloadUrl } });
  } catch { return Response.json({ error: "PDF download is temporarily unavailable" }, { status: 503, headers: noStore }); }
}
