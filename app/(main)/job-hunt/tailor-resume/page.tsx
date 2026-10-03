"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileUp, LoaderCircle, Sparkles } from "lucide-react";

type Job = { id: string; title: string; company: string; description: string };
type Resume = { id: string; markdown: string };
type Preview = { matched: string[]; missing: string[]; sourceWordCount: number };

export default function TailorResumePage() {
  const search = useSearchParams(); const jobId = search?.get("jobId") || "";
  const [job, setJob] = useState<Job | null>(null); const [resume, setResume] = useState<Resume | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null); const [requestId, setRequestId] = useState("");
  const [status, setStatus] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const resumeId = resume?.id;
  const canGenerate = !!resume && !!preview && !requestId;

  useEffect(() => { if (!jobId) return;
    fetch(`/api/resume/tailor/jobs/${jobId}`).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setJob(body.job);
    }).catch(error => setError(error.message));
  }, [jobId]);

  useEffect(() => { if (!resumeId) return; fetch(`/api/resume/tailor/resumes/${resumeId}/preview?jobId=${jobId}`)
    .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setPreview(body.preview); })
    .catch(error => setError(error.message)); }, [jobId, resumeId]);

  useEffect(() => { if (!requestId) return; const timer = setInterval(async () => {
    const response = await fetch(`/api/resume/tailor/requests/${requestId}`); const body = await response.json();
    if (!response.ok) return setError(body.error || "Could not check generation");
    setStatus(body.request.status);
    if (["completed", "failed", "needs_review"].includes(body.request.status)) clearInterval(timer);
  }, 2000); return () => clearInterval(timer); }, [requestId]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError("");
    try { const form = new FormData(); form.set("file", file); const response = await fetch("/api/resume/tailor/upload", { method: "POST", body: form });
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setResume(body.resume); setPreview(null); }
    catch (error) { setError(error instanceof Error ? error.message : "Upload failed"); } finally { setBusy(false); }
  }

  async function saveDraft(markdown: string) {
    if (!resume) return; setResume({ ...resume, markdown });
  }
  async function queue() {
    if (!resume) return; setBusy(true); setError("");
    try { const response = await fetch("/api/resume/tailor/requests", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, resumeId: resume.id, idempotencyKey: crypto.randomUUID() }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setRequestId(body.request.id); setStatus(body.request.status); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not start tailoring"); } finally { setBusy(false); }
  }
  const heading = useMemo(() => job ? `Tailor for ${job.title}` : "Tailor your resume", [job]);

  return <section className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
    <div><p className="text-sm font-bold text-brand-dark dark:text-brand-lime">RESUME LAB</p><h1 className="mt-1 text-3xl font-bold text-text-primary dark:text-white">{heading}</h1>
      {job && <p className="mt-2 text-text-muted">{job.company}. The job description is loaded securely from Neon.</p>}</div>
    {!jobId && <p role="alert" className="rounded-md border border-red-400 bg-red-50 p-3 text-red-800 dark:bg-red-950/30 dark:text-red-200">Select a job from the job board first.</p>}
    {error && <p role="alert" className="rounded-md border border-red-400 bg-red-50 p-3 text-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
    {!resume && <label className="block cursor-pointer rounded-xl border-2 border-dashed border-border-input bg-bg-card p-10 text-center dark:border-[#374151]">
      <FileUp className="mx-auto mb-3 h-9 w-9"/><span className="font-semibold">Drop a PDF or DOCX resume here</span><span className="mt-1 block text-sm text-text-muted">Up to 10 MB. It is parsed into a Markdown draft stored in Neon.</span>
      <input className="sr-only" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={upload} disabled={busy}/></label>}
    {busy && <p className="flex items-center gap-2 text-text-muted"><LoaderCircle className="h-4 w-4 animate-spin"/>Working…</p>}
    {resume && <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <div className="space-y-2"><label htmlFor="resume-markdown" className="font-semibold">Review the extracted Markdown</label><textarea id="resume-markdown" value={resume.markdown} onChange={event => saveDraft(event.target.value)} onBlur={async event => {
        const response = await fetch(`/api/resume/tailor/resumes/${resume.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ markdown: event.target.value }) });
        if (!response.ok) { const body = await response.json(); setError(body.error || "Could not save your changes"); return; }
        const previewResponse = await fetch(`/api/resume/tailor/resumes/${resume.id}/preview?jobId=${jobId}`);
        const previewBody = await previewResponse.json(); if (previewResponse.ok) setPreview(previewBody.preview);
      }} className="min-h-96 w-full rounded-md border border-border-input bg-bg-card p-3 font-mono text-sm dark:border-[#374151]"/>
        <p className="text-sm text-text-muted">Correct extraction errors before spending a credit. The agent only uses this evidence.</p></div>
      <aside className="space-y-4 rounded-xl border border-border-subtle bg-bg-card p-5"><h2 className="font-bold">Match overview</h2>
        {preview ? <><p className="text-sm text-text-muted">{preview.sourceWordCount} distinctive source terms detected.</p><div><h3 className="font-semibold">Strong matches</h3><p className="mt-1 text-sm">{preview.matched.join(", ") || "No clear matches yet"}</p></div><div><h3 className="font-semibold">Needs evidence</h3><p className="mt-1 text-sm">{preview.missing.join(", ") || "None detected"}</p></div></> : <p className="text-sm text-text-muted">Comparing your resume with this job…</p>}
        {!requestId && <button onClick={queue} disabled={!canGenerate || busy} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-lime px-4 py-3 font-bold text-[#111827] disabled:opacity-50"><Sparkles className="h-4 w-4"/>Generate tailored Markdown — 1 credit</button>}
        {requestId && <div className="space-y-3"><p className="font-semibold">Generation: {status || "queued"}</p>{status === "completed" && <a href={`/api/resume/tailor/generated/${requestId}`} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-lime px-4 py-3 font-bold text-[#111827]"><Download className="h-4 w-4"/>Download Markdown</a>}{["failed", "needs_review"].includes(status) && <p className="text-sm text-text-muted">No credit was consumed. Review the resume and retry.</p>}</div>}
      </aside></div>}
  </section>;
}
