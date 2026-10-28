"use client";

import { useEffect, useState, useCallback } from "react";
import { useJobStore } from "@/store/useJobStore";
import { useCreditStore } from "@/store/useCreditStore";
import { useResumeStore } from "@/store/useResumeStore";
import { authClient } from "@/lib/auth/client";
import {
  getTailoringPreview,
  initiateTailoringRequest,
  updateTailoredResumeMarkdown,
  TailoringPreviewResult,
} from "@/app/actions/tailored-resume";
import { ResumeModal } from "@/components/ResumeModal";
import { downloadMarkdownFile } from "@/lib/resumeApi";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/utils/scrollLock";
import { toast } from "sonner";
import Link from "next/link";
import { Job } from "@/types";
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Coins,
  Copy,
  Check,
  Download,
  FileText,
  RotateCcw,
  Loader2,
  ExternalLink,
  Layers,
  RefreshCw,
  Target,
} from "lucide-react";

export function TailorResumeModal() {
  const isTailorModalOpen = useJobStore((s) => s.isTailorModalOpen);
  const tailoringJob = useJobStore((s) => s.tailoringJob);
  const closeTailorModal = useJobStore((s) => s.closeTailorModal);

  if (!isTailorModalOpen || !tailoringJob) return null;

  return (
    <TailorResumeModalContent
      key={tailoringJob.id}
      job={tailoringJob}
      onClose={closeTailorModal}
    />
  );
}

interface TailorResumeModalContentProps {
  job: Job;
  onClose: () => void;
}

