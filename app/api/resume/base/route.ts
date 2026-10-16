import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getCurrentUser } from "@/lib/auth/server";
import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { parseResumeMarkdown } from "@/lib/resume-parser";
import { RESUME_TEMPLATES } from "@/data/resume-templates";
import { z } from "zod";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
const input = z.object({ markdown: z.string().trim().min(1).max(200_000), templateId: z.string() }).strict();

/** Free formatting: no model call, credit charge, or modification of the active base resume. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401, headers: noStore });
  const text = await request.text();
  if (Buffer.byteLength(text) > 256_000) return Response.json({ error: "Resume too large" }, { status: 413, headers: noStore });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: noStore }); }
  const parsed = input.safeParse(raw);
  const template = parsed.success && RESUME_TEMPLATES.find(item => item.id === parsed.data.templateId);
  if (!parsed.success || !template) return Response.json({ error: "A valid resume and template are required" }, { status: 400, headers: noStore });
  const compiler = process.env.RESUME_COMPILER_URL;
  const secret = process.env.RESUME_COMPILER_SECRET;
  if (!compiler || !secret) return Response.json({ error: "PDF export is temporarily unavailable" }, { status: 503, headers: noStore });
  const key = `base-preview/${user.id}/${randomUUID()}.pdf`;
  try {
    const uploadUrl = await getSignedUrl(r2Client, new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, ContentType: "application/pdf" }), { expiresIn: 120 });
    const response = await fetch(`${compiler.replace(/\/$/, "")}/api/v1/ui-export`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ resume: { ...parseResumeMarkdown(parsed.data.markdown), rawMarkdown: undefined }, theme: template.themeId, templateId: template.id, uploadUrl }),
      signal: AbortSignal.timeout(90_000), cache: "no-store",
    });
    if (!response.ok || (await response.json()).uploaded !== true) throw new Error("Compiler unavailable");
    const object = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    if (!object.Body || !object.ContentLength || object.ContentLength > 10 * 1024 * 1024) throw new Error("Invalid PDF size");
    const bytes = await object.Body.transformToByteArray();
    if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") throw new Error("Invalid PDF bytes");
    return new Response(new Uint8Array(bytes).buffer, { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="base-resume.pdf"' } });
  } catch { return Response.json({ error: "PDF export failed. Your existing resume is retained; retry shortly." }, { status: 503, headers: noStore }); }
  finally { try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })); } catch { console.error("Temporary base PDF cleanup failed"); } }
}
