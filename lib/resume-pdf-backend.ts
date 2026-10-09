// Only the authenticated server sends service credentials to the private PDF API.
export async function callResumePdfBackend(userId: string, jobId: string, suffix: string, body?: unknown) {
  const base = process.env.RESUME_PDF_BACKEND_URL?.replace(/\/$/, "");
  const secret = process.env.RESUME_PDF_BACKEND_TOKEN;
  if (!base || !secret || !base.startsWith("https://")) throw new Error("PDF backend is not configured");
  const identity = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(base)}&format=full`, {
    headers: { "Metadata-Flavor": "Google" }, cache: "no-store", signal: AbortSignal.timeout(5_000),
  });
  if (!identity.ok) throw new Error("PDF service identity is unavailable");
  return fetch(`${base}/api/v1/jobs/${jobId}/${suffix}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${secret}`, "X-Serverless-Authorization": `Bearer ${(await identity.text()).trim()}`,
      "X-User-Id": userId, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store", signal: AbortSignal.timeout(90_000),
  });
}

export async function exportResumePdf(userId: string, jobId: string, markdown: string, templateId: string) {
  const preview = await callResumePdfBackend(userId, jobId, "preview", { markdown, template_id: templateId });
  if (!preview.ok) return { response: preview };
  const artifact = await preview.json() as { preview_id: string; revision: string; pdf_sha256: string; markdown_sha256: string };
  const exported = await callResumePdfBackend(userId, jobId, "export", { preview_id: artifact.preview_id, expected_revision: artifact.revision });
  return { response: exported, artifact };
}
