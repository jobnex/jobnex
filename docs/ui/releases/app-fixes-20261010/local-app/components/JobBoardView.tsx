"use client";

import { useEffect, useRef, useCallback } from "react";
import { Job } from "@/types";
import { useJobStore } from "@/store/useJobStore";
import { JobGrid } from "./JobGrid";
import { Pagination } from "./Pagination";
import { JobDescriptionPanel } from "./JobDescriptionPanel";
import { DEFAULT_PAGE_SIZE } from "@/lib/job-utils";

export interface JobBoardViewProps {
  jobs: Job[];
  total: number;
  totalPages: number;
  page: number;
  pageSize?: number;
  onPageChange: (newPage: number, source?: "top" | "bottom") => void;
  onResetFilters?: () => void;
  isLoading?: boolean;
  isFetching?: boolean;
  isPremium?: boolean;
  variant?: "emerald" | "purple" | "blue";
}

export function JobBoardView({
  jobs,
  total,
  totalPages,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageChange,
  onResetFilters,
  isLoading = false,
  isFetching = false,
  isPremium = false,
  variant = "emerald",
}: JobBoardViewProps) {
  const isJdOpen = useJobStore((s) => s.isJdOpen);
  const activeJdJob = useJobStore((s) => s.activeJdJob);
  const setActiveJdJob = useJobStore((s) => s.setActiveJdJob);
  const closeJd = useJobStore((s) => s.closeJd);
  const isHeaderHidden = useJobStore((s) => s.isHeaderHidden);

  const prevIsJdOpenRef = useRef(isJdOpen);

  // Smooth alignment when JD panel is first opened
  useEffect(() => {
    if (isJdOpen && !prevIsJdOpenRef.current && activeJdJob) {
      const timer = setTimeout(() => {
        const activeCard = document.getElementById(`job-card-${activeJdJob.id}`);
        if (activeCard) {
          const offset = 84; // Sticky JD header offset
          const rect = activeCard.getBoundingClientRect();
          const targetY = window.scrollY + rect.top - offset;
          window.scrollTo({
            top: targetY,
            behavior: "smooth",
          });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
    prevIsJdOpenRef.current = isJdOpen;
  }, [isJdOpen, activeJdJob]);

  // Clean up global JD panel state on unmount
  useEffect(() => {
    return () => {
      closeJd();
    };
  }, [closeJd]);

  const handleSelectJob = useCallback((job: Job) => {
    setActiveJdJob(job);
  }, [setActiveJdJob]);

  return (
    <div>
      {isJdOpen && activeJdJob ? (
        /* Split-View Layout: Left List + Right JD Side Panel */
        <div className="flex flex-col lg:flex-row gap-6 items-start pt-1">
          {/* Left Column: Compact single-column card list */}
          <div className="w-full lg:w-[380px] xl:w-[420px] 2xl:w-[460px] shrink-0 flex flex-col gap-3">
            {total > 0 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalResults={total}
                pageSize={pageSize}
                onPageChange={onPageChange}
                position="top"
                forceCompact={true}
              />
            )}

            <JobGrid
              jobs={jobs}
              isSplitView={true}
              activeJobId={activeJdJob.id}
              onSelectJob={handleSelectJob}
              onResetFilters={onResetFilters}
              isLoading={isLoading || isFetching}
              isPremium={isPremium}
              variant={variant}
            />

            {total > 0 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalResults={total}
                pageSize={pageSize}
                onPageChange={onPageChange}
                position="bottom"
                forceCompact={true}
              />
            )}
          </div>

          {/* Right Column: Desktop Sticky Side Panel */}
          <div
            className="hidden lg:block lg:flex-1 min-w-0 sticky transition-[top] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              top: "calc(var(--header-actual-height, 4rem) + var(--searchbar-actual-height, 3.25rem) + 0.5rem)",
            }}
          >
            <JobDescriptionPanel job={activeJdJob} onClose={closeJd} />
          </div>

          {/* Mobile / Tablet Drawer Overlay */}
          <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-2 sm:p-4 flex flex-col justify-end sm:justify-center animate-in fade-in duration-200">
            <div className="w-full max-w-xl mx-auto h-[92dvh] max-h-[750px] flex flex-col">
              <JobDescriptionPanel job={activeJdJob} onClose={closeJd} />
            </div>
          </div>
        </div>
      ) : (
        /* Default Full Width 3-Column Grid View */
        <div>
          {total > 0 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalResults={total}
              pageSize={pageSize}
              onPageChange={onPageChange}
              position="top"
            />
          )}

          <JobGrid
            jobs={jobs}
            onSelectJob={handleSelectJob}
            onResetFilters={onResetFilters}
            isLoading={isLoading || isFetching}
            isPremium={isPremium}
            variant={variant}
          />

          {total > 0 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalResults={total}
              pageSize={pageSize}
              onPageChange={onPageChange}
              position="bottom"
            />
          )}
        </div>
      )}
    </div>
  );
}
