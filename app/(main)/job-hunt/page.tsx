"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { JobGrid } from "@/components/JobGrid";
import { AnimatedTabs } from "@/components/AnimatedTabs";
import { Search, Filter, Plus, RefreshCw, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { JobDescriptionPanel } from "@/components/JobDescriptionPanel";
import { useJobStore } from "@/store/useJobStore";
import { authClient } from "@/lib/auth/client";
import { Job } from "@/types";

export default function JobHuntPage() {
  const { data: sessionData } = authClient.useSession();
  const userId = sessionData?.user?.id;

  const [mounted, setMounted] = useState<boolean>(false);
  const [jobsData, setJobsData] = useState<Job[]>([]);
  const [requestedJobIds, setRequestedJobIds] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  const [activeTab, setActiveTab] = useState<"jobs" | "requested">("jobs");
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [curatedJdJob, setCuratedJdJob] = useState<Job | null>(null);
  const scrollPosRef = useRef<number>(0);

  const { closeJd } = useJobStore();

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

  // Load requested applications to partition them
  const fetchApplications = useCallback(async () => {
    try {
      const response = await fetch("/api/job-hunt/applications");
      if (response.ok) {
        const data = await response.json();
        setRequestedJobIds((data.jobs || []).map((job: Job) => job.id));
      }
    } catch {
      // Non-fatal if applications cannot be loaded
    }
  }, []);

  // Fetch live personalized matched jobs (powered by GCP Cloud Run backend)
  const fetchMatchedJobs = useCallback(async (cursorParam?: string | null) => {
    const isInitial = !cursorParam;
    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const url = new URL("/api/jobs/matched", window.location.origin);
      url.searchParams.set("limit", "24");
      url.searchParams.set("mode", "balanced");
      if (userId) {
        url.searchParams.set("userId", userId);
      }
      if (cursorParam) {
        url.searchParams.set("cursor", cursorParam);
      }

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const newJobs: Job[] = data.jobs || [];

      if (isInitial) {
        setJobsData(newJobs);
      } else {
        setJobsData(prev => {
          const existingIds = new Set(prev.map(j => j.id));
          const deduped = newJobs.filter(j => !existingIds.has(j.id));
          return [...prev, ...deduped];
        });
      }

      setNextCursor(data.nextCursor || null);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      console.error("Error loading matched jobs:", err);
      toast.error("Could not load personalized jobs");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchApplications();
    fetchMatchedJobs();
  }, [fetchApplications, fetchMatchedJobs]);

  const handleTabChange = useCallback((tabId: string) => {
    const nextTab = tabId as "jobs" | "requested";
    if (nextTab !== activeTab) {
      scrollPosRef.current = 0;
      setCuratedJdJob(null);
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

  const jobs = useMemo(() => {
    if (!debouncedSearchQuery) return jobsData;
    const q = debouncedSearchQuery.toLowerCase();
    return jobsData.filter(
      (job) => job.jobRoleTitle.toLowerCase().includes(q) || job.company.toLowerCase().includes(q)
    );
  }, [debouncedSearchQuery, jobsData]);

  const { standardJobs, requestedJobs } = useMemo(() => ({
    standardJobs: jobs.filter(job => !requestedJobIds.includes(job.id)),
    requestedJobs: jobs.filter(job => requestedJobIds.includes(job.id)),
  }), [jobs, requestedJobIds]);

  const displayedJobs = activeTab === "jobs" ? standardJobs : requestedJobs;

  return (
    <div className="p-4 sm:p-8 flex flex-col gap-6 h-full">
      <div className="flex flex-col gap-5">
        <h1 className="font-heading text-[1.45rem] font-semibold text-text-primary -mt-2 dark:text-white">
          Curated For You
        </h1>
        
        {/* Search & Action Buttons */}
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-text-subtle transition-colors group-focus-within:text-text-primary dark:text-[#A1A1AA]" />
            <input
              type="text"
              className="w-full pl-[2.75rem] pr-10 py-[0.7rem] bg-bg-input border border-border-input rounded-lg focus:border-text-primary focus:bg-white outline-none text-[0.95rem] font-medium text-text-primary placeholder:text-text-subtle transition-all duration-200 dark:bg-[#151720] dark:border-[#2B3042] dark:focus:border-[#ACEE5F] dark:focus:shadow-[0_0_0_1px_#ACEE5F,0_2px_8px_rgba(0,0,0,0.3)] dark:focus:bg-[#1A1C26] dark:text-white"
              placeholder="Search premium roles..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (curatedJdJob) {
                  scrollPosRef.current = 0;
                  setCuratedJdJob(null);
                }
              }}
            />
            {searchQuery && (
              <button 
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  if (curatedJdJob) {
                    scrollPosRef.current = 0;
                    setCuratedJdJob(null);
                  }
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-bg-tag dark:hover:text-white dark:hover:bg-[#2B3042] transition-colors cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          
          <div className="flex gap-2 items-center w-full md:w-auto shrink-0">
             <button aria-label="Filter" className="p-[0.65rem] rounded-md border border-border-input bg-bg-card text-text-muted hover:text-text-primary transition-colors cursor-pointer dark:bg-[#151720] dark:border-[#2B3042]">
               <Filter className="w-5 h-5" />
             </button>
             <button className="inline-flex items-center gap-2 px-4 py-[0.65rem] rounded-md font-bold text-[0.88rem] bg-brand-dark text-white shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-brand-lime hover:text-[#111827] cursor-pointer active:translate-y-[1px] dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white dark:hover:text-[#111827]">
               <Plus className="w-[16px] h-[16px]" strokeWidth={2.5} />
               <span>Add Job</span>
             </button>
             <button 
               onClick={() => fetchMatchedJobs()}
               disabled={mounted ? isLoading : false}
               title="Refresh live recommendations from GCP"
               className="inline-flex items-center gap-2 px-4 py-[0.65rem] rounded-md font-bold text-[0.88rem] border-[1.5px] border-brand-dark text-brand-dark bg-transparent hover:bg-brand-dark/5 transition-all hover:-translate-y-[1px] cursor-pointer active:translate-y-[1px] disabled:opacity-50 dark:border-brand-lime dark:text-brand-lime dark:hover:bg-brand-lime/10"
             >
               <RefreshCw className={`w-[16px] h-[16px] ${mounted && isLoading ? "animate-spin" : ""}`} strokeWidth={2.5} />
               <span>Fetch Jobs</span>
             </button>
          </div>
        </div>

        <AnimatedTabs 
          activeTab={activeTab} 
          onTabChange={handleTabChange}
          tabs={[
            { id: "jobs", label: "Jobs", count: displayedJobs.length },
            { id: "requested", label: "Requested", count: requestedJobs.length }
          ]} 
        />
      </div>

      <div className="flex-1 overflow-hidden -mx-2 -mt-2 p-2 pb-10">
        {curatedJdJob ? (
          <div className="w-full h-[calc(100vh-12rem)] min-h-[600px] animate-in fade-in duration-200">
            <JobDescriptionPanel 
              job={curatedJdJob}
              onClose={handleCloseJd}
            />
          </div>
        ) : (
          <div 
            key={activeTab}
            className={`p-2 ${
              direction === "right" ? "animate-tab-slide-right" : "animate-tab-slide-left"
            }`}
          >
            <JobGrid
              jobs={displayedJobs}
              twoColumns={true}
              isPremium={true}
              variant={activeTab === "jobs" ? "emerald" : "purple"}
              isRequested={activeTab === "requested"}
              isLoading={!mounted || (isLoading && jobsData.length === 0)}
              skeletonCount={12}
              onSelectJob={handleSelectJob}
            />

            {/* Keyset Infinite Scroll Load More */}
            {activeTab === "jobs" && hasMore && (
              <div className="flex justify-center items-center pt-8 pb-4">
                <button
                  onClick={() => fetchMatchedJobs(nextCursor)}
                  disabled={isLoadingMore}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold border-[1.5px] border-border-color bg-bg-card text-text-primary shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all active:translate-y-0 cursor-pointer disabled:opacity-50 dark:bg-[#151720] dark:border-[#2B3042] dark:hover:border-[#ACEE5F]"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-brand-dark dark:text-brand-lime" />
                      <span>Loading more recommendations...</span>
                    </>
                  ) : (
                    <span>Load More Jobs</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
