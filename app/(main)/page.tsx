"use client";

import { useEffect, useRef, useCallback, Suspense } from "react";
import { useJobsQuery } from "@/lib/hooks/useJobsQuery";
import { useAppFilters } from "@/store/useJobStore";
import { FiltersModal } from "@/components/FiltersModal";
import { JobBoardView } from "@/components/JobBoardView";
import { UrlFilterSync } from "@/components/UrlFilterSync";
import { DEFAULT_PAGE_SIZE } from "@/lib/job-utils";

export default function Home() {
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
  } = useAppFilters("default");

  const shouldScrollTopRef = useRef(false);

  const { data, isLoading, isError, isFetching } = useJobsQuery({
    debouncedSearchQuery: searchQuery,
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


  // Ensure scroll completes cleanly across page updates
  useEffect(() => {
    if (shouldScrollTopRef.current) {
      scrollToTop(true);
      const frame = requestAnimationFrame(() => {
        shouldScrollTopRef.current = false;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [page, data, scrollToTop]);

  return (
    <section className="pt-2 sm:pt-3 pb-16 flex-1">
      <div className="fluid-container">
        <Suspense fallback={null}>
          <UrlFilterSync />
        </Suspense>

        {isError ? (
          <div className="text-center text-red-500 py-10 font-bold">
            Failed to load jobs. Please try again later.
          </div>
        ) : (
          <JobBoardView
            jobs={data?.jobs || []}
            total={data?.total || 0}
            totalPages={data?.totalPages || 1}
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={handlePageChange}
            isLoading={isLoading}
            isFetching={isFetching}
          />
        )}
      </div>

      <FiltersModal totalMatches={data?.total || 0} />
    </section>
  );
}
