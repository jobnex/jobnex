"use client";

import { ChangeEvent, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileUp, LoaderCircle, Sparkles } from "lucide-react";

type Job = { id: string; title: string; company: string; description: string };
type Resume = { id: string; markdown: string };
type Preview = { matched: string[]; missing: string[]; sourceWordCount: number };
const terminal = ["completed", "failed", "needs_review"];
const buttonStyle = "inline-flex items-center justify-center gap-2 rounded-md bg-brand-lime px-4 py-3 font-bold text-[#111827] disabled:opacity-50";

async function readJson(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Request failed. Please retry.");
  return body;
}

export default function TailorResumePage() {
  return <Suspense fallback={<main className="p-8 text-text-muted">Loading Resume Lab…</main>}><TailorResumeContent /></Suspense>;
}

function TailorResumeContent() {
  const search = useSearchParams();
  const jobId = search?.get("jobId") || "";
  const [job, setJob] = useState<Job | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [requestId, setRequestId] = useState(search?.get("requestId") || "");
  const [status, setStatus] = useState("");
  const [creditState, setCreditState] = useState("");
  const [generated, setGenerated] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [template, setTemplate] = useState("mit-capd");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef("");

  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    fetch(`/api/resume/tailor/jobs/${jobId}`, { signal: controller.signal }).then(readJson)
      .then(body => setJob(body.job)).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [jobId]);

  useEffect(() => {
    if (!requestId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const body = await readJson(await fetch(`/api/resume/tailor/requests/${requestId}`, { signal: controller.signal }));
        if (body.request.job_id !== jobId) throw new Error("This request belongs to another job. Open it from its original job link.");
        setStatus(body.request.status);
        setCreditState(body.request.credit_state);
        setError("");
        if (["completed", "needs_review"].includes(body.request.status)) {
          const result = await readJson(await fetch(`/api/resume/tailor/generated/${requestId}?format=json`, { signal: controller.signal }));
          setGenerated(result.generation.resume_markdown);
        }
        if (!terminal.includes(body.request.status)) timer = setTimeout(poll, 2500);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : "Could not check generation; retrying.");
          timer = setTimeout(poll, 4000);
        }
      }
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, requestId]);

  async function refreshPreview(current: Resume) {
    const body = await readJson(await fetch(`/api/resume/tailor/resumes/${current.id}/preview?jobId=${jobId}`));
    setPreview(body.preview);
  }

  async function uploadFile(file: File) {
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.set("file", file);
      const body = await readJson(await fetch("/api/resume/tailor/upload", { method: "POST", body: form }));
      setResume(body.resume); setPreview(null);
      await refreshPreview(body.resume);
    } catch (error) { setError(error instanceof Error ? error.message : "Upload failed"); }
    finally { setBusy(false); }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (file) uploadFile(file);
  }

  async function saveDraft() {
    if (!resume) return;
    await readJson(await fetch(`/api/resume/tailor/resumes/${resume.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ markdown: resume.markdown }) }));
    await refreshPreview(resume);
  }

  async function review() {
    setBusy(true); setError("");
    try { await saveDraft(); } catch (error) { setError(error instanceof Error ? error.message : "Could not save your changes"); }
    finally { setBusy(false); }
  }

  async function queue() {
    if (!resume) return;
    setBusy(true); setError("");
    try {
      await saveDraft(); // Never reserve a credit before the reviewed input is saved.
      idempotencyKey.current ||= crypto.randomUUID();
      const body = await readJson(await fetch("/api/resume/tailor/requests", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId, resumeId: resume.id, idempotencyKey: idempotencyKey.current }) }));
      const id = body.request.id;
      setRequestId(id); setStatus(body.request.status);
      window.dispatchEvent(new Event("resume-requests-changed"));
      const url = new URL(window.location.href); url.searchParams.set("requestId", id); window.history.replaceState(null, "", url);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not start tailoring"); }
    finally { setBusy(false); }
  }

  async function exportPdf() {
    setBusy(true); setError(""); setPdfUrl("");
    try {
      const body = await readJson(await fetch(`/api/resume/tailor/generated/${requestId}/pdf`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown: generated, templateId: template }) }));
      setPdfUrl(body.downloadUrl);
    } catch (error) { setError(error instanceof Error ? error.message : "PDF export failed"); }
    finally { setBusy(false); }
  }

  function retry() {
    setRequestId(""); setStatus(""); setGenerated(""); setPdfUrl(""); setError(""); idempotencyKey.current = "";
    const url = new URL(window.location.href); url.searchParams.delete("requestId"); window.history.replaceState(null, "", url);
  }

  return <section className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
    <div><p className="text-sm font-bold text-brand-dark dark:text-brand-lime">RESUME LAB</p>
      <h1 className="mt-1 text-3xl font-bold text-text-primary dark:text-white">{job ? `Tailor for ${job.title}` : "Tailor your resume"}</h1>
      {job && <p className="mt-2 text-text-muted">{job.company}. Tailoring uses this job’s saved description.</p>}</div>
    {!jobId && <p role="alert">Select a job from the job board first.</p>}
    {error && <p role="alert" className="rounded-md border border-red-400 bg-red-50 p-3 text-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
    {!resume && !requestId && <label className="block cursor-pointer rounded-xl border-2 border-dashed border-border-input bg-bg-card p-10 text-center dark:border-[#374151]"
      onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file && !busy && job) uploadFile(file); }}>
      <FileUp className="mx-auto mb-3 h-9 w-9" aria-hidden="true"/><span className="font-semibold">Drop a PDF or DOCX resume here</span>
      <span className="mt-1 block text-sm text-text-muted">Up to 10 MB. Review the extracted text before generating.</span>
      <input aria-label="Upload resume PDF or DOCX" className="sr-only" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={upload} disabled={busy || !job}/></label>}
    {busy && <p role="status" className="flex items-center gap-2 text-text-muted"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true"/>Working…</p>}
    {resume && !requestId && <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <div className="space-y-2"><label htmlFor="resume-markdown" className="font-semibold">Review the extracted Markdown</label>
        <textarea id="resume-markdown" value={resume.markdown} onChange={event => { setResume({ ...resume, markdown: event.target.value }); setPreview(null); }} disabled={busy}
          className="min-h-96 w-full rounded-md border border-border-input bg-bg-card p-3 font-mono text-sm dark:border-[#374151]"/>
        <p className="text-sm text-text-muted">Correct extraction errors before spending a credit. The agent only uses this evidence.</p>
        <button className={buttonStyle} onClick={review} disabled={busy || !resume.markdown.trim()}>Save and refresh match</button></div>
      <aside className="space-y-4 rounded-xl border border-border-subtle bg-bg-card p-5"><h2 className="font-bold">Match overview</h2>
        {preview ? <><p className="text-sm text-text-muted">{preview.sourceWordCount} distinctive source terms detected.</p>
          <div><h3 className="font-semibold">Strong matches</h3><p className="mt-1 text-sm">{preview.matched.join(", ") || "No clear matches yet"}</p></div>
          <div><h3 className="font-semibold">Needs evidence</h3><p className="mt-1 text-sm">{preview.missing.join(", ") || "None detected"}</p></div></> : <p className="text-sm text-text-muted">Save your changes to refresh the match overview.</p>}
        <button onClick={queue} disabled={!preview || busy || !job} className={`${buttonStyle} w-full`}><Sparkles className="h-4 w-4" aria-hidden="true"/>Generate tailored Markdown — 1 credit</button>
      </aside></div>}
    {requestId && <div className="space-y-4 rounded-xl border border-border-subtle bg-bg-card p-5">
      <p role="status" className="font-semibold">Generation: {status || "checking"}</p>
      {["completed", "needs_review"].includes(status) && generated && <><a href={`/api/resume/tailor/generated/${requestId}`} className={buttonStyle}><Download className="h-4 w-4" aria-hidden="true"/>Download Markdown</a>
        <p className="text-sm text-text-muted">Your generated Markdown is saved. Optional PDF export uses the version you review below and does not spend another credit.</p>
        <label htmlFor="generated-markdown" className="block font-semibold">Review generated Markdown for PDF export</label>
        <textarea id="generated-markdown" value={generated} onChange={event => { setGenerated(event.target.value); setPdfUrl(""); }} disabled={busy}
          className="min-h-96 w-full rounded-md border border-border-input bg-bg-card p-3 font-mono text-sm dark:border-[#374151]"/>
        <label htmlFor="pdf-template" className="block font-semibold">PDF template</label>
        <select id="pdf-template" value={template} onChange={event => { setTemplate(event.target.value); setPdfUrl(""); }} disabled={busy} className="rounded-md border border-border-input bg-bg-card p-3">
          <option value="mit-capd">MIT CAPD</option><option value="modern-ivy">Modern Ivy</option><option value="minimalist-exec">Minimalist Executive</option><option value="tech-specialist">Tech Specialist</option>
        </select>
        <div className="flex flex-wrap gap-3"><button onClick={exportPdf} disabled={busy || !generated.trim()} className={buttonStyle}>Export reviewed PDF</button>
          {pdfUrl && <a href={pdfUrl} className={buttonStyle}><Download className="h-4 w-4" aria-hidden="true"/>Download PDF</a>}</div>
        {pdfUrl && <p role="status">PDF saved for this candidate and job. Download uses the exact exported preview.</p>}
      </>}
      {status === "needs_review" && <p role="alert" className="rounded border border-amber-500 p-3 text-amber-700 dark:text-amber-300">Needs review: check the saved draft against your original experience before using it.</p>}
      {terminal.includes(status) && <p className="text-sm text-text-muted">{creditState === "consumed" ? "1 credit charged for the saved draft." : creditState === "released" ? "Credit refunded for this request." : "Check credit status in Resume generations."}</p>}
      {status === "failed" && <button onClick={retry} className={buttonStyle}>Review and try again</button>}
    </div>}
  </section>;
}
