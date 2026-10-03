"use client";

import { useEffect, useState, useRef } from "react";
import { Job } from "@/types";
import { useJobStore } from "@/store/useJobStore";
import { getStructuredJobDescription } from "@/lib/job-description-data";
import { 
  X, Bookmark, Sparkles, MapPin, Building2, 
  Clock, Zap
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { formatJobDescriptionToMarkdown } from "@/lib/markdown-utils";

interface JobDescriptionPanelProps {
  job: Job;
  onClose: () => void;
}

export function JobDescriptionPanel({ job, onClose }: JobDescriptionPanelProps) {
  const { openModal, savedJobIdsMap, toggleSavedJob } = useJobStore();
  const isSaved = !!savedJobIdsMap[job.id];
  const { data: session } = authClient.useSession();
  const router = useRouter();
  
  // Smart header state
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset scroll position and header visibility when opening a new job
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    requestAnimationFrame(() => setIsHeaderVisible(true));
    lastScrollY.current = 0;
  }, [job.id]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;
    
    // Hide header if scrolling down and past a threshold (e.g., 60px)
    // Show header if scrolling up
    if (currentScrollY > lastScrollY.current && currentScrollY > 60) {
      if (isHeaderVisible) setIsHeaderVisible(false);
    } else if (currentScrollY < lastScrollY.current) {
      if (!isHeaderVisible) setIsHeaderVisible(true);
    }
    
    lastScrollY.current = currentScrollY;
  };

  const jdData = getStructuredJobDescription(job);

  const handleApply = () => {
    if (job.externalApplyUrl) {
      window.open(job.externalApplyUrl, '_blank', 'noopener,noreferrer');
    } else {
      openModal(job);
    }
  };

  return (
    <div 
      className="relative flex flex-col bg-bg-card border-[1.5px] border-border-color rounded-card overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] h-full max-h-[calc(100vh-6.5rem)] dark:border-[#31364A]"
      role="region"
      aria-label={`Job description for ${job.jobRoleTitle} at ${job.company}`}
    >
      {/* Main Scrollable Content */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto flex flex-col relative"
        onScroll={handleScroll}
      >
        {/* Smart Sticky Title Header */}
        <div 
          className={`sticky top-0 z-10 bg-[#F8F9FB]/95 dark:bg-[#151720]/95 backdrop-blur-md px-5 md:px-6 pt-4 md:pt-5 pb-3 border-b border-border-subtle dark:border-[#2B3042] shadow-[0_4px_12px_-2px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_14px_-2px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isHeaderVisible ? "translate-y-0" : "-translate-y-full"
          }`}
        >
          <div className="flex items-start justify-between gap-4 mb-2">
            <h2 className="font-heading text-[1.2rem] sm:text-[1.35rem] font-semibold text-text-primary leading-tight dark:text-white">
              {job.jobRoleTitle}
            </h2>

            {/* Save & Close Actions */}
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
                onClick={onClose}
                className="w-8 h-8 rounded-md hover:rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-tag-hover dark:text-[#A1A1AA] dark:hover:text-white dark:hover:bg-[#2B3042] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer"
                title="Close panel"
                aria-label="Close job details panel"
              >
                <X className="w-4 h-4" strokeWidth={2.2} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.92rem]">
            <div className="flex items-center gap-1.5 font-bold text-text-primary dark:text-[#E5E7EB]">
              <Building2 className="w-4 h-4 text-text-subtle shrink-0 dark:text-[#9CA3AF]" />
              <span>{job.company}</span>
            </div>

            <div className="flex items-center gap-1.5 text-text-muted font-medium text-[0.88rem] dark:text-[#9CA3AF]">
              <MapPin className="w-3.5 h-3.5 text-text-subtle shrink-0 dark:text-[#9CA3AF]" />
              <span>{job.location}</span>
            </div>

            <div className="flex items-center gap-1.5 text-text-subtle font-medium text-[0.82rem] dark:text-[#9CA3AF]">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                Posted {
                  job.postedAt 
                    ? new Date(job.postedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) + " at " + new Date(job.postedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                    : "Recently"
                }
              </span>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center gap-4 pt-4">
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center gap-[0.35rem] font-heading text-[0.85rem] font-semibold text-text-primary cursor-pointer transition-all duration-150 hover:underline hover:underline-offset-4 group-hover/link:translate-x-1 dark:text-white"
            >
              <span>Apply Now</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-[13px] h-[13px] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
              >
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!session?.user) {
                  router.push(`/auth?callbackUrl=${encodeURIComponent(`/job-hunt/tailor-resume?jobId=${job.id}`)}`);
                  return;
                }
                router.push(`/job-hunt/tailor-resume?jobId=${encodeURIComponent(job.id)}`);
              }}
              className="inline-flex items-center justify-center gap-[0.35rem] p-[0.38rem_0.85rem] rounded-sm border-[1.5px] border-transparent bg-brand-lime text-[#111827] font-heading text-[0.85rem] font-semibold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black"
            >
              <Sparkles className="w-[13px] h-[13px]" />
              <span>Tailor Resume</span>
            </button>
          </div>
        </div>

        <div className="px-5 md:px-6 py-5 space-y-6">
          {/* Quick Badges (Details in actual JD section) */}
          <div className="flex flex-wrap items-center gap-[0.35rem]">
            <span className="text-[0.76rem] font-semibold px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted dark:bg-[#1E212D]">
              {job.type}
            </span>
            <span className="text-[0.76rem] px-[0.5rem] py-[0.18rem] rounded-xs font-bold bg-[rgba(185,255,102,0.18)] text-[#064E3B] dark:bg-[rgba(172,238,95,0.12)] dark:text-[#ACEE5F]">
              {job.salary || "Competitive Compensation"}
            </span>
            <span className="text-[0.76rem] font-semibold px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted dark:bg-[#1E212D] flex items-center gap-1">
              <Zap className="w-3 h-3 text-brand-lime" />
              {jdData.workArrangement}
            </span>
          </div>

            {/* Job Description Content - Richly Styled Markdown */}
          <div className="
            prose prose-sm md:prose-base max-w-[65ch] xl:max-w-3xl mx-auto md:mx-0
            dark:prose-invert 
            text-text-muted dark:text-[#D1D5DB]
            
            /* Headings */
            prose-headings:font-heading prose-headings:font-semibold prose-headings:text-text-primary dark:prose-headings:text-white
            prose-h1:text-2xl prose-h1:mt-8 prose-h1:mb-5
            prose-h2:text-[1.35rem] prose-h2:mt-8 prose-h2:mb-4 prose-h2:tracking-tight
            prose-h3:text-[1.1rem] prose-h3:mt-7 prose-h3:mb-3
            
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
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
              {formatJobDescriptionToMarkdown(job.jobDescription || job.descriptionPlain || "")}
            </ReactMarkdown>
          </div>
        </div>
      </div>

    </div>
  );
}
