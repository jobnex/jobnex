"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { JobGrid } from "@/components/JobGrid";
import { Pagination } from "@/components/Pagination";
import { Search, SlidersHorizontal, ArrowUpDown, X, Check, AlertCircle } from "lucide-react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useMatchedJobsQuery } from "@/lib/hooks/useMatchedJobsQuery";
import { JobDescriptionPanel } from "@/components/JobDescriptionPanel";
import { useJobStore } from "@/store/useJobStore";
import { Job } from "@/types";
import { DEFAULT_PAGE_SIZE } from "@/lib/job-utils";
import { JobHuntMobileMenuButton } from "@/components/JobHuntSidebar";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/utils/scrollLock";
import type { PostedWithin, CuratedSort } from "@/lib/db/job-matching";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";

export default function JobHuntPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  const [page, setPage] = useState(1);
  const [postedWithin, setPostedWithin] = useState<PostedWithin>("all");
  const [sort, setSort] = useState<CuratedSort>("match");

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);

  const filterMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(filterMenuRef, () => setIsFilterOpen(false), isFilterOpen);
  useClickOutside(sortMenuRef, () => setIsSortOpen(false), isSortOpen);
  useEscapeKey(() => setIsFilterOpen(false), isFilterOpen);
  useEscapeKey(() => setIsSortOpen(false), isSortOpen);

  const [curatedJdJob, setCuratedJdJob] = useState<Job | null>(null);
  const scrollPosRef = useRef<number>(0);
  const shouldScrollTopRef = useRef<boolean>(false);

  const openJd = useJobStore((s) => s.openJd);
  const closeJd = useJobStore((s) => s.closeJd);

  // TanStack React Query against /api/jobs/matched
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useMatchedJobsQuery({
    page,
    debouncedSearchQuery,
    postedWithin,
    sort,
    limit: DEFAULT_PAGE_SIZE,
  });

  // Reset any lingering global JD state when entering or leaving the curated section
  useEffect(() => {
    closeJd();
    return () => {
      closeJd();
    };
  }, [closeJd]);

  // Lock body scroll on mobile / tablet when curated JD is open full-screen
  useEffect(() => {
    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
    if (curatedJdJob && isMobileOrTablet) {
      lockBodyScroll();
      return () => {
        unlockBodyScroll();
      };
    }
  }, [curatedJdJob]);

  // Ensure window is smoothly scrolled to top whenever a curated JD opens on desktop
  useEffect(() => {
    if (curatedJdJob && typeof window !== "undefined" && window.innerWidth >= 1024) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [curatedJdJob]);

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
  }, [scrollToTop]);

  // Ensure smooth scroll completion on page data change
  useEffect(() => {
    if (shouldScrollTopRef.current) {
      scrollToTop(true);
      const frame = requestAnimationFrame(() => {
        shouldScrollTopRef.current = false;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [page, data, scrollToTop]);

  // A rolling window can shrink between refreshes; return to the last valid page
  useEffect(() => {
    if (data && !isPlaceholderData && page > Math.max(1, data.totalPages)) {
      setPage(Math.max(1, data.totalPages));
    }
  }, [data, isPlaceholderData, page]);

  const handleSelectJob = useCallback((job: Job) => {
    scrollPosRef.current = typeof window !== "undefined" ? window.scrollY : 0;
    setCuratedJdJob(job);
    openJd(job);
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [openJd]);

  const handleCloseJd = useCallback(() => {
    const prevY = scrollPosRef.current;
    setCuratedJdJob(null);
    closeJd();
    if (typeof window !== "undefined" && prevY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: prevY, behavior: "smooth" });
      });
    }
  }, [closeJd]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPage(1);
    if (curatedJdJob) {
      scrollPosRef.current = 0;
      setCuratedJdJob(null);
      closeJd();
    }
  }, [curatedJdJob, closeJd]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setPage(1);
    if (curatedJdJob) {
      scrollPosRef.current = 0;
      setCuratedJdJob(null);
      closeJd();
    }
  }, [curatedJdJob, closeJd]);

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setPage(1);
    setPostedWithin("all");
    setSort("match");
    if (curatedJdJob) {
      scrollPosRef.current = 0;
      setCuratedJdJob(null);
      closeJd();
    }
  }, [curatedJdJob, closeJd]);

  return (
    <div className={`flex flex-col ${curatedJdJob ? "gap-0" : "gap-6"} h-full w-full max-w-full transition-[gap] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`}>
      <div className={`flex flex-col ${curatedJdJob ? "gap-0" : "gap-5"} transition-[gap] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`}>
        {/* Title Row: Smoothly slides/scrolls UP and collapses when JD panel opens to reclaim full vertical space */}
        <div
          className={`transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden will-change-[transform,opacity,max-height,margin] ${
            curatedJdJob
              ? "-translate-y-full opacity-0 max-h-0 pointer-events-none mb-0"
              : "translate-y-0 opacity-100 max-h-24 mb-0"
          }`}
        >
          <div className="flex items-center justify-between gap-3 pt-1.5 pb-1">
            <h1 className="font-heading text-2xl sm:text-3xl font-semibold leading-tight text-text-primary dark:text-white">
              Curated For You
            </h1>
            <JobHuntMobileMenuButton />
          </div>
        </div>

        {/* Search & Action Buttons: Removed when JD panel is open to move JD panel up */}
        {!curatedJdJob && (
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
            {/* Ergonomically Constrained Search Bar */}
            <div className="relative w-full sm:max-w-md lg:max-w-lg group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-text-subtle transition-colors group-focus-within:text-text-primary dark:text-[#A1A1AA]" />
              <input
                type="text"
                className="w-full pl-[2.75rem] pr-10 py-[0.7rem] bg-bg-input border border-border-input rounded-lg focus:border-text-primary focus:bg-white outline-none text-sm sm:text-base font-medium text-text-primary placeholder:text-text-subtle transition-all duration-200 dark:bg-[#151720] dark:border-[#2B3042] dark:focus:border-[#ACEE5F] dark:focus:shadow-[0_0_0_1px_#ACEE5F,0_2px_8px_rgba(0,0,0,0.3)] dark:focus:bg-[#1A1C26] dark:text-white"
                placeholder="Search premium roles..."
                value={searchQuery}
                onChange={handleSearchChange}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-bg-tag dark:hover:text-white dark:hover:bg-[#2B3042] transition-colors cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter & Sort Buttons in Immediate Field of View */}
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
              {/* Date Posted Button */}
              <div className="relative" ref={filterMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsFilterOpen((prev) => !prev);
                    setIsSortOpen(false);
                  }}
                  aria-label="Filter by date posted"
                  aria-expanded={isFilterOpen}
                  className="h-[44px] px-3.5 sm:px-4 rounded-lg border border-border-input bg-bg-card hover:bg-bg-tag hover:border-text-primary/30 dark:bg-[#151720] dark:border-[#2B3042] dark:hover:bg-[#1E212D] text-text-primary dark:text-white inline-flex items-center gap-2 font-medium text-xs sm:text-sm transition-all cursor-pointer select-none active:scale-95"
                  title="Date Posted"
                >
                  <SlidersHorizontal className="w-4 h-4 shrink-0" />
                  <span>Date Posted</span>
                </button>

                {isFilterOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 sm:left-0 top-[calc(100%+8px)] z-50 min-w-[280px] sm:min-w-[320px] p-4 sm:p-5 rounded-[20px] border border-border-input bg-white dark:bg-[#1A1C24] shadow-2xl animate-in fade-in zoom-in-95 duration-150"
                  >
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-[#1F222E]">
                      <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-tight">
                        Date Posted
                      </h3>
                    </div>
                    <div className="flex flex-col gap-2">
                      {[
                        { id: "all", label: "Any time" },
                        { id: "24h", label: "Last 24 hours" },
                        { id: "7d", label: "Last 7 days" },
                      ].map((option) => {
                        const isSelected = postedWithin === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setPostedWithin(option.id as PostedWithin);
                              setPage(1);
                              setIsFilterOpen(false);
                            }}
                            className={`flex items-center justify-between w-full px-4 py-2.5 text-xs sm:text-sm transition-all duration-200 cursor-pointer select-none border-[1.5px] ${
                              isSelected
                                ? "rounded-[12px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs"
                                : "rounded-[16px] hover:rounded-[12px] bg-[#EDF0F3] text-gray-800 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
                            }`}
                          >
                            <span>{option.label}</span>
                            {isSelected && (
                              <Check className="w-4 h-4 shrink-0 text-white dark:text-black" strokeWidth={2.5} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Sort by Button */}
              <div className="relative" ref={sortMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsSortOpen((prev) => !prev);
                    setIsFilterOpen(false);
                  }}
                  aria-label="Sort curated jobs"
                  aria-expanded={isSortOpen}
                  className="h-[44px] px-3.5 sm:px-4 rounded-lg border border-border-input bg-bg-card hover:bg-bg-tag hover:border-text-primary/30 dark:bg-[#151720] dark:border-[#2B3042] dark:hover:bg-[#1E212D] text-text-primary dark:text-white inline-flex items-center gap-2 font-medium text-xs sm:text-sm transition-all cursor-pointer select-none active:scale-95"
                  title="Sort by"
                >
                  <ArrowUpDown className="w-4 h-4 shrink-0" strokeWidth={2} />
                  <span>Sort by</span>
                </button>

                {isSortOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 sm:left-0 top-[calc(100%+8px)] z-50 min-w-[260px] sm:min-w-[290px] p-4 sm:p-5 rounded-[20px] border border-border-input bg-white dark:bg-[#1A1C24] shadow-2xl animate-in fade-in zoom-in-95 duration-150"
                  >
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-[#1F222E]">
                      <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-tight">
                        Sort by
                      </h3>
                    </div>
                    <div className="flex flex-col gap-2">
                      {[
                        { id: "match", label: "Best match" },
                        { id: "newest", label: "Newest first" },
                      ].map((option) => {
                        const isSelected = sort === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setSort(option.id as CuratedSort);
                              setPage(1);
                              setIsSortOpen(false);
                            }}
                            className={`flex items-center justify-between w-full px-4 py-2.5 text-xs sm:text-sm transition-all duration-200 cursor-pointer select-none border-[1.5px] ${
                              isSelected
                                ? "rounded-[12px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs"
                                : "rounded-[16px] hover:rounded-[12px] bg-[#EDF0F3] text-gray-800 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
                            }`}
                          >
                            <span>{option.label}</span>
                            {isSelected && (
                              <Check className="w-4 h-4 shrink-0 text-white dark:text-black" strokeWidth={2.5} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      <div className={`flex-1 overflow-hidden -mx-2 -mt-2 p-2 ${curatedJdJob ? "pb-2" : "pb-10"}`}>
        {curatedJdJob ? (
          <div className="max-lg:fixed max-lg:inset-0 max-lg:z-[150] max-lg:w-full max-lg:h-[100dvh] max-lg:bg-bg-page dark:max-lg:bg-[#111216] lg:w-full lg:h-[calc(100vh-6.5rem)] min-h-[500px] overscroll-contain animate-in fade-in duration-200">
            <JobDescriptionPanel
              job={curatedJdJob}
              onClose={handleCloseJd}
              isMobilePage={true}
            />
          </div>
        ) : (
          <div className="p-2 flex flex-col gap-4">
            {/* Top Pagination Bar matching Job Board */}
            {data && data.total > 0 && (
              <Pagination
                currentPage={page}
                totalPages={data.totalPages || 1}
                totalResults={data.total || 0}
                pageSize={DEFAULT_PAGE_SIZE}
                onPageChange={handlePageChange}
                position="top"
              />
            )}

            {/* Error State */}
            {error ? (
              <div role="alert" className="flex flex-col items-center justify-center text-center p-8 bg-bg-card border-[1.5px] border-border-input rounded-card shadow-sm w-full dark:bg-[#151720] dark:border-[#2B3042]">
                <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
                <h3 className="text-lg font-bold text-text-primary dark:text-white mb-1">Unable to load curated jobs</h3>
                <p className="text-sm text-text-muted mb-4 max-w-[420px]">{error.message}</p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="inline-flex items-center px-4 py-2 text-xs sm:text-sm font-bold bg-brand-dark text-white rounded-md hover:bg-brand-lime hover:text-[#111827] cursor-pointer transition-colors dark:bg-brand-lime dark:text-[#111827]"
                >
                  Retry
                </button>
              </div>
            ) : !isLoading && data?.jobs.length === 0 ? (
              /* Contextual Empty State with 1-click fallback widening */
              <div className="flex flex-col items-center justify-center text-center p-8 bg-bg-card border-[1.5px] border-border-input rounded-card shadow-sm w-full dark:bg-[#151720] dark:border-[#2B3042]">
                <SlidersHorizontal className="w-10 h-10 text-text-subtle mb-3" />
                <h3 className="text-lg font-bold text-text-primary dark:text-white mb-1">
                  No matching roles {postedWithin === "24h" ? "added in the last 24 hours" : postedWithin === "7d" ? "added in the last 7 days" : "found"}
                </h3>
                <p className="text-sm text-text-muted mb-4 max-w-[420px]">
                  {postedWithin === "24h"
                    ? "Try expanding your date window to see recently added positions that match your preferences."
                    : postedWithin === "7d"
                    ? "Try expanding to all time to discover all open matching opportunities."
                    : "We couldn't find any opportunities matching your criteria. Try adjusting your preferences or search keyword."}
                </p>
                {postedWithin !== "all" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPostedWithin(postedWithin === "24h" ? "7d" : "all");
                      setPage(1);
                    }}
                    className="inline-flex items-center px-4 py-2 text-xs sm:text-sm font-bold bg-brand-dark text-white rounded-md hover:bg-brand-lime hover:text-[#111827] cursor-pointer transition-colors dark:bg-brand-lime dark:text-[#111827]"
                  >
                    {postedWithin === "24h" ? "Check the last 7 days" : "Check any time"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center px-4 py-2 text-xs sm:text-sm font-bold bg-brand-dark text-white rounded-md hover:bg-brand-lime hover:text-[#111827] cursor-pointer transition-colors dark:bg-brand-lime dark:text-[#111827]"
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
            ) : (
              /* Main Job Cards Grid */
              <JobGrid
                jobs={data?.jobs || []}
                twoColumns={true}
                isPremium={true}
                variant="purple"
                onSelectJob={handleSelectJob}
                isLoading={isLoading}
                onResetFilters={handleResetFilters}
              />
            )}

            {/* Bottom Pagination Bar matching Job Board */}
            {data && data.total > 0 && (
              <Pagination
                currentPage={page}
                totalPages={data.totalPages || 1}
                totalResults={data.total || 0}
                pageSize={DEFAULT_PAGE_SIZE}
                onPageChange={handlePageChange}
                position="bottom"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
