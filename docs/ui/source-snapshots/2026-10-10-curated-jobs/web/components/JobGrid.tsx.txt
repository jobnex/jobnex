"use client";

import { Job } from "@/types";
import { JobCard } from "./JobCard";
import { PremiumJobCard } from "./PremiumJobCard";
import { JobCardSkeleton } from "./JobCardSkeleton";
import { useJobStore } from "@/store/useJobStore";

interface JobGridProps {
  jobs: Job[];
  twoColumns?: boolean;
  isPremium?: boolean;
  variant?: "emerald" | "purple" | "blue";
  isRequested?: boolean;
  isSplitView?: boolean;
  activeJobId?: string | null;
  isLoading?: boolean;
  skeletonCount?: number;
  onSelectJob?: (job: Job) => void;
  onResetFilters?: () => void;
}

import { memo } from "react";

export const JobGrid = memo(function JobGrid({
  jobs,
  twoColumns = false,
  isPremium = false,
  variant = "emerald",
  isRequested = false,
  isSplitView = false,
  activeJobId = null,
  onSelectJob,
  onResetFilters,
  isLoading = false,
  skeletonCount = 24,
}: JobGridProps) {
  const { resetFilters } = useJobStore();

  if (isLoading) {
    if (isSplitView) {
      return (
        <div className="flex flex-col gap-3">
          {Array.from({ length: skeletonCount }).map((_, i) => (
             <JobCardSkeleton key={i} compact={true} />
          ))}
        </div>
      );
    }
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 ${twoColumns ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-6`}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
           <JobCardSkeleton key={i} />
        ))}
      </div>
    );
  }


  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-[3.5rem_2rem] bg-bg-card border-[1.5px] border-border-color rounded-card shadow-[0_4px_0_0_var(--shadow-color)] w-full">
        <svg className="w-12 h-12 text-text-subtle mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
        <h3 className="text-[1.35rem] font-bold mb-[0.35rem]">No matching opportunities found</h3>
        <p className="text-[0.95rem] text-text-muted mb-[1.25rem] max-w-[420px]">
          We couldn&apos;t find any roles matching your current search criteria. Try adjusting keywords, changing locations, or resetting filters.
        </p>
        <button
          onClick={onResetFilters || resetFilters}
          className="inline-flex items-center gap-[0.5rem] px-[1.25rem] py-[0.6rem] text-[0.88rem] font-bold bg-brand-dark text-white border-[1.5px] border-border-color rounded-md shadow-[0_3px_0_0_var(--shadow-color)] cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1.5px] hover:shadow-[0_4px_0_0_var(--shadow-color)] active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--shadow-color)] dark:bg-brand-lime dark:text-[#111827] dark:border-[#111827] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black"
        >
          Reset All Filters
        </button>
      </div>
    );
  }

  // When split view is active (side panel open): Render single-line list on left
  if (isSplitView) {
    return (
      <div className="flex flex-col gap-3">
        {jobs.map((job) => (
          isPremium ? (
            <PremiumJobCard
              key={job.id}
              job={job}
              variant={variant}
              compact={true}
              isRequested={isRequested || Boolean((job as { isRequested?: boolean }).isRequested)}
              isActive={job.id === activeJobId}
              onSelect={onSelectJob}
            />
          ) : (
            <JobCard 
              key={job.id} 
              job={job} 
              compact={true} 
              isActive={job.id === activeJobId} 
              onSelect={onSelectJob}
            />
          )
        ))}
      </div>
    );
  }

  // Default Grid Layout
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 ${twoColumns ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-6`}>
      {jobs.map((job) => (
        isPremium ? (
          <PremiumJobCard
            key={job.id}
            job={job}
            variant={variant}
            isRequested={isRequested || Boolean((job as { isRequested?: boolean }).isRequested)}
            isActive={job.id === activeJobId}
            onSelect={onSelectJob}
          />
        ) : (
          <JobCard 
            key={job.id} 
            job={job} 
            isActive={job.id === activeJobId} 
            onSelect={onSelectJob} 
          />
        )
      ))}
    </div>
  );
});
