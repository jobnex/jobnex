"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { JobGrid } from "@/components/JobGrid";
import { AnimatedTabs } from "@/components/AnimatedTabs";
import { Search, Filter, Plus, RefreshCw, X } from "lucide-react";
import { getCuratedPartition, jobsData } from "@/data/jobs";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { JobDescriptionPanel } from "@/components/JobDescriptionPanel";
import { useJobStore } from "@/store/useJobStore";
import { Job } from "@/types";

export default function JobHuntPage() {
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
  }, [debouncedSearchQuery]);

  const { standardJobs, requestedJobs } = useMemo(() => getCuratedPartition(jobs), [jobs]);

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
             <button className="inline-flex items-center gap-2 px-4 py-[0.65rem] rounded-md font-bold text-[0.88rem] border-[1.5px] border-brand-dark text-brand-dark bg-transparent hover:bg-brand-dark/5 transition-all hover:-translate-y-[1px] cursor-pointer active:translate-y-[1px] dark:border-brand-lime dark:text-brand-lime dark:hover:bg-brand-lime/10">
               <RefreshCw className="w-[16px] h-[16px]" strokeWidth={2.5} />
               <span>Fetch Jobs</span>
             </button>
          </div>
        </div>

        <AnimatedTabs 
          activeTab={activeTab} 
          onTabChange={handleTabChange}
          tabs={[
            { id: "jobs", label: "Jobs", count: standardJobs.length },
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
              onSelectJob={handleSelectJob}
            />
          </div>
        )}
      </div>
    </div>
  );
}
