import { getCurrentUser } from "@/lib/auth/server";
import { isUuid, loadAvailableGeneration } from "@/lib/resume-tailoring";
import { callResumePdfBackend, exportResumePdf } from "@/lib/resume-pdf-backend";
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
  if (!generation) return Response.json({ error: "Resume draft not ready" }, { status: 404, headers: noStore });
  const text = await request.text();
  if (Buffer.byteLength(text) > 256_000) return Response.json({ error: "Resume too large" }, { status: 413, headers: noStore });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: noStore }); }
  const parsed = input.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "A valid Markdown resume and template are required" }, { status: 400, headers: noStore });
  try {
    const { response, artifact } = await exportResumePdf(user.id, generation.job_id, parsed.data.markdown, parsed.data.templateId);
    if (!response.ok) return Response.json({ error: response.status === 409 ? "Resume changed during export; retry after reviewing your changes." : "PDF export failed; the previous saved resume is retained." },
      { status: [400, 404, 409, 422, 429].includes(response.status) ? response.status : 503,
        headers: { ...noStore, ...(response.status === 429 ? { "Retry-After": response.headers.get("Retry-After") || "5" } : {}) } });
    const saved = await response.json();
    return Response.json({ previewId: artifact!.preview_id, pdfSha256: artifact!.pdf_sha256, markdownSha256: artifact!.markdown_sha256,
      revision: saved.revision, downloadUrl: `/api/resume/tailor/generated/${requestId}/pdf?previewId=${artifact!.preview_id}` }, { headers: noStore });
  } catch { return Response.json({ error: "PDF export is temporarily unavailable; retry shortly." }, { status: 503, headers: noStore }); }
}

export async function GET(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401, headers: noStore });
  const { requestId } = await params;
  const generation = await loadAvailableGeneration(user.id, requestId);
  if (!generation) return Response.json({ error: "Resume draft not ready" }, { status: 404, headers: noStore });
  const previewId = new URL(request.url).searchParams.get("previewId");
  if (previewId && !isUuid(previewId)) return Response.json({ error: "Invalid preview" }, { status: 400, headers: noStore });
  try {
    const response = await callResumePdfBackend(user.id, generation.job_id, previewId ? `pdf/${previewId}` : "pdf");
    if (!response.ok) return Response.json({ error: "Saved PDF is unavailable" }, { status: response.status === 404 ? 404 : 503, headers: noStore });
    return new Response(response.body, { headers: { ...noStore, "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tailored-resume-${requestId}.pdf"` } });
  } catch { return Response.json({ error: "PDF download is temporarily unavailable" }, { status: 503, headers: noStore }); }
}
