export const runtime = "nodejs";
export async function GET() {
  return Response.json({ status: "ok", generationEnabled: process.env.RESUME_GENERATION_ENABLED === "true" },
    { headers: { "Cache-Control": "no-store" } });
}
