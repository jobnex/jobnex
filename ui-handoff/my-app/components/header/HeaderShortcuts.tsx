"use client";

import { memo } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { useJobStore, useAppFilters } from "@/store/useJobStore";

interface HeaderShortcutsProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
}

function HeaderShortcutsComponent({
  containerRef,
  trackRef,
}: HeaderShortcutsProps) {
  const toggleFilterMenu = useJobStore((s) => s.toggleFilterMenu);

  const {
    categories,
    jobType,
    setJobType,
    seniority,
    setSeniority,
    minSalary,
    postedTime,
    setPostedTime,
    visaSponsorship,
    setVisaSponsorship,
    workMode,
    resetFilters,
  } = useAppFilters("default");

  // Calculate active filter count for badge
  let activeFiltersCount = 0;
  if (categories.length > 0) activeFiltersCount++;
  if (jobType && jobType !== "all") activeFiltersCount++;
  if (seniority && seniority !== "all") activeFiltersCount++;
  if (minSalary > 0) activeFiltersCount++;
  if (postedTime && postedTime !== "all") activeFiltersCount++;
  if (visaSponsorship && visaSponsorship !== "all") activeFiltersCount++;
  if (workMode && workMode !== "all") activeFiltersCount++;

  const toggleJobTypeInternship = () => setJobType(jobType === "Internship" ? "all" : "Internship");
  const toggleJobTypeFullTime = () => setJobType(jobType === "Full-time" ? "all" : "Full-time");
  const toggleSeniorityFresher = () => setSeniority(seniority === "fresher" ? "all" : "fresher");
  const toggleSeniorityEntry = () => setSeniority(seniority === "entry-level" ? "all" : "entry-level");
  const toggleVisaSponsored = () => setVisaSponsorship(visaSponsorship === "sponsored" ? "all" : "sponsored");
  const togglePostedPast24Hrs = () => setPostedTime(postedTime === "24h" ? "all" : "24h");

  return (
    <div
      ref={containerRef}
      className="w-full overflow-x-auto no-scrollbar scroll-smooth pb-1 mt-[var(--shortcuts-gap)]"
    >
      <div
        ref={trackRef}
        className="flex items-center gap-[0.5rem] w-max lg:w-full min-w-0 transition-transform duration-0 will-change-transform"
      >
        {/* Filter Button & Dynamic Reset Button */}
        <div className={`flex items-center shrink-0 ${activeFiltersCount > 0 ? "lg:gap-1.5" : ""}`}>
          <button
            type="button"
            onClick={toggleFilterMenu}
            aria-label="Toggle filters"
            title="Toggle filters"
            className="relative inline-flex items-center justify-center font-semibold transition-all duration-200 cursor-pointer select-none border-[1.5px] bg-[#E8F0FE] text-[#1A73E8] border-transparent hover:bg-[#D2E3FC] dark:bg-[#1A2744] dark:text-[#8AB4F8] dark:hover:bg-[#23355A] h-[36px] w-[42px] lg:w-auto px-0 lg:px-3.5 lg:gap-2 rounded-[10px] hover:rounded-[8px] text-xs sm:text-sm"
          >
            <SlidersHorizontal className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline">Filters</span>
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 z-10 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#1A73E8] text-white dark:bg-[#4285F4] dark:text-white border-2 border-white dark:border-[#111216] text-[10px] font-bold leading-none shadow-xs pointer-events-none">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Reset Button (Desktop) */}
          <div
            className={`hidden lg:grid transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              activeFiltersCount > 0 ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0 pointer-events-none"
            }`}
          >
            <div className="overflow-hidden">
              <button
                type="button"
                onClick={resetFilters}
                aria-label="Reset all filters"
                title="Reset all filters"
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-700 transition-colors duration-200 hover:bg-[#E2E6EA] dark:hover:bg-[#2B3042] dark:text-gray-300 cursor-pointer select-none whitespace-nowrap h-[36px] px-2.5 lg:px-3 rounded-[10px]"
              >
                <RotateCcw className="w-3 h-3" strokeWidth={2.2} />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Divider */}
        <div className="hidden lg:block h-5 w-[1px] bg-border-subtle dark:bg-[#2B3042] shrink-0" />

        {/* Quick Filter Shortcut Pills */}
        <button
          type="button"
          onClick={toggleSeniorityFresher}
          className={`inline-flex items-center justify-center h-[36px] px-4 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px] ${
            seniority === "fresher"
              ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs"
              : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
          }`}
        >
          Fresher
        </button>

        <button
          type="button"
          onClick={toggleJobTypeInternship}
          className={`inline-flex items-center justify-center h-[36px] px-4 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px] ${
            jobType === "Internship"
              ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs"
              : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
          }`}
        >
          Internship
        </button>

        <button
          type="button"
          onClick={toggleSeniorityEntry}
          className={`inline-flex items-center justify-center h-[36px] px-4 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px] ${
            seniority === "entry-level"
              ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs"
              : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
          }`}
        >
          Entry-level
        </button>

        <button
          type="button"
          onClick={toggleJobTypeFullTime}
          className={`inline-flex items-center justify-center h-[36px] px-4 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px] ${
            jobType === "Full-time"
              ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs"
              : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
          }`}
        >
          Full-time
        </button>

        <button
          type="button"
          onClick={toggleVisaSponsored}
          className={`inline-flex items-center justify-center h-[36px] px-4 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px] ${
            visaSponsorship === "sponsored"
              ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs"
              : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
          }`}
        >
          Visa Sponsored
        </button>

        <button
          type="button"
          onClick={togglePostedPast24Hrs}
          className={`inline-flex items-center justify-center h-[36px] px-4 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px] ${
            postedTime === "24h"
              ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs"
              : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
          }`}
        >
          Past 24hrs
        </button>
      </div>
    </div>
  );
}

export const HeaderShortcuts = memo(HeaderShortcutsComponent);
