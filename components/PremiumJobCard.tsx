"use client";

import { memo } from "react";
import { Job } from "@/types";
import { useJobStore } from "@/store/useJobStore";
import { Bookmark, Sparkles, Check, MapPin } from "lucide-react";
import { getJobPostedTime } from "@/lib/utils";
import { authClient } from "@/lib/auth/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface PremiumJobCardProps {
  job: Job;
  variant?: "emerald" | "purple" | "blue";
  isRequested?: boolean;
  compact?: boolean;
  isActive?: boolean;
  onSelect?: (job: Job) => void;
}

export const PremiumJobCard = memo(function PremiumJobCard({
  job,
  variant = "emerald",
  isRequested = false,
  compact = false,
  isActive = false,
  onSelect,
}: PremiumJobCardProps) {
  const { openJd, openModal, savedJobIdsMap, toggleSavedJob } = useJobStore();
  const isSaved = !!savedJobIdsMap[job.id];
  const { data: session } = authClient.useSession();
  const router = useRouter();

  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelect) {
      onSelect(job);
    } else {
      openJd(job);
    }
  };

  const handleCardClick = () => {
    if (compact) {
      if (onSelect) {
        onSelect(job);
      } else {
        openJd(job);
      }
    }
  };

  const isPurple = variant === "purple" || isRequested;
  const isBlue = variant === "blue";

  // Solid border & shadow colors
  const shadowColorClass = isPurple 
    ? "bg-[#8465b5]" 
    : isBlue 
      ? "bg-[#0ea5e9]" 
      : "bg-[#33d9ac]";
      
  const borderColorClass = isPurple
    ? "bg-[#8465b5] dark:bg-[#8465b5]"
    : isBlue 
      ? "bg-[#0ea5e9] dark:bg-[#0284c7]"
      : "bg-[#33d9ac] dark:bg-[#26a884]";

  const highlightBadgeClass = isPurple
    ? "bg-[rgba(132,101,181,0.18)] text-[#5c3e8e] dark:bg-[rgba(132,101,181,0.12)] dark:text-[#a78bfa]"
    : isBlue 
      ? "bg-[rgba(14,165,233,0.18)] text-[#0369a1] dark:bg-[rgba(14,165,233,0.12)] dark:text-[#38bdf8]"
      : "bg-[rgba(38,168,132,0.18)] text-[#1a7a60] dark:bg-[rgba(38,168,132,0.12)] dark:text-[#33d9ac]";

  return (
    <div className="relative group h-full">
      {/* Light mode solid shadow (green for jobs, purple for requested, blue for saved) */}
      <div
        className={`absolute w-full h-full rounded-[10px] ${shadowColorClass} dark:hidden top-[4px] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isActive
            ? ""
            : "group-hover:top-[6px]"
        }`}
      />

      {/* Main card with solid border */}
      <div
        className={`relative h-full p-[1.5px] rounded-[10px] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isActive
            ? isBlue
              ? "bg-[#0ea5e9] dark:bg-[#38bdf8] dark:shadow-[0_4px_0_0_var(--shadow-color)]"
              : isPurple
                ? "bg-[#8465b5] dark:bg-[#a78bfa] dark:shadow-[0_4px_0_0_var(--shadow-color)]"
                : "bg-[#33d9ac] dark:bg-[#34d399] dark:shadow-[0_4px_0_0_var(--shadow-color)]"
            : `${borderColorClass} dark:shadow-[0_4px_0_0_var(--shadow-color)] group-hover:-translate-y-[2px] dark:group-hover:shadow-[0_6px_0_0_#08090C]`
        }`}
      >
        <article 
          id={`job-card-${job.id}`}
          onClick={handleCardClick}
          className={`relative h-full flex flex-col justify-between p-[1.25rem_1.35rem_1.15rem] rounded-card transition-colors ${
            isActive
              ? isBlue
                ? "bg-[#EBF5FF] dark:bg-[#182634] cursor-default"
                : isPurple
                  ? "bg-[#F7F4FB] dark:bg-[#221C2E] cursor-default"
                  : "bg-[#F1FCF7] dark:bg-[#172721] cursor-default"
              : `bg-bg-card ${compact ? "cursor-pointer" : ""}`
          }`}
        >
          <div className="flex flex-col">
            {/* Unified Title + Company Block: Accommodates 1-line and 2-line titles with uniform card height */}
            <div className="min-h-[5.35rem] flex flex-col justify-start mb-[0.85rem]">
              {/* Title Row */}
              <div className="flex items-start justify-between gap-2.5 mb-[0.45rem]">
                <button
                  type="button"
                  onClick={handleTitleClick}
                  className="text-left font-heading text-[1.2rem] font-semibold text-text-primary leading-[1.26] cursor-pointer transition-colors hover:underline line-clamp-2 flex-1 min-w-0 dark:text-white"
                >
                  {job.jobRoleTitle}
                </button>

                {/* Action cluster: Save icon to its right */}
                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">

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
                        ? isBlue
                          ? "text-[#0ea5e9] dark:text-[#38bdf8]"
                          : "text-text-primary dark:text-white"
                        : "text-text-subtle hover:text-text-primary dark:hover:text-white"
                    }`}
                    aria-label="Save Job"
                  >
                    <Bookmark
                      className="w-[18px] h-[18px]"
                      fill={isSaved ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              </div>

              {/* Company & Details Block (Sits right below title, extra space sits below this block) */}
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-md bg-bg-tag flex items-center justify-center shrink-0 text-text-primary dark:bg-[#171820] dark:text-[#A1A1AA]"
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
                  <span className="text-[0.88rem] font-semibold text-text-muted dark:text-[#A1A1AA] whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
                    {job.company}
                  </span>
                  <div className="flex items-center gap-2 text-[0.76rem] font-medium text-text-subtle dark:text-[#A1A1AA] whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
                    <span>{getJobPostedTime(job.id, job.postedAt)}</span>
                    <span className="inline-flex items-center gap-1 truncate text-text-subtle dark:text-[#A1A1AA]">
                      <MapPin className="w-3 h-3 shrink-0 text-text-subtle dark:text-[#A1A1AA]" />
                      <span className="truncate">{job.location}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Metadata Badges */}
            <div className="flex flex-wrap content-end gap-[0.35rem] mb-[0.65rem] min-h-[3.35rem]">
              {job.type && (
                <span className="text-[0.76rem] font-semibold px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted dark:bg-[#1E212D]">
                  {job.type}
                </span>
              )}
              {job.salary && (
                <span className="text-[0.76rem] font-semibold px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted dark:bg-[#1E212D]">
                  {job.salary}
                </span>
              )}
              {job.experienceRequired !== undefined && job.experienceRequired !== null && (
                <span className="text-[0.76rem] font-semibold px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted dark:bg-[#1E212D]">
                  {job.experienceRequired}y exp
                </span>
              )}
              {job.workModel && (
                <span className="text-[0.76rem] font-semibold px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted capitalize dark:bg-[#1E212D]">
                  {job.workModel.replace('_', ' ')}
                </span>
              )}
              {job.visaSponsorship && (
                <span className={`text-[0.76rem] px-[0.5rem] py-[0.18rem] rounded-xs font-bold ${highlightBadgeClass}`}>
                  Visa Sponsored
                </span>
              )}
            </div>
          </div>

          {/* Card Footer Actions - Hidden in compact mode */}
          {!compact && (
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border-subtle group/actions mt-auto">
              <button
                type="button"
                onClick={() => {
                  if (job.externalApplyUrl) {
                    window.open(job.externalApplyUrl, '_blank', 'noopener,noreferrer');
                  } else {
                    openModal(job);
                  }
                }}
                className="inline-flex items-center gap-[0.35rem] font-heading text-[0.85rem] font-semibold text-text-primary cursor-pointer transition-all duration-150 hover:underline hover:underline-offset-4 group-hover/link:translate-x-1 dark:text-white dark:hover:text-white"
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
                {isRequested ? (
                  <>
                    <Check className="w-[14px] h-[14px]" strokeWidth={2.8} />
                    <span>Requested</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-[13px] h-[13px]" />
                    <span>Tailor Resume</span>
                  </>
                )}
              </button>
            </div>
          )}
        </article>
      </div>
    </div>
  );
});
