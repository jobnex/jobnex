"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Job } from "@/types";
import { useJobStore } from "@/store/useJobStore";
import { 
  X, Bookmark, Sparkles, MapPin, Building2, 
  Clock, Zap, ArrowLeft, Share2
} from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { useRouter, usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { formatJobDescriptionToMarkdown } from "@/lib/markdown-utils";
import { normalizeExternalUrl, getWorkArrangement } from "@/lib/job-utils";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/utils/scrollLock";

interface JobDescriptionPanelProps {
  job: Job;
  onClose: () => void;
  isMobilePage?: boolean;
}

const MARKDOWN_PLUGINS = [remarkGfm, remarkBreaks];

export function JobDescriptionPanel({ job, onClose }: JobDescriptionPanelProps) {
  const openModal = useJobStore((s) => s.openModal);
  const toggleSavedJob = useJobStore((s) => s.toggleSavedJob);
  const isSaved = useJobStore((s) => !!s.savedJobIdsMap[job.id]);
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const pathname = usePathname();
  
  // Smart header state
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [prevJobId, setPrevJobId] = useState(job.id);
  if (prevJobId !== job.id) {
    setPrevJobId(job.id);
    setIsHeaderVisible(true);
  }

  const lastScrollY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasPushedHistoryRef = useRef(false);
  const currentJobIdRef = useRef(job.id);

  // Lock body scroll on mobile / tablet when JD panel is open full-screen
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 1024;
    if (!isMobile) return;

    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, []);

  // Reset scroll position when opening a new job
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    lastScrollY.current = 0;
  }, [job.id]);

  // Total scroll isolation: prevents wheel gestures inside JD panel from chaining to the outer page
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isScrollable = scrollHeight > clientHeight;

      // Case A: Content does not overflow (short description).
      // Trap wheel events so outer webpage NEVER scrolls while mouse is inside JD panel.
      if (!isScrollable) {
        e.preventDefault();
        return;
      }

      const deltaY = e.deltaY;
      const isAtTop = scrollTop <= 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

      // Case B: Boundary attempts (scrolling up at top or scrolling down at bottom).
      // Prevent default to completely contain scroll within the panel without chaining to window.
      if ((isAtTop && deltaY < 0) || (isAtBottom && deltaY > 0)) {
        e.preventDefault();
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [job.id]);

  const handleBack = useCallback(() => {
    if (hasPushedHistoryRef.current) {
      hasPushedHistoryRef.current = false;
      window.history.back();
    }
    onClose();
  }, [onClose]);

  // Clean keyboard accessibility hook
  useEscapeKey(handleBack);

  // Performance-optimized scroll handler: only triggers state update when visibility changes
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 60) {
      setIsHeaderVisible((prev) => (prev ? false : prev));
    } else if (currentScrollY < lastScrollY.current) {
      setIsHeaderVisible((prev) => (!prev ? true : prev));
    }
    
    lastScrollY.current = currentScrollY;
  };

  const workArrangement = useMemo(() => getWorkArrangement(job), [job]);
  const applyUrl = useMemo(() => normalizeExternalUrl(job.externalApplyUrl), [job.externalApplyUrl]);
  const formattedMarkdown = useMemo(
    () => formatJobDescriptionToMarkdown(job.jobDescription || job.descriptionPlain || ""),
    [job.jobDescription, job.descriptionPlain]
  );

  const formattedDate = useMemo(() => {
    if (!job.postedAt) return "Recently";
    const date = new Date(job.postedAt);
    if (isNaN(date.getTime())) return "Recently";
    return `${date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }, [job.postedAt]);

  // Mobile browser history & back gesture integration
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 1024;
    if (!isMobile) return;

    if (!hasPushedHistoryRef.current) {
      window.history.pushState({ jdOpen: true, jobId: job.id }, "", window.location.href);
      hasPushedHistoryRef.current = true;
      currentJobIdRef.current = job.id;
    } else if (currentJobIdRef.current !== job.id) {
      window.history.replaceState({ jdOpen: true, jobId: job.id }, "", window.location.href);
      currentJobIdRef.current = job.id;
    }

    const handlePopState = () => {
      if (!hasPushedHistoryRef.current) return;
      hasPushedHistoryRef.current = false;
      onClose();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      // NOTE: Do NOT call window.history.back() here in cleanup!
      // Cleanup runs during Strict Mode double-invocations and component teardown.
      // Calling history.back() here dispatches asynchronous popstate tasks that prematurely kill the panel.
    };
  }, [job.id, onClose]);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: `${job.jobRoleTitle} at ${job.company}`,
      text: `Check out this ${job.jobRoleTitle} position at ${job.company}!`,
      url: typeof window !== "undefined" ? window.location.href : "",
    };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareData.url);
        toast.success("Job link copied to clipboard!");
      } catch {
        toast.error("Unable to copy link");
      }
    }
  }, [job.jobRoleTitle, job.company]);

  return (
    <div 
      className="relative flex flex-col bg-bg-card max-lg:bg-bg-page dark:max-lg:bg-[#111216] max-lg:border-0 max-lg:rounded-none max-lg:shadow-none lg:border-[1.5px] lg:border-border-color lg:rounded-card overflow-hidden overscroll-contain transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] h-full lg:max-h-[calc(100vh-6.5rem)] dark:border-[#31364A]"
      role="region"
      aria-label={`Job description for ${job.jobRoleTitle} at ${job.company}`}
    >
      {/* Mobile Top Navigation App Bar: Native Screen Experience */}
      <div className="lg:hidden shrink-0 sticky top-0 z-30 bg-[#F8F9FA]/95 dark:bg-[#111216]/95 backdrop-blur-md border-b border-border-subtle dark:border-[#2B3042] px-4 pt-[max(0.75rem,env(safe-area-inset-top,0.75rem))] pb-3 flex items-center justify-between gap-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.3)]">
        {/* Left: Prominent Back Button */}
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 -ml-1.5 px-2.5 py-1.5 rounded-full text-text-primary dark:text-white hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all duration-150 cursor-pointer select-none"
          aria-label="Back to job list"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={2.4} />
          <span className="font-heading text-sm font-bold tracking-tight">Back</span>
        </button>

        {/* Center: Truncated company name */}
        <div className="flex-1 min-w-0 text-center px-2">
          <p className="font-heading text-xs font-semibold text-text-muted dark:text-[#9CA3AF] truncate">
            {job.company}
          </p>
        </div>

        {/* Right: Share + Bookmark */}
        <div className="flex items-center gap-1 shrink-0 -mr-1">
          <button
            type="button"
            onClick={handleShare}
            className="w-9 h-9 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary dark:text-[#9CA3AF] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="Share job"
            aria-label="Share job link"
          >
            <Share2 className="w-4 h-4" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => toggleSavedJob(job.id)}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 ${
              isSaved ? "text-text-primary dark:text-white" : "text-text-muted dark:text-[#9CA3AF]"
            }`}
            title={isSaved ? "Remove from saved" : "Save job"}
            aria-label={isSaved ? "Remove from saved" : "Save job"}
          >
            <Bookmark className="w-4 h-4" fill={isSaved ? "currentColor" : "none"} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto flex flex-col relative overscroll-contain touch-pan-y"
        onScroll={handleScroll}
      >
        {/* Desktop Smart Sticky Title Header */}
        <div 
          className={`hidden lg:block sticky top-0 z-10 bg-[#F8F9FB]/95 dark:bg-[#151720]/95 backdrop-blur-md px-[var(--space-card-p)] pt-[var(--space-card-p-y)] pb-[var(--space-xs)] border-b border-border-subtle dark:border-[#2B3042] shadow-[0_4px_12px_-2px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_14px_-2px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isHeaderVisible ? "translate-y-0" : "-translate-y-full"
          }`}
        >
          <div className="flex items-start justify-between gap-4 mb-2">
            <h2 className="font-heading text-xl sm:text-2xl font-semibold text-text-primary leading-tight dark:text-white">
              {job.jobRoleTitle}
            </h2>

            {/* Desktop Save & Close Actions */}
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              <button
                type="button"
                onClick={() => toggleSavedJob(job.id)}
                className={`w-8 h-8 rounded-md hover:rounded-full flex items-center justify-center transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer hover:bg-bg-tag-hover dark:hover:bg-[#2B3042] ${
                  isSaved ? "text-text-primary dark:text-white" : "text-text-muted hover:text-text-primary dark:text-[#A1A1AA] dark:hover:text-white"
                }`}
                title={isSaved ? "Remove from saved" : "Save job"}
                aria-label={isSaved ? "Remove from saved" : "Save job"}
              >
                <Bookmark className="w-4 h-4" fill={isSaved ? "currentColor" : "none"} />
              </button>

              <button
                type="button"
                onClick={handleBack}
                className="w-8 h-8 rounded-md hover:rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-tag-hover dark:text-[#A1A1AA] dark:hover:text-white dark:hover:bg-[#2B3042] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer"
                title="Close panel"
                aria-label="Close job details panel"
              >
                <X className="w-4 h-4" strokeWidth={2.2} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-1.5 font-bold text-text-primary dark:text-[#E5E7EB]">
              <Building2 className="w-4 h-4 text-text-subtle shrink-0 dark:text-[#9CA3AF]" />
              <span>{job.company}</span>
            </div>

            <div className="flex items-center gap-1.5 text-text-muted font-medium text-xs sm:text-sm dark:text-[#9CA3AF]">
              <MapPin className="w-3.5 h-3.5 text-text-subtle shrink-0 dark:text-[#9CA3AF]" />
              <span>{job.location}</span>
            </div>

            <div className="flex items-center gap-1.5 text-text-subtle font-medium text-xs dark:text-[#9CA3AF]">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Posted {formattedDate}</span>
            </div>
          </div>

          {/* Desktop Action Buttons Row */}
          <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-4 pt-4 flex-wrap">
            {applyUrl ? (
              <a
                href={applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group/link inline-flex items-center gap-[0.35rem] font-heading text-xs sm:text-sm font-semibold text-text-primary cursor-pointer transition-all duration-150 hover:underline hover:underline-offset-4 dark:text-white"
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
                className="group/link inline-flex items-center gap-[0.35rem] font-heading text-xs sm:text-sm font-semibold text-text-primary cursor-pointer transition-all duration-150 hover:underline hover:underline-offset-4 dark:text-white"
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!session?.user) {
                  router.push(`/auth?callbackUrl=${encodeURIComponent(pathname)}`);
                  return;
                }
                useJobStore.getState().openTailorModal(job);
              }}
              className="inline-flex items-center justify-center gap-[0.35rem] p-[0.38rem_0.85rem] rounded-sm border-[1.5px] border-transparent bg-brand-lime text-[#111827] font-heading text-xs sm:text-sm font-semibold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black"
            >
              <Sparkles className="w-[13px] h-[13px]" />
              <span>Tailor Resume</span>
            </button>
          </div>
        </div>

        {/* Mobile Header Hero Section (Inside Scroll Body) */}
        <div className="lg:hidden px-4 pt-5 pb-4 border-b border-border-subtle dark:border-[#2B3042]">
          <h1 className="font-heading text-2xl font-bold text-text-primary leading-tight dark:text-white mb-2.5">
            {job.jobRoleTitle}
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-1.5 font-bold text-text-primary dark:text-[#E5E7EB]">
              <Building2 className="w-4 h-4 text-text-subtle shrink-0 dark:text-[#9CA3AF]" />
              <span>{job.company}</span>
            </div>

            <div className="flex items-center gap-1.5 text-text-muted font-medium text-xs dark:text-[#9CA3AF]">
              <MapPin className="w-3.5 h-3.5 text-text-subtle shrink-0 dark:text-[#9CA3AF]" />
              <span>{job.location}</span>
            </div>

            <div className="flex items-center gap-1.5 text-text-subtle font-medium text-xs dark:text-[#9CA3AF]">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Posted {formattedDate}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
            {job.type && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-bg-tag text-text-muted dark:bg-[#1E212D]">
                {job.type}
              </span>
            )}
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-[rgba(185,255,102,0.18)] text-[#064E3B] dark:bg-[rgba(172,238,95,0.12)] dark:text-[#ACEE5F]">
              {job.salary || "Competitive Compensation"}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-bg-tag text-text-muted dark:bg-[#1E212D] flex items-center gap-1">
              <Zap className="w-3 h-3 text-brand-lime" />
              {workArrangement}
            </span>
          </div>
        </div>

        <div className="px-[var(--space-card-p)] max-lg:px-4 py-[var(--space-card-p-y)] max-lg:py-4 space-y-[var(--space-m)] max-lg:pb-16">
          {/* Quick Badges (Desktop only) */}
          <div className="hidden lg:flex flex-wrap items-center gap-[0.35rem]">
            {job.type && (
              <span className="fluid-card-badge px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted dark:bg-[#1E212D]">
                {job.type}
              </span>
            )}
            <span className="fluid-card-badge px-[0.5rem] py-[0.18rem] rounded-xs font-bold bg-[rgba(185,255,102,0.18)] text-[#064E3B] dark:bg-[rgba(172,238,95,0.12)] dark:text-[#ACEE5F]">
              {job.salary || "Competitive Compensation"}
            </span>
            <span className="fluid-card-badge px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted dark:bg-[#1E212D] flex items-center gap-1">
              <Zap className="w-3 h-3 text-brand-lime" />
              {workArrangement}
            </span>
          </div>

          {/* Job Description Content - Richly Styled Markdown */}
          <div className="
            prose prose-sm md:prose-base max-w-[65ch] xl:max-w-3xl mx-auto md:mx-0
            dark:prose-invert 
            text-text-muted dark:text-[#D1D5DB]
            
            /* Headings */
            prose-headings:font-heading prose-headings:font-semibold prose-headings:text-text-primary dark:prose-headings:text-white
            prose-h1:text-3xl prose-h1:mt-8 prose-h1:mb-5
            prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:tracking-tight
            prose-h3:text-xl prose-h3:mt-7 prose-h3:mb-3
            
            /* Paragraphs */
            prose-p:leading-[1.75] prose-p:my-4
            
            /* Lists & Bullets */
            prose-ul:my-5 prose-ul:list-disc prose-ul:pl-6 
            marker:text-brand-dark dark:marker:text-brand-lime
            prose-li:my-2 prose-li:leading-relaxed
            
            /* Strong & Emphasis */
            prose-strong:font-bold prose-strong:text-text-primary dark:prose-strong:text-white
            
            /* Links */
            prose-a:text-brand-dark dark:prose-a:text-brand-lime 
            prose-a:font-semibold prose-a:underline prose-a:underline-offset-4 hover:prose-a:text-opacity-80
            
            /* Blockquotes */
            prose-blockquote:border-l-4 prose-blockquote:border-brand-lime
            prose-blockquote:bg-bg-tag dark:prose-blockquote:bg-[#1E212D]
            prose-blockquote:px-5 prose-blockquote:py-2 prose-blockquote:my-6
            prose-blockquote:rounded-r-sm prose-blockquote:not-italic prose-blockquote:text-text-primary dark:prose-blockquote:text-white
          ">
            <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS}>
              {formattedMarkdown}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom Action Bar: Thumb-accessible, safe-area aware */}
      <div className="lg:hidden shrink-0 sticky bottom-0 z-30 bg-[#F8F9FA]/95 dark:bg-[#111216]/95 backdrop-blur-md border-t border-border-subtle dark:border-[#2B3042] px-4 sm:px-6 pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom,0.85rem))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.4)]">
        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 w-full max-w-4xl mx-auto">
          {applyUrl ? (
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group/link h-11 inline-flex items-center gap-[0.35rem] px-1 font-heading text-sm font-semibold text-text-primary hover:underline hover:underline-offset-4 cursor-pointer transition-all duration-150 shrink-0 select-none dark:text-white dark:hover:text-white"
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
                className="w-3.5 h-3.5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
              >
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => openModal(job)}
              className="group/link h-11 inline-flex items-center gap-[0.35rem] px-1 font-heading text-sm font-semibold text-text-primary hover:underline hover:underline-offset-4 cursor-pointer transition-all duration-150 shrink-0 select-none dark:text-white dark:hover:text-white"
            >
              <span>Apply Now</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
              >
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!session?.user) {
                router.push(`/auth?callbackUrl=${encodeURIComponent(pathname)}`);
                return;
              }
              useJobStore.getState().openTailorModal(job);
            }}
            className="flex-1 sm:flex-none sm:w-auto sm:px-6 h-11 inline-flex items-center justify-center gap-2 rounded-md bg-brand-lime text-[#111827] font-heading text-sm font-bold border-[1.5px] border-transparent transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] shadow-xs dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black"
          >
            <Sparkles className="w-4 h-4 text-[#111827]" />
            <span>Tailor Resume</span>
          </button>
        </div>
      </div>
    </div>
  );
}
