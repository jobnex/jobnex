"use client";

import { useJobStore, useAppFilters } from "@/store/useJobStore";
import { Search, SlidersHorizontal, X, RotateCcw, Building2, AlignLeft, MapPin } from "lucide-react";
import { LocationDropdown } from "./LocationDropdown";
import { useState, useRef, useEffect } from "react";

interface SearchFilterBarProps {
  variant?: "default" | "saved";
  className?: string;
}

export function SearchFilterBar({ variant = "default", className = "" }: SearchFilterBarProps) {
  const { toggleFilterMenu } = useJobStore();
  const {
    searchQuery,
    setSearchQuery,
    searchBy,
    setSearchBy,
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
    page,
    resetFilters,
  } = useAppFilters(variant);

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Sync prop to local state
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSearch(e.target.value);
    setSearchQuery(e.target.value);
  };

  const handleClear = () => {
    setLocalSearch("");
    setSearchQuery("");
    setIsSearchExpanded(false);
  };

  // Close search expansion on outside click
  const searchQueryRef = useRef(searchQuery);
  const searchByRef = useRef(searchBy);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
    searchByRef.current = searchBy;
  }, [searchQuery, searchBy]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchExpanded(false);
        // Reset the active chip if the user clicks away without typing anything
        if (!searchQueryRef.current && searchByRef.current !== "all") {
          setSearchBy("all");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setSearchBy]);

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

  const searchOptions = [
    { id: "title", label: "Job Title", icon: Search },
    { id: "company", label: "Company", icon: Building2 },
    { id: "description", label: "Description", icon: AlignLeft },
    { id: "location", label: "Location", icon: MapPin },
  ];

  const renderFilterResetBlock = () => (
    <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
      <button
        type="button"
        onClick={toggleFilterMenu}
        aria-label="Toggle filters"
        className={`inline-flex items-center gap-2 font-semibold transition-all duration-200 cursor-pointer select-none border-[1.5px] ${
          activeFiltersCount > 0
            ? "bg-brand-dark text-white border-brand-dark hover:bg-black hover:border-black dark:bg-white dark:text-black dark:border-white dark:hover:bg-gray-100"
            : "bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042]"
        } ${variant === 'saved' ? 'h-[48px] px-5 rounded-[12px] text-[0.95rem]' : 'h-[36px] px-3.5 rounded-[10px] hover:rounded-[8px] text-[0.875rem]'}`}
      >
        <SlidersHorizontal className="w-4 h-4" />
        <div className="flex items-center gap-1.5">
          <span>Filters</span>
          {activeFiltersCount > 0 && (
            <span className="flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-white text-black dark:bg-black dark:text-white text-[11px] font-bold leading-none">
              {activeFiltersCount}
            </span>
          )}
        </div>
      </button>

      <button
        type="button"
        onClick={resetFilters}
        aria-label="Reset all filters"
        className={`inline-flex items-center gap-1.5 px-2.5 text-[0.875rem] font-medium text-gray-700 transition-all duration-200 hover:bg-[#E2E6EA] dark:hover:bg-[#2B3042] dark:text-gray-300 cursor-pointer select-none ${
          variant === 'saved' ? 'h-[36px] px-4 rounded-[8px]' : 'h-[30px] rounded-[6px]'
        }`}
      >
        <RotateCcw className="w-3 h-3" strokeWidth={2.2} />
        <span>Reset</span>
      </button>
    </div>
  );

  return (
    <div className={`w-full mb-[1.25rem] select-none ${className}`} ref={searchContainerRef}>
      {/* Top row */}
      <div className="flex flex-col md:flex-row gap-3 mb-[0.75rem]">
        <div 
          className={`flex-grow flex flex-col relative transition-all duration-150 border-2 rounded-[12px] ${
            isSearchExpanded 
              ? "bg-white border-black dark:bg-[#1A1C24] dark:border-white"
              : "bg-[#EDF0F3] border-transparent dark:bg-[#202330] dark:border-transparent"
          }`}
        >
          <div className="relative flex items-center group h-[48px]">
            <Search className={`absolute left-4 w-[18px] h-[18px] pointer-events-none transition-colors z-10 ${
              isSearchExpanded ? "text-black dark:text-white" : "text-gray-400 dark:text-gray-500"
            }`} />
            <input
              type="text"
              className="w-full h-full pl-11 pr-10 font-body text-[1rem] font-medium text-gray-900 bg-transparent outline-none dark:text-white placeholder:text-gray-400 placeholder:font-medium rounded-[12px]"
              placeholder="Search by role, skills, keywords or company..."
              value={localSearch}
              onChange={handleChange}
              onFocus={() => setIsSearchExpanded(true)}
              onClick={() => setIsSearchExpanded(true)}
            />
            {localSearch && (
              <button 
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-bg-tag dark:hover:text-white dark:hover:bg-[#2B3042] transition-colors cursor-pointer z-10"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {/* Expandable Options using CSS Grid for smooth transition inline */}
          <div 
            className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] w-full"
            style={{ 
              gridTemplateRows: isSearchExpanded ? '1fr' : '0fr', 
              opacity: isSearchExpanded ? 1 : 0
            }}
          >
            <div className="overflow-hidden">
              <div className="px-3 pb-3 pt-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
                {searchOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = searchBy === option.id;
                  
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSearchBy(isActive ? "all" : option.id);
                      }}
                      className={`inline-flex items-center gap-1.5 h-[32px] px-3.5 text-[0.875rem] transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px] ${
                        isActive 
                          ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs" 
                          : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white dark:text-black" : "text-gray-500 dark:text-gray-400"}`} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {variant === "default" ? (
          <LocationDropdown />
        ) : (
          renderFilterResetBlock()
        )}
      </div>

      {/* Bottom row: Responsive Quick Filters shortcut pills */}
      {variant === "default" && (
        <div className="flex items-center gap-[0.5rem] overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap no-scrollbar">
          
          <button
            type="button"
            onClick={() => {
              if (activeFiltersCount > 0) resetFilters();
            }}
            className={`inline-flex items-center justify-center h-[36px] px-4 text-[0.875rem] transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
              ${activeFiltersCount === 0 
                ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs" 
                : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
              }
            `}
          >
            All jobs
          </button>

          <button
            type="button"
            onClick={toggleSeniorityFresher}
            className={`inline-flex items-center justify-center h-[36px] px-4 text-[0.875rem] transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
              ${seniority === "fresher" 
                ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs" 
                : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
              }
            `}
          >
            Fresher
          </button>

          <button
            type="button"
            onClick={toggleJobTypeInternship}
            className={`inline-flex items-center justify-center h-[36px] px-4 text-[0.875rem] transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
              ${jobType === "Internship" 
                ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs" 
                : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
              }
            `}
          >
            Internship
          </button>

          <button
            type="button"
            onClick={toggleSeniorityEntry}
            className={`inline-flex items-center justify-center h-[36px] px-4 text-[0.875rem] transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
              ${seniority === "entry-level" 
                ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs" 
                : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
              }
            `}
          >
            Entry-level
          </button>

          <button
            type="button"
            onClick={toggleJobTypeFullTime}
            className={`inline-flex items-center justify-center h-[36px] px-4 text-[0.875rem] transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
              ${jobType === "Full-time" 
                ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs" 
                : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
              }
            `}
          >
            Full-time
          </button>

          <button
            type="button"
            onClick={toggleVisaSponsored}
            className={`inline-flex items-center justify-center h-[36px] px-4 text-[0.875rem] transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
              ${visaSponsorship === "sponsored" 
                ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs" 
                : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
              }
            `}
          >
            Visa Sponsored
          </button>

          <button
            type="button"
            onClick={togglePostedPast24Hrs}
            className={`inline-flex items-center justify-center h-[36px] px-4 text-[0.875rem] transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
              ${postedTime === "24h" 
                ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs" 
                : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
              }
            `}
          >
            Past 24hrs
          </button>

          <div className="h-5 w-[1px] bg-border-subtle mx-0.5 hidden sm:block dark:bg-[#2B3042] shrink-0" />
          {renderFilterResetBlock()}
        </div>
      )}
    </div>
  );
}
