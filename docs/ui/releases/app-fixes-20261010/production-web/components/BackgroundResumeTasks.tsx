"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { getExistingTailoredResume, getResumeRequestStatus, listResumeRequests, tailorResumeForJob, updateTailoredResumeMarkdown, type ResumeRequestSummary } from "@/app/actions/tailored-resume";
import { useCreditStore } from "@/store/useCreditStore";
import { ResumeModal } from "@/components/ResumeModal";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

/** Preserve every active run and the latest finished attempt per job (server order). */
export function currentResumeRequests(requests: ResumeRequestSummary[]) {
  const seenJobs = new Set<string>();
  return requests.filter(request => {
    if (["queued", "running"].includes(request.status)) return true;
    const seen = seenJobs.has(request.job_id);
    seenJobs.add(request.job_id);
    return !seen;
  });
}

/** Finished requests are ordered newest first by the server; history cannot update the current copy. */
export function isHistoricalResumeRequest(request: ResumeRequestSummary, requests: ResumeRequestSummary[]) {
  return requests.find(item => item.job_id === request.job_id && !["queued", "running"].includes(item.status))?.id !== request.id;
}

/** The worker owns execution. This layout component only observes durable DB state. */
export function BackgroundResumeTasks() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const [snapshot, setSnapshot] = useState<{ userId: string | null; requests: ResumeRequestSummary[] }>({ userId: null, requests: [] });
  const [unavailable, setUnavailable] = useState(false);
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ userId: string; id: string; jobId: string; markdown: string; review: boolean; historical: boolean; templateId?: string } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false, inFlight = false, refreshPending = false;
    let timer: ReturnType<typeof setTimeout>;
    let previous = new Map<string, string>();
    async function refresh() {
      if (inFlight) { refreshPending = true; return; }
      inFlight = true;
      clearTimeout(timer);
      let delay = 4000;
      try {
        const result = await listResumeRequests();
        if (cancelled || result.userId !== userId) return;
        for (const request of result.requests) {
          if (["queued", "running"].includes(previous.get(request.id) || "") && !["queued", "running"].includes(request.status)) {
            const label = `${request.title} • ${request.company}`;
            if (request.has_draft) {
              if (request.status === "needs_review") toast.warning(`Draft saved for ${label}. Review required.`);
              else toast.success(`Resume saved for ${label}.`);
            } else toast.error(`${label}: ${request.failureReason || "Generation failed without a usable draft."} ${request.credit_state === "released" ? "Credit refunded." : ""}`);
            void useCreditStore.getState().fetchCredits();
            void queryClient.invalidateQueries({ queryKey: ["matched-jobs"] });
          }
        }
        previous = new Map(result.requests.map(request => [request.id, request.status]));
        setSnapshot(result);
        setUnavailable(false);
        delay = result.requests.some(request => ["queued", "running"].includes(request.status)) ? 4000 : 30000;
      } catch {
        if (!cancelled) setUnavailable(true);
      } finally {
        inFlight = false;
        if (!cancelled) { timer = setTimeout(refresh, refreshPending ? 0 : delay); refreshPending = false; }
      }
    }
    const wake = () => { setExpanded(true); void refresh(); };
    const focus = () => { void refresh(); };
    window.addEventListener("resume-requests-changed", wake);
    window.addEventListener("focus", focus);
    void refresh();
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener("resume-requests-changed", wake); window.removeEventListener("focus", focus); };
  }, [userId, queryClient]);

  // Do not expose a previous account's cached requests or draft after a session switch.
  const requests = userId && snapshot.userId === userId ? snapshot.requests : [];
  async function retry(request: ResumeRequestSummary) {
    setOpening(request.id);
    try {
      const result = await tailorResumeForJob(request.job_id);
      if (!result.success) throw new Error(result.error || "Could not retry generation.");
      window.dispatchEvent(new Event("resume-requests-changed"));
      toast.success("Resume generation requested.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not retry generation."); }
    finally { setOpening(null); }
  }
  async function openDraft(request: ResumeRequestSummary) {
    if (!userId) return;
    setOpening(request.id);
    try {
      const historical = isHistoricalResumeRequest(request, requests);
      if (historical) {
        const result = await getResumeRequestStatus(request.id);
        if (!result.success || !result.markdown) throw new Error(result.error || "Saved draft is unavailable. Retry shortly.");
        setDraft({ userId, id: request.id, jobId: request.job_id, markdown: result.markdown, review: result.status === "needs_review", historical: true,
          templateId: "templateId" in result && typeof result.templateId === "string" ? result.templateId : undefined });
      } else {
        const result = await getExistingTailoredResume(request.job_id);
        if (!result.exists || !result.resume?.markdown) throw new Error(result.error || "Saved draft is unavailable. Retry shortly.");
        setDraft({ userId, id: result.resume.id, jobId: request.job_id, markdown: result.resume.markdown, review: result.resume.status === "needs_review",
          historical: false, templateId: result.resume.templateId || undefined });
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open draft."); }
    finally { setOpening(null); }
  }

  if (!userId || (!requests.length && !unavailable)) return null;
  const active = requests.filter(request => ["queued", "running"].includes(request.status)).length;
  const currentRequests = currentResumeRequests(requests);
  const visibleRequests = showHistory ? requests : currentRequests;
  const earlierCount = requests.length - currentRequests.length;
  const panelExpanded = expanded ?? active > 0;
  return <>
    <aside aria-label="Resume generations" className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4 right-3 z-40 w-[min(25rem,calc(100vw-1.5rem))] rounded-xl border border-border-input bg-bg-card p-3 shadow-xl dark:border-[#374151] dark:bg-[#161822]">
      <button aria-expanded={panelExpanded} onClick={() => setExpanded(!panelExpanded)} className="flex w-full items-center justify-between text-left text-sm font-bold">
        <span>Resume generations{active ? ` (${active} active)` : ""}</span><span aria-hidden="true">{panelExpanded ? "−" : "+"}</span>
      </button>
      {panelExpanded && <div className="mt-2 max-h-64 space-y-3 overflow-y-auto text-xs">
        <p className="text-text-muted">Runs continue in the background. Reload to restore saved status.</p>
        {unavailable && <p role="status">Status temporarily unavailable. Retrying; this does not stop the worker.</p>}
        {visibleRequests.map(request => <div key={request.id} className="border-t border-border-input pt-2">
          <p className="font-semibold">{request.title || "Resume"} • {request.company || "Job"}</p>
          <p role="status" className="mt-1">{request.status.replaceAll("_", " ")} · {request.credit_state === "consumed" ? "1 credit charged" : request.credit_state === "held" ? "1 credit reserved" : request.credit_state === "released" ? "Credit refunded" : request.credit_state}</p>
          {request.status === "needs_review" && request.has_draft && <p className="mt-1 text-amber-700 dark:text-amber-300">Review this draft against your original experience before using it.</p>}
          {!request.has_draft && !["queued", "running"].includes(request.status) && <p className="mt-1 text-text-muted">{request.failureReason || "No usable saved draft."}</p>}
          {request.status === "failed" && <button onClick={() => void retry(request)} disabled={opening !== null} className="mt-2 rounded bg-brand-lime px-3 py-1 font-bold text-[#111827] disabled:opacity-50">Retry generation</button>}
          {request.has_draft && <button onClick={() => void openDraft(request)} disabled={opening !== null} className="mt-2 rounded bg-brand-lime px-3 py-1 font-bold text-[#111827] disabled:opacity-50">{opening === request.id ? "Opening…" : "View draft"}</button>}
        </div>)}
        {earlierCount > 0 && <button onClick={() => setShowHistory(value => !value)} className="underline">{showHistory ? "Hide earlier attempts" : `Show earlier attempts (${earlierCount})`}</button>}
      </div>}
    </aside>
    {draft?.userId === userId && <ResumeModal key={draft.id} isOpen onClose={() => setDraft(null)} initialMarkdown={draft.markdown} initialMode="view" templateId={draft.templateId} readOnly={draft.historical} expectedGenerationId={draft.historical ? undefined : draft.id} exportJobId={draft.historical ? undefined : draft.jobId}
      onSave={draft.historical ? undefined : async (markdown, templateId) => {
        const result = await updateTailoredResumeMarkdown(draft.jobId, markdown, templateId, draft.id);
        if (!result.success) throw new Error(result.error || "Could not save resume edits.");
        setDraft(current => current?.id === draft.id ? { ...current, markdown, templateId } : current);
        void queryClient.invalidateQueries({ queryKey: ["matched-jobs"] });
      }}
      reviewWarning={[draft.historical ? "Historical draft: view only. Open the current draft from My Applications to edit or export a PDF." : undefined, draft.review ? "Needs review: check this draft against your original experience before using it. It has not passed all generation checks." : undefined].filter(Boolean).join(" ") || undefined} />}
  </>;
}
