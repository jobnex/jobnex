"use client";

import { useEffect, useRef, Suspense, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { JobGrid } from "@/components/JobGrid";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { FiltersModal } from "@/components/FiltersModal";
import { Pagination } from "@/components/Pagination";
import { UrlFilterSync } from "@/components/UrlFilterSync";
import { useJobStore, useAppFilters } from "@/store/useJobStore";
import { authClient } from "@/lib/auth/client";
import { JobsResponse, Job } from "@/types";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { LoaderDots } from "@/components/ui/LoaderDots";
import Link from "next/link";
import { JobDescriptionPanel } from "@/components/JobDescriptionPanel";

export default function SavedJobsPage() {
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
  } = useAppFilters("saved");

  const {
    isJdOpen,
    activeJdJob,
    closeJd,
    setActiveJdJob,
    savedJobIds,
    savedJobIdsMap,
    setSavedJobIds,
  } = useJobStore();
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  const { data: session, isPending } = authClient.useSession();
  
  const shouldScrollTopRef = useRef(false);

  const { data, isLoading, isError, isFetching } = useQuery<JobsResponse>({
    queryKey: [
      "saved-jobs",
      debouncedSearchQuery,
      debouncedSearchQuery ? searchBy : 'all',
      location,
      categories,
      jobType,
      seniority,
      minSalary,
      postedTime,
      visaSponsorship,
      workMode,
      page,
    ],
    queryFn: async () => {
      if (!session) return { jobs: [], total: 0, page: 1, limit: 24, totalPages: 0, hasNextPage: false, hasPrevPage: false };
      
      const params = new URLSearchParams();
      if (debouncedSearchQuery) {
        params.append("keyword", debouncedSearchQuery);
        if (searchBy && searchBy !== "all") params.append("searchBy", searchBy);
      }
      if (location) params.append("location", location);
      if (categories && categories.length > 0) params.append("categories", categories.join(","));
      if (jobType && jobType !== "all") params.append("type", jobType);
      if (seniority && seniority !== "all") params.append("seniority", seniority);
      if (minSalary > 0) params.append("minSalary", minSalary.toString());
      if (postedTime && postedTime !== "all") params.append("postedTime", postedTime);
      if (visaSponsorship && visaSponsorship !== "all") params.append("visaSponsorship", visaSponsorship);
      if (workMode && workMode !== "all") params.append("workMode", workMode);
      params.append("page", page.toString());
      params.append("limit", "24");

      const res = await fetch(`/api/jobs/saved?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch saved jobs");
      const json = await res.json();
      
      // Update global savedJobIds store strictly with actual IDs currently matched/saved
      if (json.jobs) {
        // Just merging known loaded ones to prevent them popping out locally if we untoggle/toggle
        // Typically the SavedJobsHydrator handles global sync, but this is a nice side-effect sync
      }
      return json;
    },
    enabled: !isPending && !!session?.user,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: 1 * 60 * 1000,
  });

  const scrollToTop = (smooth = true) => {
    if (typeof window === "undefined") return;
    const behavior = smooth ? "smooth" : "instant";
    window.scrollTo({ top: 0, left: 0, behavior });
  };

  const handlePageChange = (newPage: number, source: "top" | "bottom" = "bottom") => {
    setPage(newPage);
    if (source === "bottom") {
      shouldScrollTopRef.current = true;
      scrollToTop(true);
    }
  };

  useEffect(() => {
    scrollToTop(true);
  }, [location, categories, jobType, seniority, minSalary, postedTime, visaSponsorship]);

  useEffect(() => {
    if (shouldScrollTopRef.current) {
      scrollToTop(true);
      const frame = requestAnimationFrame(() => {
        shouldScrollTopRef.current = false;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [page, data]);

  const prevIsJdOpenRef = useRef(isJdOpen);
  
  useEffect(() => {
    if (isJdOpen && !prevIsJdOpenRef.current && activeJdJob) {
      setTimeout(() => {
        const activeCard = document.getElementById(`job-card-${activeJdJob.id}`);
        if (activeCard) {
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

  const hasActiveFilters = Boolean(
    debouncedSearchQuery ||
    location ||
    (categories && categories.length > 0) ||
    (jobType && jobType !== "all") ||
    (seniority && seniority !== "all") ||
    minSalary > 0 ||
    (postedTime && postedTime !== "all") ||
    (visaSponsorship && visaSponsorship !== "all") ||
    (workMode && workMode !== "all")
  );

  if (isPending) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center">
        <LoaderDots className="h-8 w-8  " />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="p-4 sm:p-8 flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <h1 className="font-heading text-2xl font-semibold text-text-primary dark:text-white">Sign in to view saved jobs</h1>
        <Link 
          href="/login" 
          className="px-6 py-2 bg-brand-dark text-white rounded-md hover:bg-brand-lime hover:text-[#111827] transition-colors dark:bg-brand-lime dark:text-[#111827]"
        >
          Sign In
        </Link>
      </div>
    );
  }

  // Filter out any locally unsaved jobs (optimistic UI deletion)
  const displayedJobs = (data?.jobs || []).filter(job => !!savedJobIdsMap[job.id]);

  return (
    <section className="py-5 sm:py-7 pb-16 flex-1">
      <div className="container max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-7">
        <div className="flex flex-col gap-1 mb-5">
          <h1 className="font-heading text-[1.45rem] font-semibold text-text-primary dark:text-white">
            Saved Jobs
          </h1>
          <p className="text-[0.95rem] text-text-subtle dark:text-[#A1A1AA]">
            Search, filter, and manage your bookmarked roles.
          </p>
        </div>

        <Suspense fallback={null}>
          <UrlFilterSync variant="saved" />
        </Suspense>
        <SearchFilterBar variant="saved" className="max-w-3xl mb-6" />

        {isLoading ? (
          <div className="flex justify-center py-20">
            <LoaderDots className="w-12 h-12" />
          </div>
        ) : isError ? (
          <div className="text-center text-red-500 py-10 font-bold">
            Failed to load saved jobs. Please try again later.
          </div>
        ) : !isFetching && displayedJobs.length === 0 ? (
          hasActiveFilters ? (
            <div className="flex flex-col items-center justify-center min-h-[30vh] gap-4 border-2 border-dashed border-border-subtle rounded-xl p-8 dark:border-[#2B3042]">
              <p className="text-text-muted dark:text-[#A1A1AA] text-center">
                No saved jobs match your current filters.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[30vh] gap-4 border-2 border-dashed border-border-subtle rounded-xl p-8 dark:border-[#2B3042]">
              <p className="text-text-muted dark:text-[#A1A1AA] text-center">
                You haven&apos;t saved any jobs yet. Browse the job board to find roles that match your skills!
              </p>
              <Link 
                href="/job-hunt" 
                className="px-6 py-2 border-2 border-brand-dark text-brand-dark rounded-md hover:bg-brand-dark hover:text-white transition-colors dark:border-brand-lime dark:text-brand-lime dark:hover:bg-brand-lime dark:hover:text-[#111827]"
              >
                Browse Jobs
              </Link>
            </div>
          )
        ) : (
          <div>
            {isJdOpen && activeJdJob ? (
              /* Split-View Layout: Left List + Right JD Side Panel */
              <div className="flex flex-col lg:flex-row gap-6 items-start pt-1">
                <div className="w-full lg:w-[410px] xl:w-[440px] shrink-0 flex flex-col gap-3">
                  {data && data.total > 0 && (
                    <Pagination
                      currentPage={page}
                      totalPages={data.totalPages || 1}
                      totalResults={data.total || 0}
                      pageSize={24}
                      onPageChange={handlePageChange}
                      position="top"
                      forceCompact={true}
                    />
                  )}

                  <JobGrid 
                    jobs={displayedJobs} 
                    isSplitView={true}
                    activeJobId={activeJdJob.id}
                    onSelectJob={handleSelectJob}
                    isLoading={isFetching && !isLoading}
                    isPremium={true}
                    variant="blue"
                  />

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

                <div className="hidden lg:block lg:flex-1 min-w-0 sticky top-[5.25rem]">
                  <JobDescriptionPanel 
                    job={activeJdJob}
                    onClose={closeJd}
                  />
                </div>

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

                <JobGrid 
                  jobs={displayedJobs} 
                  onSelectJob={handleSelectJob}
                  isLoading={isFetching && !isLoading}
                  isPremium={true}
                  variant="blue"
                />

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

      <FiltersModal totalMatches={data?.total || 0} variant="saved" />
    </section>
  );
}
