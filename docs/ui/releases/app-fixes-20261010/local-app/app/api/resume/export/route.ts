import { getCurrentUser } from "@/lib/auth/server";
import { cookies } from "next/headers";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to export" }, { status: 401 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 256_000) return Response.json({ error: "Resume too large" }, { status: 413 });
  try {
    const cookie = (await cookies()).toString();
    const base = process.env.JOB_HUNT_WEB_URL || "https://job-hunt-web-znsph25yja-ue.a.run.app";
    const response = await fetch(base + "/api/resume/export", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body, cache: "no-store", signal: AbortSignal.timeout(100_000),
    });
    return new Response(await response.arrayBuffer(), { status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "PDF export unavailable. Retry shortly." }, { status: 503 }); }
}
