import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 256_000) return Response.json({ error: "Resume too large" }, { status: 413 });
  try {
    const origin = process.env.JOB_HUNT_WEB_URL || "https://job-hunt-web-znsph25yja-ue.a.run.app";
    const response = await fetch(`${origin.replace(/\/$/, "")}/api/resume/base`, { method: "POST", body,
      headers: { Cookie: (await cookies()).toString(), "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(100_000) });
    return new Response(response.body, { status: response.status, headers: { "Content-Type": response.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "PDF export is temporarily unavailable. Your existing resume is retained." }, { status: 503 }); }
}
