"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { JobGrid } from "@/components/JobGrid";
import { AnimatedTabs } from "@/components/AnimatedTabs";
import { Pagination } from "@/components/Pagination";
import { Search, Filter, Plus, RefreshCw, X } from "lucide-react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useMatchedJobsQuery } from "@/lib/hooks/useMatchedJobsQuery";
import { JobDescriptionPanel } from "@/components/JobDescriptionPanel";
import { useJobStore } from "@/store/useJobStore";
import { Job } from "@/types";
import { DEFAULT_PAGE_SIZE } from "@/lib/job-utils";
import { useRouter } from "next/navigation";
import type { PostedWithin, CuratedSort } from "@/lib/db/job-matching";
import { useQueryClient } from "@tanstack/react-query";

export default function JobHuntPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  const [activeTab, setActiveTab] = useState<"jobs" | "requested">("jobs");
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [page, setPage] = useState(1);
  const [postedWithin, setPostedWithin] = useState<PostedWithin>("24h");
  const [sort, setSort] = useState<CuratedSort>("newest");
  const [curatedJdJob, setCuratedJdJob] = useState<Job | null>(null);
  const scrollPosRef = useRef<number>(0);
  const shouldScrollTopRef = useRef<boolean>(false);

  const closeJd = useJobStore((s) => s.closeJd);

  // TanStack React Query against /api/jobs/matched
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useMatchedJobsQuery({
    page,
    debouncedSearchQuery,
    activeTab,
    limit: DEFAULT_PAGE_SIZE,
    postedWithin,
    sort,
  });

  // Preserve the matched jobs count so the tab indicator remains stable across tab switches
  const [savedJobsCount, setSavedJobsCount] = useState<number>(0);
  useEffect(() => {
    if (activeTab === "jobs" && data?.total !== undefined) {
      setSavedJobsCount(data.total);
    }
  }, [activeTab, data?.total]);

  // Reset any lingering global JD state when entering or leaving the curated section
  useEffect(() => {
    closeJd();
    return () => {
      closeJd();
    };
  }, [closeJd]);

  // Ensure window is scrolled to top whenever a curated JD opens
  useEffect(() => {
    if (curatedJdJob && typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" });
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

  const handleTabChange = useCallback((tabId: string) => {
    const nextTab = tabId as "jobs" | "requested";
    if (nextTab !== activeTab) {
      scrollPosRef.current = 0;
      setCuratedJdJob(null);
      setPage(1);
      setDirection(nextTab === "requested" ? "right" : "left");
      setActiveTab(nextTab);
    }
  }, [activeTab]);

  const handleSelectJob = useCallback((job: Job) => {
    scrollPosRef.current = typeof window !== "undefined" ? window.scrollY : 0;
    setCuratedJdJob(job);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, []);

  const handleCloseJd = useCallback(() => {
    const prevY = scrollPosRef.current;
    setCuratedJdJob(null);
    if (typeof window !== "undefined" && prevY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: prevY, behavior: "instant" });
      });
    }
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPage(1);
    if (curatedJdJob) {
      scrollPosRef.current = 0;
      setCuratedJdJob(null);
    }
  }, [curatedJdJob]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setPage(1);
    if (curatedJdJob) {
      scrollPosRef.current = 0;
      setCuratedJdJob(null);
    }
  }, [curatedJdJob]);

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setPage(1);
    setPostedWithin("24h");
    setSort("newest");
  }, []);

  // A rolling window can shrink between refreshes; return to the last valid page.
  useEffect(() => {
    if (data && !isPlaceholderData && page > Math.max(1, data.totalPages)) {
      setPage(Math.max(1, data.totalPages));
    }
  }, [data, isPlaceholderData, page]);

  const jobsTabCount = activeTab === "jobs" ? (data?.total ?? 0) : savedJobsCount;
  const requestedTabCount = data?.requestedCount ?? 0;

  return (
    <div className="flex flex-col gap-6 h-full w-full max-w-full">
      <div className="flex flex-col gap-5">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-text-primary -mt-2 dark:text-white">
          Curated For You
        </h1>
        
        {/* Search & Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-center">
          <div className="relative flex-1 w-full group">
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
          
          <div className="flex gap-2 items-center w-full sm:w-auto shrink-0 justify-between sm:justify-start flex-wrap">
             <button 
               type="button"
               onClick={() => router.push("/job-hunt/manage")}
               aria-label="Manage Preferences & Filters" 
               className="p-[0.65rem] rounded-md border border-border-input bg-bg-card text-text-muted hover:text-text-primary transition-colors cursor-pointer dark:bg-[#151720] dark:border-[#2B3042]"
               title="Manage Preferences"
             >
               <Filter className="w-5 h-5" />
             </button>
             <button 
               type="button"
               onClick={() => router.push("/")}
               className="inline-flex items-center gap-2 px-4 py-[0.65rem] rounded-md font-bold text-xs sm:text-sm bg-brand-dark text-white shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-brand-lime hover:text-[#111827] cursor-pointer active:translate-y-[1px] dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white dark:hover:text-[#111827]"
             >
               <Plus className="w-[16px] h-[16px]" strokeWidth={2.5} />
               <span>Add Job</span>
             </button>
             <button 
               type="button"
               onClick={() => { setPage(1); void queryClient.invalidateQueries({ queryKey: ["matched-jobs"] }); }}
               className="inline-flex items-center gap-2 px-4 py-[0.65rem] rounded-md font-bold text-[0.88rem] border-[1.5px] border-brand-dark text-brand-dark bg-transparent hover:bg-brand-dark/5 transition-all hover:-translate-y-[1px] cursor-pointer active:translate-y-[1px] dark:border-brand-lime dark:text-brand-lime dark:hover:bg-brand-lime/10"
             >
               <RefreshCw className={`w-[16px] h-[16px] ${isFetching ? "animate-spin" : ""}`} strokeWidth={2.5} />
               <span>Fetch Jobs</span>
             </button>
          </div>
        </div>

        {activeTab === "jobs" && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
            <label className="flex items-center gap-2">
              Added to Joberry
              <select aria-label="Curated jobs date window" value={postedWithin}
                onChange={(e) => { setPostedWithin(e.target.value as PostedWithin); setPage(1); setCuratedJdJob(null); }}
                className="rounded-md border border-border-input bg-bg-card px-3 py-2 text-text-primary dark:bg-[#151720] dark:text-white">
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="all">Any time</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Sort
              <select aria-label="Curated jobs sort order" value={sort}
                onChange={(e) => { setSort(e.target.value as CuratedSort); setPage(1); setCuratedJdJob(null); }}
                className="rounded-md border border-border-input bg-bg-card px-3 py-2 text-text-primary dark:bg-[#151720] dark:text-white">
                <option value="newest">Newest first</option>
                <option value="match">Best match</option>
              </select>
            </label>
            <span>Matches your role, location, level, and job-type preferences. Updates every minute.</span>
          </div>
        )}

        <AnimatedTabs 
          activeTab={activeTab} 
          onTabChange={handleTabChange}
          tabs={[
            { id: "jobs", label: "Jobs", count: jobsTabCount },
            { id: "requested", label: "Requested", count: requestedTabCount }
          ]} 
        />
      </div>

      <div className="flex-1 overflow-hidden -mx-2 -mt-2 p-2 pb-10">
        {curatedJdJob ? (
          <div className="w-full h-[calc(100dvh-10rem)] md:h-[calc(100vh-12rem)] min-h-[480px] sm:min-h-[600px] animate-in fade-in duration-200">
            <JobDescriptionPanel 
              job={curatedJdJob}
              onClose={handleCloseJd}
            />
          </div>
        ) : (
          <div 
            key={activeTab}
            className={`p-2 flex flex-col gap-4 ${
              direction === "right" ? "animate-tab-slide-right" : "animate-tab-slide-left"
            }`}
          >
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

            {error ? (
              <div role="alert" className="rounded-lg border border-border-input bg-bg-card p-6 text-text-primary">
                <p>{error.message}</p>
                <button type="button" className="mt-3 underline" onClick={() => void refetch()}>Retry</button>
              </div>
            ) : !isLoading && data?.jobs.length === 0 && activeTab === "jobs" ? (
              <div className="rounded-lg border border-border-input bg-bg-card p-6 text-text-primary">
                <p>No matching roles {postedWithin === "24h" ? "added in the last 24 hours" : postedWithin === "7d" ? "added in the last 7 days" : "found"}. Your preferences still apply.</p>
                {postedWithin !== "all" && (
                  <button type="button" className="mt-3 underline" onClick={() => { setPostedWithin(postedWithin === "24h" ? "7d" : "all"); setPage(1); }}>
                    {postedWithin === "24h" ? "Check the last 7 days" : "Check any time"}
                  </button>
                )}
              </div>
            ) : (
            <JobGrid
              jobs={data?.jobs || []}
              twoColumns={true}
              isPremium={true}
              variant={activeTab === "jobs" ? "emerald" : "purple"}
              isRequested={activeTab === "requested"}
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
