import { createHmac } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/server";
import { pool } from "@/lib/db";

const MAX_BYTES = 10 * 1024 * 1024;

function markdownFrom(details: Record<string, unknown>) {
  const payload = details.compiler_payload as { markdown?: unknown } | undefined;
  if (typeof payload?.markdown === "string" && payload.markdown.trim()) return payload.markdown.trim();
  const text = typeof details.text === "string" ? details.text.trim() : "";
  return text ? `# Resume\n\n${text}` : "";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  try {
    const input = await request.formData();
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("Choose a resume file");
    if (!/\.(pdf|docx)$/i.test(file.name)) throw new Error("Upload a PDF or DOCX resume");
    if (file.size > MAX_BYTES) throw new Error("Resume exceeds 10 MB");
    const base = process.env.JOB_HUNT_SERVICE_URL;
    const secret = process.env.JOB_HUNT_SERVICE_SECRET;
    if (!base || !secret) throw new Error("Resume extraction service is not configured");
    const timestamp = String(Math.floor(Date.now() / 1000));
    const form = new FormData(); form.set("file", file, file.name);
    const response = await fetch(`${base}/profile/resume`, { method: "POST", body: form,
      headers: { "x-user-id": user.id, "x-timestamp": timestamp,
        "x-signature": createHmac("sha256", secret).update(`${user.id}:${timestamp}`).digest("hex") },
      signal: AbortSignal.timeout(60_000), cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "Could not read this resume");
    const details = (result.resume_details || {}) as Record<string, unknown>;
    const markdown = markdownFrom(details);
    if (!markdown) throw new Error("No readable resume text was found");
    const saved = await pool.query(`INSERT INTO user_pref_resumes(user_id,title,file_name,file_size,is_primary,content,parsed_data,updated_at)
      VALUES($1,'Primary resume',$2,$3,true,$4,$5,now())
      ON CONFLICT(user_id) DO UPDATE SET file_name=EXCLUDED.file_name,file_size=EXCLUDED.file_size,
        content=EXCLUDED.content,parsed_data=EXCLUDED.parsed_data,updated_at=now()
      RETURNING id,content,parsed_data,file_name`, [user.id, file.name, file.size, markdown, JSON.stringify(details)]);
    const row = saved.rows[0];
    return Response.json({ resume: { id: row.id, markdown: row.content, details: row.parsed_data, fileName: row.file_name } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not upload resume" }, { status: 400 });
  }
}
