"use client";

import { memo, useCallback } from "react";
import { Job } from "@/types";
import { useJobStore } from "@/store/useJobStore";
import { Bookmark, Sparkles, MapPin } from "lucide-react";
import { getJobPostedTime } from "@/lib/utils";
import { normalizeExternalUrl } from "@/lib/job-utils";
import { authClient } from "@/lib/auth/client";
import { toast } from "sonner";
import { useRouter, usePathname } from "next/navigation";

interface JobCardProps {
  job: Job;
  compact?: boolean;
  isActive?: boolean;
  onSelect?: (job: Job) => void;
}

export const JobCard = memo(function JobCard({ 
  job, 
  compact = false, 
  isActive = false,
  onSelect 
}: JobCardProps) {
  const openModal = useJobStore((s) => s.openModal);
  const openJd = useJobStore((s) => s.openJd);
  const toggleSavedJob = useJobStore((s) => s.toggleSavedJob);
  const isSaved = useJobStore((s) => !!s.savedJobIdsMap[job.id]);
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const pathname = usePathname();
  const applyUrl = normalizeExternalUrl(job.externalApplyUrl);

  const handleTitleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelect) {
      onSelect(job);
    } else {
      openJd(job);
    }
  }, [onSelect, openJd, job]);

  const handleCardClick = useCallback(() => {
    if (compact) {
      if (onSelect) {
        onSelect(job);
      } else {
        openJd(job);
      }
    }
  }, [compact, onSelect, openJd, job]);

  const isSaveVisible = !isActive;

  return (
    <article 
      id={`job-card-${job.id}`}
      onClick={handleCardClick}
      className={`relative h-full flex flex-col justify-between fluid-card-box rounded-card border-[1.5px] shadow-[0_4px_0_0_var(--shadow-color)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isActive
          ? "border-brand-dark bg-[rgba(185,255,102,0.12)] dark:border-brand-lime dark:bg-[rgba(172,238,95,0.08)] cursor-default"
          : "border-border-color bg-bg-card hover:-translate-y-[2px] hover:shadow-[0_6px_0_0_var(--shadow-color)] dark:border-[#31364A] dark:hover:border-[#434B66] dark:hover:shadow-[0_6px_0_0_#08090C] cursor-pointer"
      }`}
    >
      <div className="flex flex-col">
        {/* Unified Title + Company Block */}
        <div className="min-h-[5.35rem] flex flex-col justify-start mb-[var(--space-xs)]">
          {/* Title Row */}
          <div className="flex items-start justify-between gap-[var(--space-2xs)] mb-[var(--space-3xs)]">
            <button
              type="button"
              onClick={handleTitleClick}
              className="text-left fluid-card-title text-text-primary cursor-pointer transition-colors hover:underline line-clamp-2 flex-1 min-w-0 dark:text-white"
            >
              {job.jobRoleTitle}
            </button>

            {/* Action cluster: Save icon */}
            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">

              {isSaveVisible && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!session?.user) {
                      toast.error("Please login to save jobs", { duration: 3000 });
                      return;
                    }
                    toggleSavedJob(job.id);
                    if (isSaved) {
                      toast.success("Job removed from saved");
                    } else {
                      toast.success("Job saved successfully");
                    }
                  }}
                  className={`p-0.5 transition-colors cursor-pointer shrink-0 ${
                    isSaved
                      ? "text-text-primary dark:text-white"
                      : "text-text-subtle hover:text-text-primary dark:hover:text-white"
                  }`}
                  aria-label="Save Job"
                >
                  <Bookmark className="w-[18px] h-[18px]" fill={isSaved ? "currentColor" : "none"} />
                </button>
              )}
            </div>
          </div>

          {/* Company & Details Block */}
          <div className="flex items-center gap-[var(--space-xs)]">
            <div
              className="w-[clamp(2rem,calc(1.85rem+0.37vw),2.375rem)] h-[clamp(2rem,calc(1.85rem+0.37vw),2.375rem)] rounded-md bg-bg-tag flex items-center justify-center shrink-0 text-text-primary dark:bg-[#171820] dark:text-[#A1A1AA]"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-[16px] h-[16px]"
              >
                <rect x="4" y="3" width="16" height="18" rx="2"></rect>
                <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"></path>
              </svg>
            </div>
            <div className="flex flex-col min-w-0 flex-1 justify-center gap-1">
              <span className="fluid-card-company text-text-muted dark:text-[#A1A1AA] whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
                {job.company}
              </span>
              <div className="flex items-center gap-2 fluid-card-meta text-text-subtle dark:text-[#A1A1AA] whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
                <span suppressHydrationWarning>{getJobPostedTime(job.id, job.postedAt)}</span>
                <span className="inline-flex items-center gap-1 truncate text-text-subtle dark:text-[#A1A1AA]">
                  <MapPin className="w-3 h-3 shrink-0 text-text-subtle dark:text-[#A1A1AA]" />
                  <span className="truncate">{job.location}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Metadata Badges */}
        <div className="flex flex-wrap content-end gap-[var(--space-3xs)] mb-[var(--space-2xs)] min-h-[3.35rem]">
          {job.type && (
            <span className="fluid-card-badge px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted dark:bg-[#1E212D]">
              {job.type}
            </span>
          )}
          {job.salary && (
            <span className="fluid-card-badge px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted dark:bg-[#1E212D]">
              {job.salary}
            </span>
          )}
          {job.experienceRequired !== undefined && job.experienceRequired !== null && (
            <span className="fluid-card-badge px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted dark:bg-[#1E212D]">
              {job.experienceRequired}y exp
            </span>
          )}
          {job.workModel && (
            <span className="fluid-card-badge px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted capitalize dark:bg-[#1E212D]">
              {job.workModel.replace('_', ' ')}
            </span>
          )}
          {job.visaSponsorship && (
            <span className="fluid-card-badge px-[0.5rem] py-[0.18rem] rounded-xs font-bold bg-[rgba(185,255,102,0.18)] text-[#064E3B] dark:bg-[rgba(172,238,95,0.12)] dark:text-[#ACEE5F]">
              Visa Sponsored
            </span>
          )}
        </div>
      </div>

      {/* Card Footer Actions - Hidden in compact mode */}
      {!compact && (
        <div className="flex items-center justify-between gap-[var(--space-2xs)] pt-[var(--space-xs)] border-t border-border-subtle group/actions mt-auto dark:border-[#2B3042]">
          {applyUrl ? (
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="group/link inline-flex items-center gap-[0.35rem] font-heading text-xs sm:text-sm font-semibold text-text-primary cursor-pointer transition-all duration-150 hover:underline hover:underline-offset-4 shrink-0 dark:text-white"
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
              onClick={(e) => {
                e.stopPropagation();
                openModal(job);
              }}
              className="group/link inline-flex items-center gap-[0.35rem] font-heading text-xs sm:text-sm font-semibold text-text-primary cursor-pointer transition-all duration-150 hover:underline hover:underline-offset-4 shrink-0 dark:text-white"
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
            className="inline-flex items-center justify-center gap-[0.35rem] p-[clamp(0.32rem,calc(0.28rem+0.18vw),0.42rem)_clamp(0.65rem,calc(0.55rem+0.35vw),0.95rem)] rounded-sm border-[1.5px] border-transparent bg-brand-lime text-[#111827] font-heading text-xs sm:text-sm font-semibold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] shrink-0 dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black"
          >
            <Sparkles className="w-[13px] h-[13px]" />
            <span>Tailor Resume</span>
          </button>
        </div>
      )}
    </article>
  );
});
