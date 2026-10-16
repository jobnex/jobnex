"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useJobStore } from "@/store/useJobStore";
import { ResumeModal } from "@/components/ResumeModal";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useResumeStore } from "@/store/useResumeStore";
import { downloadMarkdownFile } from "@/lib/resumeApi";
import { normalizeExternalUrl } from "@/lib/job-utils";
import {
  listResumeApplications,
  updateResumeApplicationStage,
  ResumeApplicationItem
} from "@/app/actions/resume-applications";
import { updateTailoredResumeMarkdown } from "@/app/actions/tailored-resume";
import {
  Download, Eye, Clock, Building,
  Search, Filter, Plus, FileText, ChevronDown,
  Check, PenSquare, FileBadge, Loader2, AlertCircle, AlertTriangle, X
} from "lucide-react";
import { JobHuntMobileMenuButton } from "@/components/JobHuntSidebar";
import { ApplicationsSkeletonList } from "@/components/ApplicationCardSkeleton";
import { JobDescriptionPanel } from "@/components/JobDescriptionPanel";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/utils/scrollLock";
import { Job } from "@/types";
import { toast } from "sonner";

// --- Subcomponents ---

interface ApplicationStatusPillProps {
  status: "queued" | "running" | "needs_review";
  className?: string;
}

function ApplicationStatusPill({ status, className = "" }: ApplicationStatusPillProps) {
  if (status === "needs_review") {
    return (
      <div
        className={`inline-flex items-center gap-1.5 sm:gap-2 min-h-[1.65rem] py-0.5 px-2.5 sm:px-3 rounded-full select-none border-0 transition-all duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] animate-pill-switch bg-amber-500/[0.09] dark:bg-amber-500/[0.14] text-amber-800 dark:text-amber-300 text-[0.72rem] sm:text-xs font-semibold whitespace-nowrap shrink-0 ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="w-[15px] h-[15px] sm:w-[17px] sm:h-[17px] rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
          <svg
            className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <span>Needs review</span>
      </div>
    );
  }

  if (status === "running") {
    return (
      <div
        className={`inline-flex items-center gap-1.5 sm:gap-2 min-h-[1.65rem] py-0.5 px-2.5 sm:px-3 rounded-full select-none border-0 transition-all duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] animate-pill-switch bg-cyan-500/[0.09] dark:bg-cyan-500/[0.14] text-cyan-800 dark:text-cyan-300 text-[0.72rem] sm:text-xs font-semibold whitespace-nowrap shrink-0 ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="w-[15px] h-[15px] sm:w-[17px] sm:h-[17px] rounded-full bg-cyan-500 text-white flex items-center justify-center shrink-0">
          <Loader2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin text-white" />
        </div>
        <span>Tailoring</span>
      </div>
    );
  }

  if (status === "queued") {
    return (
      <div
        className={`inline-flex items-center gap-1.5 sm:gap-2 min-h-[1.65rem] py-0.5 px-2.5 sm:px-3 rounded-full select-none border-0 transition-all duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] animate-pill-switch bg-amber-500/[0.08] dark:bg-amber-500/[0.12] text-amber-800 dark:text-amber-300 text-[0.72rem] sm:text-xs font-semibold whitespace-nowrap shrink-0 ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="w-[15px] h-[15px] sm:w-[17px] sm:h-[17px] rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        </div>
        <span>Queued</span>
      </div>
    );
  }

  return null;
}

const STAGES = ["Applied", "Interview", "Offer"];

function ProgressTracker({
  currentStage,
  onUpdate
}: {
  currentStage: number;
  onUpdate: (stage: number) => void;
}) {
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
              type="button"
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
                {isActive && (
                  <Check
                    className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white dark:text-[#111827] animate-in zoom-in-75 duration-150"
                    strokeWidth={3.5}
                  />
                )}
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
  status: "queued" | "running" | "completed" | "needs_review" | "failed";
  hasDraft: boolean;
  onView: () => void;
  onEdit: () => void;
  onDownload: () => void;
}

function ResumeDropdown({
  status,
  hasDraft,
  onView,
  onEdit,
  onDownload
}: ResumeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close and unpin the dropdown
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIsPinned(false);
  }, []);

  // Ephemeral hover preview: opens on enter, closes on leave unless pinned
  const handleMouseEnter = useCallback(() => {
    if (!isPinned) {
      setIsOpen(true);
    }
  }, [isPinned]);

  const handleMouseLeave = useCallback(() => {
    if (!isPinned) {
      setIsOpen(false);
    }
  }, [isPinned]);

  // Click handler: pins open if not already pinned, toggles closed if already pinned
  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPinned) {
      setIsPinned(false);
      setIsOpen(false);
    } else {
      setIsPinned(true);
      setIsOpen(true);
    }
  };

  // Outside pointer-down and Escape dismissal when dropdown is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleClose]);

  // Still generating in the background
  if (status === "queued" || status === "running") {
    return (
      <div
        title="Resume tailoring is currently processing on GCP Cloud Run"
        className="inline-flex items-center justify-center gap-[0.35rem] px-3.5 py-[0.45rem] rounded-sm bg-bg-tag border border-border-subtle text-text-muted text-[0.85rem] font-semibold select-none dark:bg-[#1C1E24] dark:border-[#2B3042]"
      >
        <Loader2 className="w-[14px] h-[14px] animate-spin text-brand-dark dark:text-brand-lime" />
        <span className="text-xs">Tailoring...</span>
      </div>
    );
  }

  // Generation failed without a usable draft
  if (status === "failed" && !hasDraft) {
    return (
      <div
        title="Resume generation failed. Credit was automatically refunded."
        className="inline-flex items-center justify-center gap-[0.35rem] px-3 py-[0.45rem] rounded-sm bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[0.8rem] font-semibold select-none"
      >
        <AlertCircle className="w-[13px] h-[13px]" />
        <span>Failed</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-state={isOpen ? "open" : "closed"}
      data-pinned={isPinned ? "true" : "false"}
      className="relative z-10"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggleClick}
        className={`inline-flex items-center justify-center gap-[0.35rem] px-3.5 py-[0.45rem] rounded-sm border-[1.5px] font-heading font-semibold text-[0.85rem] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer active:scale-[0.98] ${
          isOpen
            ? "border-border-color bg-white text-[#111827] dark:bg-white dark:text-[#111827] dark:border-black shadow-xs"
            : "border-transparent bg-brand-lime text-[#111827] hover:border-border-color hover:bg-white hover:text-[#111827] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black"
        }`}
        aria-expanded={isOpen}
        aria-label="Tailored resume options"
      >
        <FileText className="w-[14px] h-[14px]" strokeWidth={2.5} />
        <span>Resume</span>
        {status === "needs_review" && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400 shrink-0" title="Review suggested" />
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} strokeWidth={2.5} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full pt-1 z-50">
          <div className="w-[14rem] bg-bg-card border-[1.5px] border-border-color rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.1)] py-2 animate-in fade-in zoom-in-95 duration-200 dark:border-[#2B3042] dark:shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
            <button
              type="button"
              onClick={() => { handleClose(); onView(); }}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-bg-tag transition-colors cursor-pointer dark:hover:bg-[#1C1E24]"
            >
              <div className="w-7 h-7 rounded-md bg-[rgba(185,255,102,0.18)] dark:bg-[rgba(172,238,95,0.12)] flex items-center justify-center shrink-0">
                <Eye className="w-[14px] h-[14px] text-[#064E3B] dark:text-[#ACEE5F]" strokeWidth={2.5} />
              </div>
              <span className="text-[0.88rem] font-semibold text-text-primary dark:text-white">
                {status === "needs_review" ? "Review Draft" : "View Resume"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { handleClose(); onDownload(); }}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-bg-tag transition-colors cursor-pointer dark:hover:bg-[#1C1E24]"
            >
              <div className="w-7 h-7 rounded-md bg-[rgba(185,255,102,0.18)] dark:bg-[rgba(172,238,95,0.12)] flex items-center justify-center shrink-0">
                <Download className="w-[14px] h-[14px] text-[#064E3B] dark:text-[#ACEE5F]" strokeWidth={2.5} />
              </div>
              <span className="text-[0.88rem] font-semibold text-text-primary dark:text-white">Download Resume</span>
            </button>
            <div className="h-[1px] bg-border-subtle my-2 dark:bg-[#2B3042]" />
            <button
              type="button"
              onClick={() => { handleClose(); onEdit(); }}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-bg-tag transition-colors cursor-pointer dark:hover:bg-[#1C1E24]"
            >
              <div className="w-7 h-7 rounded-md bg-[rgba(185,255,102,0.18)] dark:bg-[rgba(172,238,95,0.12)] flex items-center justify-center shrink-0">
                <PenSquare className="w-[14px] h-[14px] text-[#064E3B] dark:text-[#ACEE5F]" strokeWidth={2.5} />
              </div>
              <span className="text-[0.88rem] font-semibold text-text-primary dark:text-white">Edit Resume</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export default function ApplicationsPage() {
  const openJd = useJobStore((s) => s.openJd);
  const closeJd = useJobStore((s) => s.closeJd);
  const [selectedJdJob, setSelectedJdJob] = useState<Job | null>(null);
  const scrollPosRef = useRef<number>(0);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Authoritative database applications state
  const [applications, setApplications] = useState<ResumeApplicationItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Application tracker states: Map<jobId, stageIndex> (-1 means empty/not applied yet)
  const [trackerState, setTrackerState] = useState<Record<string, number>>({});

  // Tailored Resume Modal State (decoupled and locked per application)
  const [resumeModalState, setResumeModalState] = useState<{
    isOpen: boolean;
    jobId: string;
    companyName: string;
    mode: "view" | "edit";
    markdown: string;
    templateId: string;
    expectedGenerationId?: string | null;
    readOnly?: boolean;
    reviewReason?: string | null;
  }>({
    isOpen: false,
    jobId: "",
    companyName: "",
    mode: "view",
    markdown: "",
    templateId: "mit-capd",
    expectedGenerationId: null,
    readOnly: false,
    reviewReason: null,
  });


  // Authoritative fetch from Neon PostgreSQL
  const loadApplications = useCallback(async () => {
    try {
      const res = await listResumeApplications();
      if (res.success && res.applications) {
        setApplications(res.applications);
        const newTracker: Record<string, number> = {};
        for (const app of res.applications) {
          newTracker[app.jobId] = app.applicationStage;
        }
        setTrackerState(newTracker);
      }
    } catch (err) {
      console.error("Failed to load resume applications:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial mount & reactive update listeners
  useEffect(() => {
    loadApplications();

    const handleSync = () => {
      loadApplications();
    };

    window.addEventListener("resume-requests-changed", handleSync);
    window.addEventListener("focus", handleSync);

    return () => {
      window.removeEventListener("resume-requests-changed", handleSync);
      window.removeEventListener("focus", handleSync);
    };
  }, [loadApplications]);

  // Active generation poller: checks every 4s only while active generation requests exist
  useEffect(() => {
    const hasActiveRequests = applications.some(
      (app) => app.requestStatus === "queued" || app.requestStatus === "running"
    );
    if (!hasActiveRequests) return;

    const timer = setInterval(() => {
      loadApplications();
    }, 4000);

    return () => clearInterval(timer);
  }, [applications, loadApplications]);

  // Client-side search filtering over real database applications
  const filteredApplications = useMemo(() => {
    if (!debouncedSearchQuery) return applications;
    const q = debouncedSearchQuery.toLowerCase();
    return applications.filter(
      (app) =>
        app.jobRoleTitle.toLowerCase().includes(q) ||
        app.companyName.toLowerCase().includes(q)
    );
  }, [applications, debouncedSearchQuery]);

  const formatAppDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return (
        date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
        " • " +
        date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      );
    } catch {
      return isoString;
    }
  };

  const handleUpdateStage = async (jobId: string, stageIndex: number) => {
    const current = trackerState[jobId] ?? -1;
    // If clicking a stage that is currently active, turn off this stage and all subsequent stages
    const targetStage = current >= stageIndex ? stageIndex - 1 : stageIndex;

    // Optimistic UI state update
    setTrackerState((prev) => ({ ...prev, [jobId]: targetStage }));

    try {
      const res = await updateResumeApplicationStage(jobId, targetStage);
      if (res.success) {
        if (targetStage >= 0) {
          toast.success(`Application marked as ${STAGES[targetStage]}`);
        } else {
          toast.info("Application stage cleared");
        }
      } else {
        toast.error("Failed to update application stage in database");
        setTrackerState((prev) => ({ ...prev, [jobId]: current }));
      }
    } catch {
      toast.error("Error updating application stage");
      setTrackerState((prev) => ({ ...prev, [jobId]: current }));
    }
  };

  // Reset any lingering global JD state when entering or leaving the applications section
  useEffect(() => {
    closeJd();
    return () => {
      closeJd();
    };
  }, [closeJd]);

  // Lock body scroll on mobile / tablet when JD is open full-screen
  useEffect(() => {
    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
    if (selectedJdJob && isMobileOrTablet) {
      lockBodyScroll();
      return () => {
        unlockBodyScroll();
      };
    }
  }, [selectedJdJob]);

  // Ensure window is smoothly scrolled to top whenever a JD opens on desktop
  useEffect(() => {
    if (selectedJdJob && typeof window !== "undefined" && window.innerWidth >= 1024) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [selectedJdJob]);

  const handleSelectJob = useCallback((job: Job) => {
    scrollPosRef.current = typeof window !== "undefined" ? window.scrollY : 0;
    setSelectedJdJob(job);
    openJd(job);
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [openJd]);

  const handleCloseJd = useCallback(() => {
    const prevY = scrollPosRef.current;
    setSelectedJdJob(null);
    closeJd();
    if (typeof window !== "undefined" && prevY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: prevY, behavior: "smooth" });
      });
    }
  }, [closeJd]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (selectedJdJob) {
      scrollPosRef.current = 0;
      setSelectedJdJob(null);
      closeJd();
    }
  }, [selectedJdJob, closeJd]);

  const handleDownloadDraft = (app: ResumeApplicationItem) => {
    if (!app.markdown) return;
    const safeTitle = app.companyName.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30);
    downloadMarkdownFile(app.markdown, `${safeTitle}-tailored-resume.md`);
    toast.info(`Downloaded tailored resume for ${app.companyName}`);
  };

  return (
    <>
      <div className={`flex flex-col ${selectedJdJob ? "gap-0" : "gap-6"} h-full w-full max-w-full transition-[gap] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`}>

        <div className={`flex flex-col ${selectedJdJob ? "gap-0" : "gap-6"} transition-[gap] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`}>
          {/* Title Row: Smoothly slides/scrolls UP and collapses when JD panel opens to reclaim full vertical space */}
          <div
            className={`transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden will-change-[transform,opacity,max-height,margin] ${
              selectedJdJob
                ? "-translate-y-full opacity-0 max-h-0 pointer-events-none mb-0"
                : "translate-y-0 opacity-100 max-h-28 mb-0"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-3 pt-1.5 pb-1">
                <h1 className="font-heading text-2xl sm:text-3xl font-semibold leading-tight text-text-primary dark:text-white">
                  My Applications
                </h1>
                <JobHuntMobileMenuButton />
              </div>
              <p className="text-text-muted text-sm sm:text-base mt-1">
                Track your pipeline and manage active submissions.
              </p>
            </div>
          </div>

          {/* Search & Filter Bar: Removed when JD panel is open */}
          {!selectedJdJob && (
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
              {/* Ergonomically Constrained Search Bar */}
              <div className="relative w-full sm:max-w-md lg:max-w-lg group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-text-subtle transition-colors group-focus-within:text-text-primary dark:text-[#A1A1AA]" />
                <input
                  type="text"
                  className="w-full pl-[2.75rem] pr-10 py-[0.7rem] bg-bg-input border border-border-input rounded-lg focus:border-text-primary focus:bg-white outline-none text-sm sm:text-base font-medium text-text-primary placeholder:text-text-subtle transition-all duration-200 dark:bg-[#151720] dark:border-[#2B3042] dark:focus:border-[#ACEE5F] dark:focus:shadow-[0_0_0_1px_#ACEE5F,0_2px_8px_rgba(0,0,0,0.3)] dark:focus:bg-[#1A1C26] dark:text-white"
                  placeholder="Search applications..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      if (selectedJdJob) {
                        scrollPosRef.current = 0;
                        setSelectedJdJob(null);
                        closeJd();
                      }
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-bg-tag dark:hover:text-white dark:hover:bg-[#2B3042] transition-colors cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Action Buttons in Immediate Field of View */}
              <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
                 <button aria-label="Filter" className="p-[0.65rem] rounded-md border border-border-input bg-bg-card text-text-muted hover:text-text-primary transition-colors cursor-pointer dark:bg-[#151720] dark:border-[#2B3042]">
                   <Filter className="w-5 h-5" />
                 </button>
                 <button
                   onClick={() => {
                     toast.info("To add an application, search for a job and click 'Tailor My Resume' to start tailoring.");
                   }}
                   className="inline-flex items-center gap-2 px-4 py-[0.65rem] rounded-md font-bold text-[0.88rem] bg-brand-dark text-white shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-brand-lime hover:text-[#111827] cursor-pointer active:translate-y-[1px] dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white dark:hover:text-[#111827] whitespace-nowrap"
                 >
                   <Plus className="w-[16px] h-[16px]" strokeWidth={2.5} />
                   <span>Add Application</span>
                 </button>
              </div>
            </div>
          )}
        </div>

        <div className={`flex-1 overflow-hidden -mx-2 -mt-2 p-2 ${selectedJdJob ? "pb-2" : "pb-10"}`}>
          {selectedJdJob ? (
            <div className="max-lg:fixed max-lg:inset-0 max-lg:z-[150] max-lg:w-full max-lg:h-[100dvh] max-lg:bg-bg-page dark:max-lg:bg-[#111216] lg:w-full lg:h-[calc(100vh-6.5rem)] min-h-[500px] overscroll-contain animate-in fade-in duration-200">
              <JobDescriptionPanel
                job={selectedJdJob}
                onClose={handleCloseJd}
                isMobilePage={true}
              />
            </div>
          ) : (
            <>
              {/* Skeleton loading state */}
              {isLoading && <ApplicationsSkeletonList count={4} />}

              {/* Empty state */}
              {!isLoading && filteredApplications.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 py-32 text-center bg-bg-card border border-border-subtle rounded-[10px] border-dashed dark:border-[#2B3042]">
                  <div className="w-16 h-16 bg-bg-tag rounded-full flex items-center justify-center mb-5 text-text-subtle dark:bg-[#1C1E24]">
                    <FileBadge className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-text-primary dark:text-white mb-2">No Applications Found</h3>
                  <p className="text-text-muted max-w-sm">
                    {searchQuery
                      ? "No applications match your search query."
                      : "You haven't requested any tailored resumes yet. Explore the curated jobs tab and click 'Tailor My Resume'."}
                  </p>
                </div>
              ) : null}

              {/* Applications cards list */}
              {!isLoading && filteredApplications.length > 0 && (
                <div className="flex flex-col gap-4 pb-10">
            {filteredApplications.map((app) => {
              const currentStage = trackerState[app.jobId] ?? -1;
              const applyUrl = normalizeExternalUrl(app.externalApplyUrl);
              const isQueued = app.requestStatus === "queued";
              const isRunning = app.requestStatus === "running";
              const isReview = app.requestStatus === "needs_review";

              return (
                <div
                  key={app.jobId}
                  className="relative hover:z-20 has-[[data-state=open]]:z-30 grid grid-cols-1 lg:grid-cols-[1fr_auto] xl:grid-cols-[1fr_auto_auto] items-center p-3.5 sm:p-4 lg:p-[1.15rem_1.4rem] xl:p-[1.25rem_1.5rem] bg-bg-card border-[1.5px] border-border-subtle rounded-[10px] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#9CA3AF] dark:border-[#2B3042] dark:hover:border-[#6B7280] gap-3 lg:gap-4 xl:gap-6"
                >

                  {/* Left Zone: Details */}
                  <div className="flex flex-col justify-center min-h-[5.1rem] min-w-0 pr-2 col-span-1">
                    <div className="flex items-center gap-2.5 text-[0.74rem] font-bold text-text-subtle uppercase tracking-wider mb-[0.45rem] dark:text-[#9CA3AF] flex-nowrap whitespace-nowrap min-w-0">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="whitespace-nowrap">{formatAppDate(app.requestedAt)}</span>
                      </div>
                      {isQueued && <ApplicationStatusPill status="queued" />}
                      {isRunning && <ApplicationStatusPill status="running" />}
                      {isReview && <ApplicationStatusPill status="needs_review" />}
                    </div>

                    <div className="min-h-[2.85rem] flex flex-col justify-start">
                      <button
                        type="button"
                        onClick={() => handleSelectJob(app.job)}
                        className="text-left font-heading text-[1.2rem] font-semibold text-text-primary leading-[1.26] line-clamp-2 hover:underline transition-colors w-fit dark:text-white cursor-pointer"
                      >
                        {app.jobRoleTitle}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 text-[0.88rem] font-semibold text-text-muted mt-0.5">
                      <Building className="w-3.5 h-3.5 shrink-0 text-text-subtle dark:text-[#9CA3AF]" />
                      <span>{app.companyName}</span>
                    </div>
                  </div>

                  {/* Middle Zone: Tracker */}
                  <div className="flex items-center justify-center py-2 lg:py-1 xl:py-0 shrink-0 mx-auto lg:col-span-2 xl:col-span-1 lg:row-start-2 xl:row-start-1 xl:col-start-2">
                    <div className="bg-bg-input px-3 sm:px-4 xl:px-5 py-[0.55rem] sm:py-[0.65rem] rounded-full border border-border-subtle dark:bg-[#222534] dark:border-[#2F3446] flex items-center justify-center shadow-none max-w-full overflow-x-auto">
                      <ProgressTracker
                        currentStage={currentStage}
                        onUpdate={(stage) => handleUpdateStage(app.jobId, stage)}
                      />
                    </div>
                  </div>

                  {/* Right Zone: Actions */}
                  <div className="flex items-center justify-between lg:justify-end gap-3 sm:gap-4 shrink-0 pt-3 lg:pt-0 border-t border-border-subtle lg:border-t-0 w-full lg:w-auto whitespace-nowrap min-w-fit lg:col-start-2 lg:row-start-1 xl:col-start-3 xl:row-start-1">
                    {applyUrl ? (
                      <a
                        href={applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-[0.35rem] font-heading text-[0.85rem] font-semibold text-text-primary cursor-pointer transition-all duration-150 hover:underline hover:underline-offset-4 group/link dark:text-white whitespace-nowrap shrink-0"
                        aria-label={`Apply for ${app.jobRoleTitle} at ${app.companyName} (opens in a new tab)`}
                      >
                        <span>Apply Now</span>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-[13px] h-[13px] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 shrink-0"
                        >
                          <line x1="7" y1="17" x2="17" y2="7"></line>
                          <polyline points="7 7 17 7 17 17"></polyline>
                        </svg>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelectJob(app.job)}
                        className="inline-flex items-center gap-[0.35rem] font-heading text-[0.85rem] font-semibold text-text-primary cursor-pointer transition-all duration-150 hover:underline hover:underline-offset-4 group/link dark:text-white whitespace-nowrap shrink-0"
                      >
                        <span>Apply Now</span>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-[13px] h-[13px] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 shrink-0"
                        >
                          <line x1="7" y1="17" x2="17" y2="7"></line>
                          <polyline points="7 7 17 7 17 17"></polyline>
                        </svg>
                      </button>
                    )}

                    <ResumeDropdown
                      status={app.requestStatus}
                      hasDraft={app.hasDraft}
                      onView={() => {
                        if (app.markdown) {
                          setResumeModalState({
                            isOpen: true,
                            jobId: app.jobId,
                            expectedGenerationId: app.id,
                            readOnly: false,
                            companyName: app.companyName,
                            mode: "view",
                            markdown: app.markdown,
                            templateId: app.templateId || "mit-capd",
                            reviewReason: app.reviewReason,
                          });
                        }
                      }}
                      onEdit={() => {
                        if (app.markdown) {
                          setResumeModalState({
                            isOpen: true,
                            jobId: app.jobId,
                            expectedGenerationId: app.id,
                            readOnly: false,
                            companyName: app.companyName,
                            mode: "edit",
                            markdown: app.markdown,
                            templateId: app.templateId || "mit-capd",
                            reviewReason: app.reviewReason,
                          });
                        }
                      }}
                      onDownload={() => handleDownloadDraft(app)}
                    />
                  </div>

                </div>
              );
            })}
          </div>
        )}
            </>
          )}
        </div>
      </div>

      {/* Resume Modal configured for this specific application's tailored draft */}
      <ResumeModal
        isOpen={resumeModalState.isOpen}
        jobId={resumeModalState.jobId}
        expectedGenerationId={resumeModalState.expectedGenerationId}
        readOnly={resumeModalState.readOnly}
        initialMode={resumeModalState.mode}
        initialMarkdown={resumeModalState.markdown}
        templateId={resumeModalState.templateId}
        reviewReason={resumeModalState.reviewReason}
        onSave={async (newMarkdown, newTemplateId, expectedGenId) => {
          if (resumeModalState.jobId) {
            const res = await updateTailoredResumeMarkdown(
              resumeModalState.jobId,
              newMarkdown,
              newTemplateId,
              expectedGenId
            );
            if (!res.success) {
              return res;
            }
            if (newTemplateId) {
              setResumeModalState((prev) => ({ ...prev, templateId: newTemplateId }));
            }
            // Refresh applications list to show updated draft
            await loadApplications();
            return res;
          }
        }}
        onClose={() => setResumeModalState((prev) => ({ ...prev, isOpen: false }))}
      />

    </>
  );
}
