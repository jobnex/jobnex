"use client";

import { useEffect, useRef, Suspense, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { FiltersModal } from "@/components/FiltersModal";
import { JobBoardView } from "@/components/JobBoardView";
import { UrlFilterSync } from "@/components/UrlFilterSync";
import { useJobStore, useAppFilters } from "@/store/useJobStore";
import { authClient } from "@/lib/auth/client";
import { JobsResponse } from "@/types";
import { LoaderDots } from "@/components/ui/LoaderDots";
import Link from "next/link";
import { DEFAULT_PAGE_SIZE } from "@/lib/job-utils";

export default function SavedJobsPage() {
  const {
    searchQuery,
    locationQuery,
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
    resetFilters,
  } = useAppFilters("saved");

  const savedJobIdsMap = useJobStore((s) => s.savedJobIdsMap);
  const { data: session, isPending } = authClient.useSession();
  const shouldScrollTopRef = useRef(false);

  const { data, isLoading, isError, isFetching } = useQuery<JobsResponse>({
    queryKey: [
      "saved-jobs",
      searchQuery,
      searchQuery ? searchBy : "all",
      locationQuery || "",
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
      if (!session) {
        return { jobs: [], total: 0, page: 1, limit: DEFAULT_PAGE_SIZE, totalPages: 0, hasNextPage: false, hasPrevPage: false };
      }
      
      const params = new URLSearchParams();
      if (searchQuery) {
        params.append("keyword", searchQuery);
        if (searchBy && searchBy !== "all") params.append("searchBy", searchBy);
      }
      if (locationQuery) params.append("locationQuery", locationQuery);
      if (location) params.append("location", location);
      if (categories && categories.length > 0) params.append("categories", categories.join(","));
      if (jobType && jobType !== "all") params.append("type", jobType);
      if (seniority && seniority !== "all") params.append("seniority", seniority);
      if (minSalary > 0) params.append("minSalary", minSalary.toString());
      if (postedTime && postedTime !== "all") params.append("postedTime", postedTime);
      if (visaSponsorship && visaSponsorship !== "all") params.append("visaSponsorship", visaSponsorship);
      if (workMode && workMode !== "all") params.append("workMode", workMode);
      params.append("page", page.toString());
      params.append("limit", DEFAULT_PAGE_SIZE.toString());

      const res = await fetch(`/api/jobs/saved?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch saved jobs");
      return res.json();
    },
    enabled: !isPending && !!session?.user,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: 1 * 60 * 1000,
  });

  const scrollToTop = useCallback((smooth = true) => {
    if (typeof window === "undefined") return;
    const behavior = smooth ? "smooth" : "instant";
    window.scrollTo({ top: 0, left: 0, behavior });
  }, []);

  const handlePageChange = useCallback((newPage: number, source: "top" | "bottom" = "bottom") => {
    setPage(newPage);
    if (source === "bottom") {
      shouldScrollTopRef.current = true;
      scrollToTop(true);
    }
  }, [setPage, scrollToTop]);

  useEffect(() => {
    scrollToTop(true);
  }, [location, categories, jobType, seniority, minSalary, postedTime, visaSponsorship, scrollToTop]);

  useEffect(() => {
    if (shouldScrollTopRef.current) {
      scrollToTop(true);
      const frame = requestAnimationFrame(() => {
        shouldScrollTopRef.current = false;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [page, data, scrollToTop]);

  const hasActiveFilters = Boolean(
    searchQuery ||
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
        <LoaderDots className="h-8 w-8" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="p-4 sm:p-8 flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <h1 className="font-heading text-2xl font-semibold text-text-primary dark:text-white">
          Sign in to view saved jobs
        </h1>
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
  const displayedJobs = (data?.jobs || []).filter((job) => !!savedJobIdsMap[job.id]);

  return (
    <section className="py-[var(--space-m)] pb-16 flex-1">
      <div className="fluid-container">
        <div className="flex flex-col gap-1 mb-5">
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-text-primary dark:text-white">
            Saved Jobs
          </h1>
          <p className="text-sm sm:text-base text-text-subtle dark:text-[#A1A1AA]">
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
              <button
                onClick={resetFilters}
                className="px-6 py-2 border-2 border-brand-dark text-brand-dark rounded-md hover:bg-brand-dark hover:text-white transition-colors dark:border-brand-lime dark:text-brand-lime dark:hover:bg-brand-lime dark:hover:text-[#111827] cursor-pointer font-bold text-sm"
              >
                Reset Filters
              </button>
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
          <JobBoardView
            jobs={displayedJobs}
            total={data?.total || 0}
            totalPages={data?.totalPages || 1}
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={handlePageChange}
            onResetFilters={resetFilters}
            isLoading={isLoading}
            isFetching={isFetching}
            isPremium={true}
            variant="blue"
          />
        )}
      </div>

      <FiltersModal totalMatches={data?.total || 0} variant="saved" />
    </section>
  );
}
