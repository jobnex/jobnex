"use client";

import { memo } from "react";
import { Job } from "@/types";
import { JobCard } from "./JobCard";
import { PremiumJobCard } from "./PremiumJobCard";
import { JobCardSkeleton } from "./JobCardSkeleton";
import { useJobStore } from "@/store/useJobStore";
import { DEFAULT_PAGE_SIZE } from "@/lib/job-utils";

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
  skeletonCount = DEFAULT_PAGE_SIZE,
}: JobGridProps) {
  const resetFilters = useJobStore((s) => s.resetFilters);
  const handleReset = onResetFilters || resetFilters;

  if (isLoading) {
    if (isSplitView) {
      return (
        <div className="flex flex-col gap-[var(--space-xs)] fluid-card-container">
          {Array.from({ length: skeletonCount }).map((_, i) => (
             <JobCardSkeleton key={i} compact={true} />
          ))}
        </div>
      );
    }
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${twoColumns ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} fluid-grid-gap fluid-card-container`}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
           <JobCardSkeleton key={i} />
        ))}
      </div>
    );
  }


  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-[var(--space-xl)_var(--space-m)] bg-bg-card border-[1.5px] border-border-color rounded-card shadow-[0_4px_0_0_var(--shadow-color)] w-full">
        <svg className="w-12 h-12 text-text-subtle mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
        <h3 className="text-xl sm:text-2xl font-bold mb-[var(--space-3xs)]">No matching opportunities found</h3>
        <p className="text-sm sm:text-base text-text-muted mb-[var(--space-m)] max-w-[420px]">
          We couldn&apos;t find any roles matching your current search criteria. Try adjusting keywords, changing locations, or resetting filters.
        </p>
        <button
          onClick={handleReset}
          className="inline-flex items-center gap-[var(--space-2xs)] px-[clamp(0.85rem,calc(0.75rem+0.35vw),1.35rem)] py-[clamp(0.45rem,calc(0.38rem+0.25vw),0.65rem)] text-xs sm:text-sm font-bold bg-brand-dark text-white border-[1.5px] border-border-color rounded-md shadow-[0_3px_0_0_var(--shadow-color)] cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1.5px] hover:shadow-[0_4px_0_0_var(--shadow-color)] active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--shadow-color)] dark:bg-brand-lime dark:text-[#111827] dark:border-[#111827] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black"
        >
          Reset All Filters
        </button>
      </div>
    );
  }

  // When split view is active (side panel open): Render single-line list on left
  if (isSplitView) {
    return (
      <div className="flex flex-col gap-[var(--space-xs)] fluid-card-container">
        {jobs.map((job) => (
          isPremium ? (
            <PremiumJobCard
              key={job.id}
              job={job}
              variant={variant}
              compact={true}
              isRequested={job.isRequested ?? isRequested}
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
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${twoColumns ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} fluid-grid-gap fluid-card-container`}>
      {jobs.map((job) => (
        isPremium ? (
          <PremiumJobCard
            key={job.id}
            job={job}
            variant={variant}
            isRequested={job.isRequested ?? isRequested}
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
