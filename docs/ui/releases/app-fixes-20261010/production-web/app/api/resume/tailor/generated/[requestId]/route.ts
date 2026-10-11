import { getCurrentUser } from "@/lib/auth/server";
import { isUuid, loadAvailableGeneration } from "@/lib/resume-tailoring";

export async function GET(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { requestId } = await params;
  if (!isUuid(requestId)) return Response.json({ error: "Invalid request" }, { status: 400 });
  const generation = await loadAvailableGeneration(user.id, requestId);
  if (!generation) return Response.json({ error: "Generated Markdown is not ready" }, { status: 404 });
  if (new URL(request.url).searchParams.get("format") === "json")
    return Response.json({ generation }, { headers: { "Cache-Control": "no-store" } });
  return new Response(generation.resume_markdown, { headers: {
    "Cache-Control": "no-store",
    "X-Resume-Review-Required": String(generation.status === "needs_review"),
    "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="tailored-resume-${requestId}.md"` } });
}
