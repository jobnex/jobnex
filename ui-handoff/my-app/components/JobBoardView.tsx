"use client";

import { useEffect, useRef, useCallback } from "react";
import { Job } from "@/types";
import { useJobStore } from "@/store/useJobStore";
import { JobGrid } from "./JobGrid";
import { Pagination } from "./Pagination";
import { JobDescriptionPanel } from "./JobDescriptionPanel";
import { DEFAULT_PAGE_SIZE } from "@/lib/job-utils";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/utils/scrollLock";

export interface JobBoardViewProps {
  banner?: React.ReactNode;
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
  banner,
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

  const prevIsJdOpenRef = useRef(isJdOpen);
  const prevJobIdRef = useRef<string | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Smooth alignment when JD panel is opened or when switching jobs in split view
  useEffect(() => {
    // Only execute desktop side-by-side card alignment on desktop viewports (lg: >= 1024px)
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
    if (!isDesktop || !isJdOpen || !activeJdJob) {
      prevIsJdOpenRef.current = isJdOpen;
      prevJobIdRef.current = activeJdJob ? activeJdJob.id : null;
      return;
    }

    const isFirstOpen = !prevIsJdOpenRef.current && isJdOpen;
    const isNewJob = prevJobIdRef.current !== activeJdJob.id;

    if (isFirstOpen || isNewJob) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      // Use double requestAnimationFrame to ensure layout reflow (3-col -> 1-col) has completed
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = requestAnimationFrame(() => {
          const activeCard = document.getElementById(`job-card-${activeJdJob.id}`);
          if (activeCard) {
            // Measure actual live sticky header height
            const headerEl = document.querySelector("header");
            const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 108;
            const topGap = 16; // 1rem breathing room below sticky header matching JD sticky top
            const targetStickyTop = headerHeight + topGap;

            const cardRect = activeCard.getBoundingClientRect();
            // Calculate absolute target window scroll position to align card top with sticky top
            const targetY = window.scrollY + cardRect.top - targetStickyTop;

            window.scrollTo({
              top: Math.max(0, targetY),
              behavior: "smooth",
            });
          }
        });
      });
    }

    prevIsJdOpenRef.current = isJdOpen;
    prevJobIdRef.current = activeJdJob.id;

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [isJdOpen, activeJdJob]);

  // Lock body scroll on mobile / tablet when modal drawer overlay is open
  useEffect(() => {
    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
    if (isJdOpen && isMobileOrTablet) {
      lockBodyScroll();
      return () => {
        unlockBodyScroll();
      };
    }
  }, [isJdOpen]);

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
    <div className="w-full">
      {banner}

      {isJdOpen && activeJdJob ? (
        /* Split-View Layout: Left List + Right JD Side Panel */
        <div className="flex flex-col lg:flex-row gap-6 items-start pt-1">
          {/* Left Column: Compact single-column card list */}
          <div className="w-full lg:w-[380px] xl:w-[420px] 2xl:w-[460px] shrink-0 flex flex-col gap-3 pb-24 lg:pb-32">
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

          {/* Dedicated JD Panel: Desktop Sticky Side Panel / Mobile Dedicated Full-Screen View */}
          <div
            className="max-lg:fixed max-lg:!inset-0 max-lg:!top-0 max-lg:z-[150] max-lg:w-full max-lg:h-[100dvh] max-lg:bg-bg-page dark:max-lg:bg-[#111216] max-lg:flex max-lg:flex-col lg:flex-1 min-w-0 lg:sticky overscroll-contain transition-[top] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] animate-in fade-in duration-200"
            style={{
              top: "calc(var(--header-compact-h, 6.75rem) + 1rem)",
            }}
          >
            <JobDescriptionPanel job={activeJdJob} onClose={closeJd} />
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
