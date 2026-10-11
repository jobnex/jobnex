"use client";

import { useState, useMemo, useEffect, useRef, useSyncExternalStore } from "react";
import { useJobStore } from "@/store/useJobStore";
import { listResumeApplications, updateResumeApplicationStage, type ResumeApplication } from "@/app/actions/resume-applications";
import { getExistingTailoredResume, tailorResumeForJob, updateTailoredResumeMarkdown } from "@/app/actions/tailored-resume";
import { authClient } from "@/lib/auth/client";
import { toast } from "sonner";
import { ResumeModal } from "@/components/ResumeModal";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { downloadMarkdownFile } from "@/lib/resumeApi";
import { normalizeExternalUrl } from "@/lib/job-utils";
import {
  Download, Eye, Clock, Building,
  Search, FileText, ChevronDown,
  Check, FileBadge
} from "lucide-react";

// --- Subcomponents ---

const STAGES = ["Applied", "Interview", "Offer"];

function ProgressTracker({ currentStage, onUpdate }: { currentStage: number, onUpdate: (stage: number) => void }) {
  const [hoveredStage, setHoveredStage] = useState<number | null>(null);

  return (
    <div
      className="flex items-center gap-1 sm:gap-2 select-none"
      onMouseLeave={() => setHoveredStage(null)}
    >
      {STAGES.map((stage, index) => {
        const isActive = index <= currentStage;
        const isHoveredPreview = hoveredStage !== null && index <= hoveredStage && !isActive;
        const isSquare = isActive || isHoveredPreview;
        const isLineActive = index < currentStage || (hoveredStage !== null && index < hoveredStage);
        const isTextHighlighted = isActive || hoveredStage === index;

        return (
          <div key={stage} className="flex items-center">
            <button
              onClick={() => onUpdate(index)}
              onMouseEnter={() => setHoveredStage(index)}
              className="flex items-center gap-1 sm:gap-2 group cursor-pointer focus:outline-none"
              aria-label={`Mark as ${stage}`}
            >
              <div
                className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 flex items-center justify-center border-[1.5px] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                  isSquare ? "rounded-[4px] sm:rounded-[5px]" : "rounded-[8px] sm:rounded-[10px]"
                } ${
                  isActive
                    ? "bg-[#111827] border-[#111827] text-white dark:text-[#111827] dark:bg-[#ACEE5F] dark:border-[#ACEE5F]"
                    : isHoveredPreview
                    ? "bg-transparent border-[#111827] dark:border-[#ACEE5F]"
                    : "bg-transparent border-border-input dark:border-[#4B5563]"
                }`}
              >
                {isActive && <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white dark:text-[#111827] animate-in zoom-in-75 duration-150" strokeWidth={3.5} />}
              </div>
              <span
                className={`font-heading text-[0.72rem] sm:text-[0.82rem] font-semibold transition-colors duration-200 ${
                  isTextHighlighted
                    ? "text-text-primary dark:text-[#F3F4F6]"
                    : "text-text-muted dark:text-[#9CA3AF]"
                }`}
              >
                {stage}
              </span>
            </button>
            {index < STAGES.length - 1 && (
              <div
                className={`w-2 sm:w-5 md:w-6 h-[2px] mx-1 sm:mx-1.5 md:mx-2 rounded-full transition-colors duration-200 ${
                  isLineActive ? "bg-[#111827] dark:bg-[#ACEE5F]" : "bg-border-input dark:bg-[#374151]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ResumeDropdownProps {
  onView: () => void;
  disabled: boolean;
  onDownload: () => void;
}

function ResumeDropdown({ onView, onDownload, disabled }: ResumeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="relative z-10"
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center justify-center gap-[0.35rem] px-3.5 py-[0.45rem] rounded-sm border-[1.5px] border-transparent bg-brand-lime text-[#111827] font-heading font-semibold text-[0.85rem] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black"
        aria-expanded={isOpen}
        disabled={disabled}
      >
        <FileText className="w-[14px] h-[14px]" strokeWidth={2.5} />
        <span>Resume</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} strokeWidth={2.5} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full pt-1 z-50">
          <div className="w-[14rem] bg-bg-card border-[1.5px] border-border-color rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.1)] py-2 animate-in fade-in zoom-in-95 duration-200 dark:border-[#2B3042] dark:shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
            <button
              onClick={() => { onView(); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-bg-tag transition-colors cursor-pointer dark:hover:bg-[#1C1E24]"
            >
              <div className="w-7 h-7 rounded-md bg-[rgba(185,255,102,0.18)] dark:bg-[rgba(172,238,95,0.12)] flex items-center justify-center shrink-0">
                <Eye className="w-[14px] h-[14px] text-[#064E3B] dark:text-[#ACEE5F]" strokeWidth={2.5} />
              </div>
              <span className="text-[0.88rem] font-semibold text-text-primary dark:text-white">View Resume</span>
            </button>
            <button
              onClick={() => { onDownload(); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-bg-tag transition-colors cursor-pointer dark:hover:bg-[#1C1E24]"
            >
              <div className="w-7 h-7 rounded-md bg-[rgba(185,255,102,0.18)] dark:bg-[rgba(172,238,95,0.12)] flex items-center justify-center shrink-0">
                <Download className="w-[14px] h-[14px] text-[#064E3B] dark:text-[#ACEE5F]" strokeWidth={2.5} />
              </div>
              <span className="text-[0.88rem] font-semibold text-text-primary dark:text-white">Download Markdown</span>
            </button>

          </div>
        </div>
      )}
    </div>
  );
}

const subscribeHydration = () => () => {};

// --- Main Component ---

export default function ApplicationsPage() {
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const openModal = useJobStore((s) => s.openModal);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const userId = session?.user?.id;
  const currentUser = useRef(userId);
  useEffect(() => { currentUser.current = userId; }, [userId]);
  const [snapshot, setSnapshot] = useState<{userId: string | null, applications: ResumeApplication[]}>({userId: null, applications: []});
  const [loadError, setLoadError] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  // Application tracker states: Map<jobId, stageIndex> (-1 means empty/not applied yet)


  // Resume Modal State
  const [resumeModalState, setResumeModalState] = useState<{isOpen: boolean, mode: "view" | "edit", markdown: string, userId?: string, review?: boolean, jobId?: string, templateId?: string, expectedGenerationId?: string}>({
    isOpen: false,
    mode: "view",
    markdown: "",
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false, inFlight = false, refreshPending = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (inFlight) { refreshPending = true; return; }
      inFlight = true;
      clearTimeout(timer);
      let delay = 4000;
      try {
        const result = await listResumeApplications();
        if (cancelled) return;
        if (result.userId !== userId) { setLoadError(true); return; }
        setSnapshot(result); setLoadError(false);
        delay = result.applications.some(job => ["queued", "running"].includes(job.generationStatus)) ? 4000 : 30000;
      } catch { if (!cancelled) setLoadError(true); }
      finally {
        inFlight = false;
        if (!cancelled) { timer = setTimeout(refresh, refreshPending ? 0 : delay); refreshPending = false; }
      }
    }
    const wake = () => { void refresh(); };
    window.addEventListener("resume-requests-changed",wake);
    window.addEventListener("focus",wake);
    void refresh();
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener("resume-requests-changed",wake); window.removeEventListener("focus",wake); };
  }, [userId]);

  const requestedJobs = useMemo(() => {
    const owned = snapshot.userId === userId ? snapshot.applications : [];
    const q = debouncedSearchQuery.toLowerCase();
    return owned.filter(job => `${job.jobRoleTitle} ${job.company}`.toLowerCase().includes(q));
  }, [snapshot,userId,debouncedSearchQuery]);

  const handleUpdateStage = async (jobId: string, stageIndex: number) => {
    const stage = ["applied","interview","offer"][stageIndex];
    try {
      await updateResumeApplicationStage(jobId,stage);
      setSnapshot(previous => previous.userId === userId ? ({...previous, applications: previous.applications.map(job => job.id === jobId ? {...job,stage} : job)}) : previous);
    } catch { toast.error("Could not save application stage. Retry."); }
  };

  const retryResume = async (job: ResumeApplication) => {
    setOpening(job.id);
    try {
      const result = await tailorResumeForJob(job.id);
      if (!result.success) throw new Error(result.error || "Could not retry generation.");
      window.dispatchEvent(new Event("resume-requests-changed"));
      toast.success("Resume generation requested.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not retry generation."); }
    finally { setOpening(null); }
  };

  const handleResume = async (job: ResumeApplication, download = false) => {
    const owner = userId;
    if (!owner) return;
    setOpening(job.id);
    try {
      const result = await getExistingTailoredResume(job.id);
      if (currentUser.current !== owner) return;
      if (!result.exists || !result.resume) { toast.error(result.error || "No saved draft yet. Generation continues in background if pending."); return; }
      const review = result.resume.status === "needs_review";
      if (download) {
        if (review) toast.warning("Review this draft against your source resume before using it.");
        downloadMarkdownFile(result.resume.markdown, `${job.company}_${job.jobRoleTitle}_resume.md`);
      } else setResumeModalState({isOpen: true,mode: "view",markdown: result.resume.markdown,userId: owner,review,jobId: job.id,templateId: result.resume.templateId,expectedGenerationId: result.resume.id});
    } catch { toast.error("Could not load saved draft. Retry."); }
    finally { setOpening(null); }
  };

  return (
    <>
      <div className="flex flex-col gap-6 h-full w-full max-w-full animate-in fade-in duration-500">

        <div className="flex flex-col gap-6">
          <div>
            <h1 className="font-heading text-[1.45rem] font-semibold text-text-primary -mt-2">
              My Applications
            </h1>
            <p className="text-text-muted text-[0.95rem] mt-1">
              Resume requests appear here immediately. Mark Applied after submitting to the employer.
            </p>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-center">
            <div className="relative flex-1 w-full group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-text-subtle transition-colors group-focus-within:text-text-primary dark:text-[#A1A1AA]" />
              <input
                type="text"
                className="w-full pl-[2.75rem] pr-4 py-[0.7rem] bg-bg-input border border-border-input rounded-lg focus:border-text-primary focus:bg-white outline-none text-[0.95rem] font-medium text-text-primary placeholder:text-text-subtle transition-all duration-200 dark:bg-[#151720] dark:border-[#2B3042] dark:focus:border-[#ACEE5F] dark:focus:shadow-[0_0_0_1px_#ACEE5F,0_2px_8px_rgba(0,0,0,0.3)] dark:focus:bg-[#1A1C26] dark:text-white"
                placeholder="Search applications..."
                aria-label="Search applications"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>


          </div>
        </div>

        {loadError && <p role="alert">Applications could not refresh. Retrying automatically.</p>}
        {!hydrated || sessionPending ? <p role="status">Loading applications...</p> : !userId ? <p role="status">Sign in to view your applications.</p> : snapshot.userId !== userId ? (
          !loadError && <p role="status">Loading applications...</p>
        ) : requestedJobs.length === 0 && !loadError ? (
          <div className="flex flex-col items-center justify-center flex-1 py-32 text-center bg-bg-card border border-border-subtle rounded-[10px] border-dashed">
            <div className="w-16 h-16 bg-bg-tag rounded-full flex items-center justify-center mb-5 text-text-subtle">
              <FileBadge className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">No Applications Found</h3>
            <p className="text-text-muted max-w-sm">
              {searchQuery ? "No applications match your search query." : "You haven't requested any applications yet. Explore the curated jobs tab."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-10">
            {requestedJobs.map((job) => {
              const currentStage = ["applied", "interview", "offer"].indexOf(job.stage ?? "");
              const applyUrl = normalizeExternalUrl(job.externalApplyUrl);

              return (
                <div
                  key={job.id}
                  className="relative hover:z-50 grid grid-cols-1 lg:grid-cols-[minmax(220px,1.2fr)_auto_auto] xl:grid-cols-[1fr_auto_1fr] items-center p-3.5 sm:p-[1.25rem_1.5rem] bg-bg-card border-[1.5px] border-border-subtle rounded-[10px] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#9CA3AF] dark:border-[#2B3042] dark:hover:border-[#6B7280] gap-4 xl:gap-6"
                >

                  {/* Left Zone: Details */}
                  <div className="flex flex-col justify-center min-h-[5.1rem] min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 text-[0.74rem] font-bold text-text-subtle uppercase tracking-wider mb-[0.45rem] dark:text-[#9CA3AF]">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span className="whitespace-nowrap">{new Date(job.requestedAt).toLocaleString()}</span>
                    </div>

                    <div className="min-h-[2.85rem] flex flex-col justify-start">
                      <a
                        href="#jobDetails"
                        onClick={(e) => { e.preventDefault(); openModal(job); }}
                        className="font-heading text-[1.2rem] font-semibold text-text-primary leading-[1.26] line-clamp-2 hover:underline transition-colors w-fit dark:text-white"
                      >
                        {job.jobRoleTitle}
                      </a>
                    </div>

                    <div className="flex items-center gap-1.5 text-[0.88rem] font-semibold text-text-muted mt-0.5">
                      <Building className="w-3.5 h-3.5 shrink-0 text-text-subtle dark:text-[#9CA3AF]" />
                      <span>{job.company}</span>
                    </div>
                    <div className="mt-2 text-sm text-text-muted" aria-live="polite">
                      Resume: {job.generationStatus === "completed" ? "Ready" : job.generationStatus === "needs_review" ? "Saved draft — review required" : job.generationStatus === "failed" ? "Generation failed" : "Generating in background"}
                    </div>
                  </div>

                  {/* Middle Zone: Tracker (Dead-center relative to card edges and Left/Right zones) */}
                  <div className="flex items-center justify-center py-2 lg:py-0 shrink-0 mx-auto lg:mx-0 xl:mx-auto">
                    <div className="bg-bg-input px-3 sm:px-5 py-[0.55rem] sm:py-[0.65rem] rounded-full border border-border-subtle dark:bg-[#222534] dark:border-[#2F3446] flex items-center justify-center shadow-none max-w-full overflow-x-auto">
                      <ProgressTracker
                        currentStage={currentStage}
                        onUpdate={(stage) => handleUpdateStage(job.id, stage)}
                      />
                    </div>
                  </div>

                  {/* Right Zone: Actions */}
                  <div className="flex items-center justify-between lg:justify-end gap-3 sm:gap-5 shrink-0 pt-3 lg:pt-0 border-t border-border-subtle lg:border-t-0 w-full lg:w-auto">
                    {applyUrl ? (
                      <a
                        href={applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-[0.35rem] font-heading text-[0.85rem] font-semibold text-text-primary cursor-pointer transition-all duration-150 hover:underline hover:underline-offset-4 group/link dark:text-white"
                        aria-label={`Apply for ${job.jobRoleTitle} at ${job.company} (opens in a new tab)`}
                      >
                        <span>Apply Now</span>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-[13px] h-[13px] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                        >
                          <line x1="7" y1="17" x2="17" y2="7"></line>
                          <polyline points="7 7 17 7 17 17"></polyline>
                        </svg>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openModal(job)}
                        className="inline-flex items-center gap-[0.35rem] font-heading text-[0.85rem] font-semibold text-text-primary cursor-pointer transition-all duration-150 hover:underline hover:underline-offset-4 group/link dark:text-white"
                      >
                        <span>Apply Now</span>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-[13px] h-[13px] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                        >
                          <line x1="7" y1="17" x2="17" y2="7"></line>
                          <polyline points="7 7 17 7 17 17"></polyline>
                        </svg>
                      </button>
                    )}

                    {job.generationStatus === "failed" && <div className="text-xs">
                      <p role="status">{job.failureReason} {job.creditState === "released" ? "Credit refunded." : ""}</p>
                      <button disabled={opening !== null} onClick={() => void retryResume(job)} className="mt-1 rounded bg-brand-lime px-3 py-1 font-bold text-[#111827] disabled:opacity-50">Retry generation</button>
                    </div>}
                    <ResumeDropdown
                      onView={() => void handleResume(job)}
                                            onDownload={() => void handleResume(job,true)}
                      disabled={opening === job.id || ["queued","running"].includes(job.generationStatus)}
                    />
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      <ResumeModal
        isOpen={resumeModalState.isOpen && resumeModalState.userId === userId}
        initialMode={resumeModalState.mode}
        initialMarkdown={resumeModalState.userId === userId ? resumeModalState.markdown : ""}
        templateId={resumeModalState.templateId || "modern-ivy"}
        exportJobId={resumeModalState.jobId}
        expectedGenerationId={resumeModalState.expectedGenerationId}
        onSave={async (markdown, templateId) => {
          if (!resumeModalState.jobId) throw new Error("Application resume is unavailable.");
          const result = await updateTailoredResumeMarkdown(resumeModalState.jobId, markdown, templateId, resumeModalState.expectedGenerationId);
          if (!result.success) throw new Error(result.error || "Could not save changes.");
          setResumeModalState(previous => ({ ...previous, markdown, templateId }));
          window.dispatchEvent(new Event("resume-requests-changed"));
        }}
        reviewWarning={resumeModalState.review ? "Review this draft against your source resume before using it." : undefined}
        onClose={() => setResumeModalState(prev => ({ ...prev, isOpen: false }))}
      />
    </>
  );
}
