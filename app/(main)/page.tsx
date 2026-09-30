"use client";
import { LoaderDots } from "@/components/ui/LoaderDots";

import { useEffect, useRef, useCallback } from "react";
import { useJobsQuery } from "@/lib/hooks/useJobsQuery";
import { useJobStore, useAppFilters } from "@/store/useJobStore";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { FiltersModal } from "@/components/FiltersModal";
import { JobGrid } from "@/components/JobGrid";
import { Pagination } from "@/components/Pagination";
import { JobDescriptionPanel } from "@/components/JobDescriptionPanel";
import { Job, JobsResponse } from "@/types";
import { Suspense } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { UrlFilterSync } from "@/components/UrlFilterSync";

export default function Home() {
  const {
    searchQuery,
    searchBy,
    location,
    categories,
    jobType,
    seniority,
    minSalary,
    postedTime,
    visaSponsorship,
    workMode,
    page,
    setPage,
  } = useAppFilters("default");

  const {
    isJdOpen,
    activeJdJob,
    setActiveJdJob,
    closeJd,
  } = useJobStore();
  const debouncedSearchQuery = useDebounce(searchQuery, 400);
  
  // Track whether a scroll-to-top was initiated by bottom pagination or filter change
  const shouldScrollTopRef = useRef(false);

  const { data, isLoading, isError, isFetching } = useJobsQuery({
    debouncedSearchQuery,
    searchBy,
    location,
    categories,
    jobType,
    seniority,
    minSalary,
    postedTime,
    visaSponsorship,
    workMode,
    page,
  });

  const scrollToTop = (smooth = true) => {
    if (typeof window === "undefined") return;
    const behavior = smooth ? "smooth" : "instant";
    window.scrollTo({ top: 0, left: 0, behavior });
    if (document.documentElement) {
      document.documentElement.scrollTo({ top: 0, left: 0, behavior });
    }
    if (document.body) {
      document.body.scrollTo({ top: 0, left: 0, behavior });
    }
  };

  const handlePageChange = useCallback((newPage: number, source: "top" | "bottom" = "bottom") => {
    setPage(newPage);
    if (source === "bottom") {
      shouldScrollTopRef.current = true;
      scrollToTop(true);
    }
  }, [setPage]);

  // Scroll to top when filters change
  useEffect(() => {
    scrollToTop(true);
  }, [location, categories, jobType, seniority, minSalary, postedTime, visaSponsorship]);

  // If a bottom page change was initiated, ensure the scroll animation completes
  // even if React Query updates the DOM height during fetch completion
  useEffect(() => {
    if (shouldScrollTopRef.current) {
      scrollToTop(true);
      // Reset ref on next animation frame
      const frame = requestAnimationFrame(() => {
        shouldScrollTopRef.current = false;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [page, data]);

  // Auto-scroll when JD panel is FIRST opened
  const prevIsJdOpenRef = useRef(isJdOpen);
  
  useEffect(() => {
    if (isJdOpen && !prevIsJdOpenRef.current && activeJdJob) {
      // Small timeout to allow DOM to render the split-view and the compact cards
      setTimeout(() => {
        const activeCard = document.getElementById(`job-card-${activeJdJob.id}`);
        if (activeCard) {
          // The JD panel is sticky at top-[5.25rem] (which is 84px).
          // We scroll the window so the active card is aligned exactly at this top offset.
          // This ensures the JD panel top aligns with the active job card top, hiding the search bar.
          const offset = 84; 
          const rect = activeCard.getBoundingClientRect();
          const targetY = window.scrollY + rect.top - offset;
          
          window.scrollTo({
            top: targetY,
            behavior: "smooth"
          });
        }
      }, 50);
    }
    prevIsJdOpenRef.current = isJdOpen;
  }, [isJdOpen, activeJdJob]);

  const handleSelectJob = useCallback((job: Job) => {
    setActiveJdJob(job);
  }, [setActiveJdJob]);

  // Clean up global JD panel state on unmount to avoid cross-page state bleeding
  useEffect(() => {
    return () => {
      closeJd();
    };
  }, [closeJd]);

  return (
    <section className="py-5 sm:py-7 pb-16 flex-1">
      <div className="container max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-7">
        <Suspense fallback={null}>
          <UrlFilterSync />
        </Suspense>
        <SearchFilterBar />

        {isLoading ? (
          <div className="flex justify-center py-20">
            <LoaderDots className="w-12 h-12" />
          </div>
        ) : isError ? (
          <div className="text-center text-red-500 py-10 font-bold">
            Failed to load jobs. Please try again later.
          </div>
        ) : (
          <div>
            {isJdOpen && activeJdJob ? (
              /* Split-View Layout: Left List + Right JD Side Panel */
              <div className="flex flex-col lg:flex-row gap-6 items-start pt-1">
                {/* Left Column: Single line list of jobs */}
                <div className="w-full lg:w-[410px] xl:w-[440px] shrink-0 flex flex-col gap-3">
                  {/* Top Pagination for compact list */}
                  {data && data.total > 0 && (
                    <Pagination
                      currentPage={page}
                      totalPages={data.totalPages || 1}
                      totalResults={data.total || 0}
                      pageSize={12}
                      onPageChange={handlePageChange}
                      position="top"
                      forceCompact={true}
                    />
                  )}

                  {/* Single line list */}
                  <JobGrid 
                    jobs={data?.jobs || []} 
                    isSplitView={true}
                    activeJobId={activeJdJob.id}
                    onSelectJob={handleSelectJob}
                    isLoading={isFetching && !isLoading}
                  />

                  {/* Bottom Pagination for compact list */}
                  {data && data.total > 0 && (
                    <Pagination
                      currentPage={page}
                      totalPages={data.totalPages || 1}
                      totalResults={data.total || 0}
                      pageSize={24}
                      onPageChange={handlePageChange}
                      position="bottom"
                      forceCompact={true}
                    />
                  )}
                </div>

                {/* Right Column: Desktop Sticky Side Panel */}
                <div className="hidden lg:block lg:flex-1 min-w-0 sticky top-[5.25rem]">
                  <JobDescriptionPanel 
                    job={activeJdJob}
                    onClose={closeJd}
                  />
                </div>

                {/* Mobile / Tablet Drawer Overlay */}
                <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-3 flex flex-col justify-end sm:justify-center animate-in fade-in duration-200">
                  <div className="w-full max-w-xl mx-auto h-[90vh] max-h-[700px] flex flex-col">
                    <JobDescriptionPanel 
                      job={activeJdJob}
                      onClose={closeJd}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Default Full Width 3-Column Grid View */
              <div>
                {/* Top Pagination Bar */}
                {data && data.total > 0 && (
                  <Pagination
                    currentPage={page}
                    totalPages={data.totalPages || 1}
                    totalResults={data.total || 0}
                    pageSize={24}
                    onPageChange={handlePageChange}
                    position="top"
                  />
                )}

                {/* Main Job Cards Grid */}
                <JobGrid 
                  jobs={data?.jobs || []} 
                  onSelectJob={handleSelectJob}
                  isLoading={isFetching && !isLoading}
                />

                {/* Bottom Pagination Bar */}
                {data && data.total > 0 && (
                  <Pagination
                    currentPage={page}
                    totalPages={data.totalPages || 1}
                    totalResults={data.total || 0}
                    pageSize={24}
                    onPageChange={handlePageChange}
                    position="bottom"
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive Filters Modal */}
      <FiltersModal totalMatches={data?.total || 0} />
    </section>
  );
}
