"use client";

import { useJobStore, useAppFilters } from "@/store/useJobStore";
import { Search, SlidersHorizontal, X, RotateCcw, Building2, AlignLeft, MapPin, ArrowRight } from "lucide-react";
import { LocationDropdown } from "./LocationDropdown";
import { useState, useRef, useCallback } from "react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";

interface SearchFilterBarProps {
  variant?: "default" | "saved";
  className?: string;
}

const TOP_US_CITIES = [
  { id: "new-york", label: "New York", value: "New York" },
  { id: "san-francisco", label: "San Francisco", value: "San Francisco" },
];

export function SearchFilterBar({ variant = "default", className = "" }: SearchFilterBarProps) {
  const toggleFilterMenu = useJobStore((s) => s.toggleFilterMenu);
  const isHeaderScrolled = useJobStore((s) => s.isHeaderScrolled);
  const {
    searchQuery,
    setSearchQuery,
    locationQuery,
    setLocationQuery,
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
    resetFilters,
  } = useAppFilters(variant);

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [localLocation, setLocalLocation] = useState(locationQuery);
  const [isExpanded, setIsExpanded] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Sync state when external queries change (e.g. from URL or Reset)
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  if (prevSearchQuery !== searchQuery) {
    setPrevSearchQuery(searchQuery);
    setLocalSearch(searchQuery);
  }

  const [prevLocationQuery, setPrevLocationQuery] = useState(locationQuery);
  if (prevLocationQuery !== locationQuery) {
    setPrevLocationQuery(locationQuery);
    setLocalLocation(locationQuery);
  }

  const handleKeywordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSearch(e.target.value);
  }, []);

  const handleLocationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalLocation(e.target.value);
  }, []);

  const handleSearchSubmit = useCallback(() => {
    setSearchQuery(localSearch.trim());
    if (variant === "default") {
      setLocationQuery(localLocation.trim());
    }
    setIsExpanded(false);
  }, [localSearch, localLocation, variant, setSearchQuery, setLocationQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearchSubmit();
    }
  }, [handleSearchSubmit]);

  const handleClearSearch = useCallback(() => {
    setLocalSearch("");
    setSearchQuery("");
    if (variant === "saved") {
      setIsExpanded(false);
    }
  }, [variant, setSearchQuery]);

  const handleClearLocation = useCallback(() => {
    setLocalLocation("");
    setLocationQuery("");
  }, [setLocationQuery]);

  const handleToggleCity = useCallback((cityName: string) => {
    if (localLocation.trim().toLowerCase() === cityName.toLowerCase()) {
      setLocalLocation("");
      setLocationQuery("");
    } else {
      setLocalLocation(cityName);
      setLocationQuery(cityName);
    }
  }, [localLocation, setLocationQuery]);

  // Clean outside click handler
  useClickOutside(searchContainerRef, () => {
    setIsExpanded(false);
    if (!searchQuery && searchBy !== "all") {
      setSearchBy("all");
    }
  }, isExpanded);

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
  ];

  const savedSearchOptions = [
    { id: "title", label: "Job Title", icon: Search },
    { id: "company", label: "Company", icon: Building2 },
    { id: "description", label: "Description", icon: AlignLeft },
    { id: "location", label: "Location", icon: MapPin },
  ];

  const renderFilterResetBlock = () => (
    <div className="flex items-center shrink-0">
      <button
        type="button"
        onClick={toggleFilterMenu}
        aria-label="Toggle filters"
        title="Toggle filters"
        className={`relative inline-flex items-center justify-center font-semibold transition-all duration-200 cursor-pointer select-none border-[1.5px] bg-[#E8F0FE] text-[#1A73E8] border-transparent hover:bg-[#D2E3FC] dark:bg-[#1A2744] dark:text-[#8AB4F8] dark:hover:bg-[#23355A] ${
          variant === 'saved'
            ? 'h-[48px] px-5 rounded-[12px] text-sm sm:text-base gap-2'
            : 'h-[36px] w-[42px] md:w-auto px-0 md:px-3.5 md:gap-2 rounded-[10px] hover:rounded-[8px] text-xs sm:text-sm'
        }`}
      >
        <SlidersHorizontal className="w-4 h-4 shrink-0" />
        {variant === 'saved' ? (
          <span>Filters</span>
        ) : (
          <span className="hidden md:inline">Filters</span>
        )}
        {activeFiltersCount > 0 && (
          <span className="absolute -top-1 -right-1 z-10 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#1A73E8] text-white dark:bg-[#4285F4] dark:text-white border-2 border-white dark:border-[#111216] text-[10px] font-bold leading-none shadow-xs pointer-events-none">
            {activeFiltersCount}
          </span>
        )}
      </button>

      {/* Dynamic Reset Button with Physics-Weighted Width & Opacity Interpolation (Desktop only) */}
      <div
        className={`hidden md:grid transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          activeFiltersCount > 0 ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0 pointer-events-none"
        }`}
      >
        <div className="overflow-hidden pl-1.5 md:pl-2">
          <button
            type="button"
            onClick={resetFilters}
            aria-label="Reset all filters"
            title="Reset all filters"
            className={`inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-700 transition-colors duration-200 hover:bg-[#E2E6EA] dark:hover:bg-[#2B3042] dark:text-gray-300 cursor-pointer select-none whitespace-nowrap ${
              variant === 'saved' ? 'h-[36px] px-4 rounded-[8px]' : 'h-[36px] px-2.5 md:px-3 rounded-[10px]'
            }`}
          >
            <RotateCcw className="w-3 h-3" strokeWidth={2.2} />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );

  const hasAnyInput = Boolean(localSearch.trim() || localLocation.trim());

  return (
    <div className={`w-full select-none ${className.includes("mb-") ? className : `mb-[1.25rem] ${className}`}`} ref={searchContainerRef}>
      {/* Top row: Smoothly folds away when scrolled on Job Board so compact header searchbar takes over */}
      <div
        className={`transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          variant === "default" && isHeaderScrolled
            ? "max-h-0 opacity-0 overflow-hidden mb-0 pointer-events-none -translate-y-2 scale-95"
            : "max-h-[160px] opacity-100 mb-[clamp(0.625rem,calc(0.521rem+0.463vw),0.9375rem)] translate-y-0 scale-100"
        }`}
      >
        <div className="flex flex-col md:flex-row gap-2.5 sm:gap-3">
          {/* Search Input + External Arrow Button (Desktop, Default only) + Mobile Filter Icon Button wrapper */}
          <div className={`flex ${variant === "saved" ? "items-start gap-2" : "items-stretch gap-2 sm:gap-2.5"} flex-grow min-w-0`}>
          {variant === "saved" ? (
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchSubmit();
              }}
              role="search"
              className={`flex-grow flex flex-col relative transition-all duration-150 border-2 rounded-[var(--border-radius-card)] min-w-0 ${
                isExpanded 
                  ? "bg-white border-black dark:bg-[#1A1C24] dark:border-white shadow-xs" 
                  : "bg-[#EDF0F3] border-transparent dark:bg-[#202330] dark:border-transparent"
              }`}
            >
              <div className="relative flex items-center group h-[var(--control-h-lg)]">
                <Search className={`absolute left-4 w-[18px] h-[18px] pointer-events-none transition-colors z-10 ${
                  isExpanded ? "text-black dark:text-white" : "text-gray-400 dark:text-gray-500"
                }`} />
                <input
                  type="search"
                  enterKeyHint="search"
                  className="w-full h-full pl-11 pr-20 font-body text-sm sm:text-base font-medium text-gray-900 bg-transparent outline-none dark:text-white placeholder:text-gray-400 placeholder:font-medium rounded-[var(--border-radius-card)] [&::-webkit-search-cancel-button]:hidden"
                  placeholder="Search by role, skills, keywords or company..."
                  value={localSearch}
                  onChange={handleKeywordChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsExpanded(true)}
                  onClick={() => setIsExpanded(true)}
                />
                {(isExpanded || localSearch) && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10 animate-in fade-in duration-150">
                    {localSearch && (
                      <>
                        <button 
                          type="button"
                          onClick={handleClearSearch}
                          className="p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-bg-tag dark:hover:text-white dark:hover:bg-[#2B3042] transition-colors cursor-pointer"
                          aria-label="Clear search"
                          title="Clear search"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <div className="h-4 w-[1px] bg-border-subtle dark:bg-[#2B3042] mx-0.5" />
                      </>
                    )}
                    <button
                      type="submit"
                      onClick={(e) => {
                        e.preventDefault();
                        handleSearchSubmit();
                      }}
                      className="p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-bg-tag dark:hover:text-white dark:hover:bg-[#2B3042] transition-colors cursor-pointer"
                      aria-label="Submit search"
                      title="Search"
                    >
                      <Search className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              
              {/* Expandable Options using CSS Grid for smooth transition inline */}
              <div 
                className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] w-full"
                style={{ 
                  gridTemplateRows: isExpanded ? '1fr' : '0fr', 
                  opacity: isExpanded ? 1 : 0
                }}
              >
                <div className="overflow-hidden">
                  <div className="px-3 pb-3 pt-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {savedSearchOptions.map((option) => {
                      const Icon = option.icon;
                      const isActive = searchBy === option.id;
                      
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setSearchBy(isActive ? "all" : option.id);
                          }}
                          className={`inline-flex items-center gap-1.5 h-[32px] px-3.5 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px] ${
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
            </form>
          ) : (
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchSubmit();
              }}
              role="search"
              className={`flex-grow flex flex-col relative transition-all duration-150 border-2 rounded-[var(--border-radius-card)] min-w-0 ${
                isExpanded
                  ? "bg-white border-black dark:bg-[#1A1C24] dark:border-white shadow-xs"
                  : "bg-[#EDF0F3] border-transparent dark:bg-[#202330] dark:border-transparent"
              }`}
            >
              <div className="flex flex-col md:flex-row items-stretch w-full min-h-[var(--control-h-lg)]">
                {/* 1st Half: Keyword Search (Role, skills, company) */}
                <div className="flex-1 md:flex-1 min-w-0 flex flex-col">
                  <div className="relative flex items-center w-full h-[var(--control-h-lg)]">
                    <Search className="absolute left-5 sm:left-6 w-[18px] h-[18px] pointer-events-none text-gray-900 dark:text-white transition-colors z-10" />
                    <input
                      type="search"
                      enterKeyHint="search"
                      className="w-full h-full pl-12 sm:pl-14 pr-9 font-body text-sm sm:text-base font-medium text-gray-900 bg-transparent outline-none dark:text-white placeholder:text-gray-400 placeholder:font-medium rounded-[var(--border-radius-card)] [&::-webkit-search-cancel-button]:hidden"
                      placeholder="Job title, skills, or company..."
                      value={localSearch}
                      onChange={handleKeywordChange}
                      onKeyDown={handleKeyDown}
                      onFocus={() => setIsExpanded(true)}
                      onClick={() => setIsExpanded(true)}
                    />
                    {localSearch && (
                      <button 
                        type="button"
                        onClick={handleClearSearch}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-bg-tag dark:hover:text-white dark:hover:bg-[#2B3042] transition-colors cursor-pointer z-10"
                        aria-label="Clear keyword search"
                        title="Clear search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Expandable Keyword Filter Options */}
                  <div 
                    className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] w-full"
                    style={{ 
                      gridTemplateRows: isExpanded ? '1fr' : '0fr', 
                      opacity: isExpanded ? 1 : 0
                    }}
                  >
                    <div className="overflow-hidden">
                      <div className="pl-5 sm:pl-6 pr-3 pb-2.5 pt-0.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
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
                              className={`inline-flex items-center gap-1.5 h-[32px] px-3.5 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px] ${
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

                {/* Section Divider: Vertical on desktop, horizontal on mobile. Expands with container */}
                <div className="hidden md:block w-[1.5px] bg-gray-300 dark:bg-[#3E455E] shrink-0 self-stretch my-2 transition-all duration-300" />
                <div className="block md:hidden w-full h-[1.5px] bg-gray-300 dark:bg-[#3E455E] my-0.5" />

                {/* 2nd Half: Location Search Section (Contains Location input, City chips, and Country selector) */}
                <div className="flex-1 md:flex-1 min-w-0 flex flex-row items-stretch">
                  {/* Location Input & Chips Drawer */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="relative flex items-center w-full h-[var(--control-h-lg)]">
                      <MapPin className="absolute left-5 sm:left-6 w-[18px] h-[18px] pointer-events-none text-gray-900 dark:text-white transition-colors z-10" />
                      <input
                        type="search"
                        enterKeyHint="search"
                        className="w-full h-full pl-12 sm:pl-14 pr-9 font-body text-sm sm:text-base font-medium text-gray-900 bg-transparent outline-none dark:text-white placeholder:text-gray-400 placeholder:font-medium rounded-[var(--border-radius-card)] [&::-webkit-search-cancel-button]:hidden"
                        placeholder="City, state, or remote..."
                        value={localLocation}
                        onChange={handleLocationChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setIsExpanded(true)}
                        onClick={() => setIsExpanded(true)}
                      />
                      
                      {/* Clear Cross button (no divider next to it) */}
                      {localLocation && (
                        <button 
                          type="button"
                          onClick={handleClearLocation}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-bg-tag dark:hover:text-white dark:hover:bg-[#2B3042] transition-colors cursor-pointer z-10"
                          aria-label="Clear location search"
                          title="Clear location"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Expandable Location Chips (Top 2 US Cities) */}
                    <div 
                      className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] w-full"
                      style={{ 
                        gridTemplateRows: isExpanded ? '1fr' : '0fr', 
                        opacity: isExpanded ? 1 : 0
                      }}
                    >
                      <div className="overflow-hidden">
                        <div className="pl-5 sm:pl-6 pr-3 pb-2.5 pt-0.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                          {TOP_US_CITIES.map((city) => {
                            const isSelected = localLocation.toLowerCase() === city.value.toLowerCase();
                            return (
                              <button
                                key={city.id}
                                type="button"
                                onClick={() => handleToggleCity(city.value)}
                                className={`inline-flex items-center gap-1.5 h-[32px] px-3.5 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px] ${
                                  isSelected 
                                    ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs" 
                                    : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
                                }`}
                              >
                                <MapPin className={`w-3.5 h-3.5 ${isSelected ? "text-white dark:text-black" : "text-gray-500 dark:text-gray-400"}`} />
                                {city.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Country Selector: Centered with input when idle; moves along with bottom edge when expanded to match shortcut chips alignment */}
                  <div className={`flex items-center shrink-0 pl-1 pr-2.5 md:pr-4 transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                    isExpanded
                      ? "self-end pb-2.5 pt-0.5"
                      : "self-center"
                  }`}>
                    <LocationDropdown variant="embedded" />
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* Search Arrow Button: Completely separate outside of the search bar on desktop (Job Board only) */}
          {variant === "default" && (
            <div className="hidden md:flex items-center justify-center self-center shrink-0 transition-all duration-300">
              <button
                type="button"
                onClick={handleSearchSubmit}
                className="w-[var(--control-h-lg)] h-[var(--control-h-lg)] rounded-full bg-[#E2E6EA] hover:bg-[#D8DCE2] dark:bg-[#202330] dark:hover:bg-[#2B3042] flex items-center justify-center transition-all duration-150 cursor-pointer shadow-xs active:scale-95 select-none"
                aria-label="Submit search"
                title="Search jobs"
              >
                <ArrowRight 
                  className={`w-5 h-5 transition-colors duration-150 ${
                    hasAnyInput 
                      ? "text-gray-900 dark:text-white" 
                      : "text-gray-400 dark:text-gray-500"
                  }`} 
                  strokeWidth={2.5} 
                />
              </button>
            </div>
          )}

          {/* Mobile Filter Button: Used for Saved Jobs view which has no bottom shortcut chips row */}
          {variant === "saved" && (
            <button
              type="button"
              onClick={toggleFilterMenu}
              aria-label="Toggle filters"
              title="Toggle filters"
              className="md:hidden relative flex items-center justify-center h-[var(--control-h-lg)] w-[var(--control-h-lg)] shrink-0 rounded-[var(--border-radius-card)] border-2 transition-all duration-200 cursor-pointer select-none bg-[#E8F0FE] text-[#1A73E8] border-transparent hover:bg-[#D2E3FC] dark:bg-[#1A2744] dark:text-[#8AB4F8] dark:hover:bg-[#23355A]"
            >
              <SlidersHorizontal className="w-[18px] h-[18px]" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 z-10 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#1A73E8] text-white dark:bg-[#4285F4] dark:text-white border-2 border-white dark:border-[#111216] text-[10px] font-bold leading-none shadow-xs pointer-events-none">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          )}
        </div>

        {variant === "saved" && (
          <div className="hidden md:flex shrink-0">
            {renderFilterResetBlock()}
          </div>
        )}
        </div>
      </div>

      {/* Bottom row: Responsive Quick Filters shortcut pills */}
      {variant === "default" && (
        <div className="flex items-center gap-[0.5rem] overflow-x-auto pt-2.5 pb-2.5 -my-2.5 no-scrollbar scroll-smooth">
          {/* Filters & Reset options placed at the START (Icon-only on mobile, full label & divider on desktop) */}
          <div className="flex items-center md:gap-1.5 shrink-0">
            {renderFilterResetBlock()}
            <div className="hidden md:block h-5 w-[1px] bg-border-subtle mx-0.5 dark:bg-[#2B3042] shrink-0" />
          </div>

          <button
            type="button"
            onClick={toggleSeniorityFresher}
            className={`inline-flex items-center justify-center h-[36px] px-4 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
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
            className={`inline-flex items-center justify-center h-[36px] px-4 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
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
            className={`inline-flex items-center justify-center h-[36px] px-4 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
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
            className={`inline-flex items-center justify-center h-[36px] px-4 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
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
            className={`inline-flex items-center justify-center h-[36px] px-4 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
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
            className={`inline-flex items-center justify-center h-[36px] px-4 text-xs sm:text-sm transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]
              ${postedTime === "24h" 
                ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs" 
                : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
              }
            `}
          >
            Past 24hrs
          </button>
        </div>
      )}
    </div>
  );
}