function TailorResumeModalContent({ job, onClose }: TailorResumeModalContentProps) {
  const { data: session } = authClient.useSession();
  const storeCredits = useCreditStore((s) => s.balance);

  const [previewData, setPreviewData] = useState<TailoringPreviewResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [isRetryingPreview, setIsRetryingPreview] = useState(false);
  const [tailoringStage, setTailoringStage] = useState<"preview" | "completed">("preview");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [tailoredMarkdown, setTailoredMarkdown] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"formatted" | "raw">("formatted");
  const [isCopied, setIsCopied] = useState(false);
  const [isFullStudioOpen, setIsFullStudioOpen] = useState(false);

  // Compute effective credit balance from preview response or client credit store
  const effectiveCreditBalance = previewData?.creditBalance ?? storeCredits ?? 0;

  // Close on Escape key
  useEscapeKey(() => {
    if (!isFullStudioOpen && !isSubmitting) {
      onClose();
    }
  }, true);

  // Lock body scroll while modal is mounted
  useEffect(() => {
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, []);

  // Sync client credit balance if not yet loaded
  useEffect(() => {
    if (storeCredits === null) {
      useCreditStore.getState().fetchCredits().catch(() => {});
    }
  }, [storeCredits]);

  // Load preview data on mount
  useEffect(() => {
    let isMounted = true;

    getTailoringPreview(job.id)
      .then((res) => {
        if (isMounted) {
          setPreviewData(res);
          if (res.existingResume?.markdown) {
            setTailoredMarkdown(res.existingResume.markdown);
          }
          setIsLoadingPreview(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Preview load error:", err);
          // Fallback state ensures candidate is never blocked from invoking Service 2
          setPreviewData({
            success: true,
            hasProfile: true,
            skillGapAvailable: false,
            skillGapError: err instanceof Error ? err.message : "Skill-gap service temporarily unavailable",
            creditBalance: storeCredits ?? 0,
            job: {
              id: job.id,
              title: job.jobRoleTitle,
              company: job.company,
              location: job.location,
            },
          });
          setIsLoadingPreview(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [job.id, job.jobRoleTitle, job.company, job.location, storeCredits]);

  // Handle user-initiated retry for skill gap check
  const handleRetryPreview = useCallback(async () => {
    setIsRetryingPreview(true);
    try {
      const res = await getTailoringPreview(job.id);
      setPreviewData(res);
      if (res.existingResume?.markdown) {
        setTailoredMarkdown(res.existingResume.markdown);
      }
    } catch (err) {
      console.error("Retry preview error:", err);
    } finally {
      setIsRetryingPreview(false);
    }
  }, [job.id]);

  // Handle escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isFullStudioOpen && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullStudioOpen, isSubmitting, onClose]);

  const handleGenerate = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const activeTemplateId = useResumeStore.getState().selectedTemplateId;
      const initRes = await initiateTailoringRequest(job.id, activeTemplateId);

      if (!initRes.success || !initRes.requestId) {
        const errorMsg = initRes.error || "Failed to start tailoring request. Please check your credit balance or active resume.";
        setSubmissionError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      toast.success("Resume tailoring started in the background!", {
        description: `Aligning skills and tailoring experience for ${job.company}.`,
        duration: 4000,
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("resume-requests-changed"));
      }
      useCreditStore.getState().fetchCredits().catch(() => {});
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate tailoring";
      setSubmissionError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyMarkdown = useCallback(async () => {
    if (!tailoredMarkdown) return;
    try {
      await navigator.clipboard.writeText(tailoredMarkdown);
      setIsCopied(true);
      toast.success("Tailored markdown copied to clipboard!");
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [tailoredMarkdown]);

  const handleDownloadMarkdown = useCallback(() => {
    if (!tailoredMarkdown) return;
    const safeTitle = job.jobRoleTitle.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30);
    downloadMarkdownFile(tailoredMarkdown, `tailored-resume-${safeTitle}.md`);
    toast.success("Downloaded tailored markdown!");
  }, [tailoredMarkdown, job.jobRoleTitle]);

  return (
    <>
      <div
        className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={() => {
          if (!isSubmitting) {
            onClose();
          }
        }}
      >
        <div
          className="relative w-full max-w-2xl bg-bg-card border-[1.5px] border-border-color rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.25)] flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden dark:bg-[#161822] dark:border-[#2B3042]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-color dark:border-[#2B3042] bg-bg-card dark:bg-[#1A1D2A] shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-brand-lime/20 flex items-center justify-center text-brand-dark dark:text-brand-lime shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[1.05rem] font-bold text-text-primary dark:text-white truncate">
                  AI Resume Tailoring
                </h2>
                <div className="flex items-center gap-2 text-xs text-text-muted dark:text-[#94A3B8] truncate">
                  <span className="font-semibold text-text-primary dark:text-white truncate">
                    {job.jobRoleTitle}
                  </span>
                  <span>•</span>
                  <span className="truncate">{job.company}</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tag transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed dark:hover:bg-[#222534] dark:hover:text-white"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-5 overflow-y-auto flex-1 space-y-5">
            {isLoadingPreview ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-brand-dark dark:text-brand-lime" />
                <p className="text-sm font-medium text-text-muted dark:text-[#94A3B8]">
                  Analyzing job description and running skill-gap analysis...
                </p>
              </div>
            ) : !session?.user ? (
              <div className="py-8 text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
                <h3 className="text-base font-bold text-text-primary dark:text-white">Authentication Required</h3>
                <p className="text-sm text-text-muted dark:text-[#94A3B8] max-w-sm mx-auto">
                  Sign in to customize and tailor your resume for this opportunity.
                </p>
                <Link
                  href="/auth"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-brand-dark text-white text-sm font-semibold hover:bg-black transition-colors dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white"
                >
                  Sign In
                </Link>
              </div>
            ) : previewData && !previewData.hasProfile ? (
              <div className="py-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-text-primary dark:text-white">Base Resume Needed</h3>
                  <p className="text-sm text-text-muted dark:text-[#94A3B8] max-w-md mx-auto">
                    To tailor your resume with authentic evidence, please upload your base resume in Manage Job Hunt first.
                  </p>
                </div>
                <Link
                  href="/job-hunt/manage"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand-dark text-white text-sm font-semibold hover:bg-black transition-colors dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white"
                >
                  Go to Manage Job Hunt
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            ) : previewData && !previewData.success && previewData.error === "Job opportunity not found." ? (
              <div className="py-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 mx-auto flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-text-primary dark:text-white">
                    Job Opportunity Not Found
                  </h3>
                  <p className="text-sm text-text-muted dark:text-[#94A3B8] max-w-md mx-auto">
                    This job listing may have expired or been removed.
                  </p>
                </div>
              </div>
            ) : tailoringStage === "completed" ? (
              <div className="space-y-4">
                {/* Completed Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold">
                      Tailored resume generated and saved to your profile for this job.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleCopyMarkdown}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded bg-bg-card border border-border-color hover:bg-bg-tag transition-colors text-text-primary dark:bg-[#1E212D] dark:border-[#2B3042] dark:text-white cursor-pointer"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? "Copied" : "Copy MD"}</span>
                    </button>
                    <button
                      onClick={handleDownloadMarkdown}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded bg-brand-dark text-white hover:bg-black transition-colors dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .md</span>
                    </button>
                  </div>
                </div>

                {/* View Mode Tabs & Studio Launcher */}
                <div className="flex items-center justify-between border-b border-border-color dark:border-[#2B3042] pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab("formatted")}
                      className={`text-xs font-bold px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                        activeTab === "formatted"
                          ? "bg-brand-dark text-white dark:bg-brand-lime dark:text-[#111827]"
                          : "text-text-muted hover:text-text-primary dark:hover:text-white"
                      }`}
                    >
                      Formatted Preview
                    </button>
                    <button
                      onClick={() => setActiveTab("raw")}
                      className={`text-xs font-bold px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                        activeTab === "raw"
                          ? "bg-brand-dark text-white dark:bg-brand-lime dark:text-[#111827]"
                          : "text-text-muted hover:text-text-primary dark:hover:text-white"
                      }`}
                    >
                      Raw Markdown
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsFullStudioOpen(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-dark hover:underline dark:text-brand-lime cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Open in Studio</span>
                    </button>
                    <button
                      onClick={handleGenerate}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-text-primary dark:hover:text-white cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Re-tailor (1 credit)</span>
                    </button>
                  </div>
                </div>

                {/* Viewer Content */}
                {activeTab === "formatted" ? (
                  <div className="p-4 rounded-lg bg-bg-card border border-border-color text-xs leading-relaxed space-y-3 font-body dark:bg-[#1A1D2A] dark:border-[#2B3042] dark:text-[#E2E8F0] max-h-[350px] overflow-y-auto whitespace-pre-wrap">
                    {tailoredMarkdown}
                  </div>
                ) : (
                  <div className="relative">
                    <textarea
                      readOnly
                      value={tailoredMarkdown}
                      rows={14}
                      className="w-full p-3 font-mono text-[0.8rem] bg-bg-input border border-border-input rounded-lg text-text-primary focus:outline-none dark:bg-[#13151D] dark:text-[#E2E8F0] dark:border-[#2B3042]"
                    />
                  </div>
                )}
              </div>
            ) : (
              /* PREVIEW STAGE (Skill-Gap & Tailoring Scope) */
              <div className="space-y-4">
                {/* Existing tailored notice if already present */}
                {previewData?.existingResume && (
                  <div className="p-3 rounded-lg bg-brand-lime/15 border border-brand-lime/30 flex items-center justify-between text-xs dark:bg-brand-lime/10">
                    <div className="flex items-center gap-2 text-text-primary dark:text-white">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>You already generated a tailored resume for this opportunity!</span>
                    </div>
                    <button
                      onClick={() => {
                        if (previewData.existingResume?.markdown) {
                          setTailoredMarkdown(previewData.existingResume.markdown);
                          setTailoringStage("completed");
                        }
                      }}
                      className="px-2.5 py-1 text-xs font-bold rounded bg-brand-dark text-white hover:bg-black transition-colors dark:bg-brand-lime dark:text-[#111827] cursor-pointer"
                    >
                      View Existing
                    </button>
                  </div>
                )}

                {/* Service 1 Branch: Offline Guidance vs Full Results */}
                {previewData?.skillGapAvailable === false ? (
                  /* Skill-Gap Service Unavailable: Graceful non-blocking guidance */
                  <div className="space-y-3.5">
                    <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-start justify-between gap-3 text-amber-900 dark:text-amber-200 dark:bg-amber-500/15">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-amber-900 dark:text-amber-100">
                            Skill-Gap Analysis Temporarily Unavailable
                          </p>
                          <p className="text-xs text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                            The instant skill comparison service could not be reached, but <strong>AI Resume Tailoring remains fully operational</strong>. You can proceed directly to generate your tailored resume below.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleRetryPreview}
                        disabled={isRetryingPreview}
                        title="Retry skill-gap check"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isRetryingPreview ? "animate-spin" : ""}`} />
                        <span>{isRetryingPreview ? "Checking..." : "Retry"}</span>
                      </button>
                    </div>

                    {/* Direct Tailoring Scope Card */}
                    <div className="p-4 rounded-lg bg-bg-card border border-border-color space-y-3 dark:bg-[#1A1D2A] dark:border-[#2B3042]">
                      <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-border-color dark:border-[#2B3042]">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-brand-dark dark:text-brand-lime" />
                          <span className="text-xs font-bold text-text-primary dark:text-white uppercase tracking-wider">
                            Direct AI Tailoring Pipeline
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-lime/20 border border-brand-lime/40 text-brand-dark dark:text-brand-lime text-xs font-bold">
                          <Coins className="w-3.5 h-3.5" />
                          <span>Cost: 1 Credit</span>
                          <span className="text-text-muted dark:text-[#94A3B8] font-normal">
                            ({effectiveCreditBalance} available)
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs text-text-muted dark:text-[#94A3B8]">
                        <p className="flex items-center gap-2 text-text-primary dark:text-white font-medium">
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Dynamic keyword optimization aligned with this job description</span>
                        </p>
                        <p className="flex items-center gap-2 text-text-primary dark:text-white font-medium">
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Grounded strictly in your authentic verified work history</span>
                        </p>
                        <p className="flex items-center gap-2 text-text-primary dark:text-white font-medium">
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Generates clean Typst / Markdown ready for studio editing & PDF export</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Standard Skill-Gap Match Card (When Service 1 Succeeded) */
                  <>
                    {/* Match Score Card */}
                    <div className="p-4 rounded-lg bg-bg-card border border-border-color flex items-center justify-between gap-4 dark:bg-[#1A1D2A] dark:border-[#2B3042]">
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-[#94A3B8]">
                          Skill-Gap & Relevance Match
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-text-primary dark:text-white">
                            {previewData?.matchScore ?? 75}%
                          </span>
                          <span className="text-xs text-text-muted dark:text-[#94A3B8]">Match Confidence</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-lime/20 border border-brand-lime/40 text-brand-dark dark:text-brand-lime text-xs font-bold">
                        <Coins className="w-3.5 h-3.5" />
                        <span>Cost: 1 Credit</span>
                        <span className="text-text-muted dark:text-[#94A3B8] font-normal">
                          ({effectiveCreditBalance} available)
                        </span>
                      </div>
                    </div>

                    {/* Matched Skills */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Matching Strengths ({previewData?.matchedSkills?.length || 0})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {previewData?.matchedSkills && previewData.matchedSkills.length > 0 ? (
                          previewData.matchedSkills.map((s, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
                            >
                              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-text-muted dark:text-[#94A3B8]">
                            General software engineering and problem-solving skills align.
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Target / Missing Keywords from JD */}
                    {previewData?.missingSkills && previewData.missingSkills.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          Keywords to Emphasize ({previewData.missingSkills.length})
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {previewData.missingSkills.map((s, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-amber-500/10 text-amber-700 border border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Submission Error Alert */}
                {submissionError && (
                  <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-150">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold">Could not start tailoring</p>
                      <p>{submissionError}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          {tailoringStage === "preview" && (previewData?.hasProfile ?? true) && (
            <div className="px-5 py-3.5 border-t border-border-color dark:border-[#2B3042] bg-bg-card dark:bg-[#1A1D2A] flex items-center justify-between gap-3 shrink-0">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold rounded-lg border border-border-color hover:bg-bg-tag transition-colors text-text-muted hover:text-text-primary dark:border-[#2B3042] dark:hover:bg-[#222534] dark:hover:text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>

              <button
                onClick={handleGenerate}
                disabled={isSubmitting || effectiveCreditBalance < 1}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg bg-brand-dark text-white hover:bg-black transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>
                  {isSubmitting
                    ? "Starting Generation..."
                    : effectiveCreditBalance < 1
                    ? "Insufficient Credits (1 Required)"
                    : previewData?.skillGapAvailable === false
                    ? "Tailor Resume Anyway (1 Credit)"
                    : "Generate Tailored Resume (1 Credit)"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Full In-App Studio / Resume Viewer Bridge */}
      {isFullStudioOpen && (
        <ResumeModal
          isOpen={isFullStudioOpen}
          jobId={job.id}
          templateId={useResumeStore.getState().selectedTemplateId}
          expectedGenerationId={previewData?.existingResume?.id || null}
          onClose={() => setIsFullStudioOpen(false)}
          initialMarkdown={tailoredMarkdown}
          initialMode="view"
          onSave={async (newMarkdown, newTemplateId, expectedGenId) => {
            const res = await updateTailoredResumeMarkdown(
              job.id,
              newMarkdown,
              newTemplateId,
              expectedGenId
            );
            if (res && !res.success) {
              return res;
            }
            setTailoredMarkdown(newMarkdown);
            return res;
          }}
        />
      )}

    </>
  );
}
