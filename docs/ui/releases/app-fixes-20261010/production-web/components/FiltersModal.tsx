"use client";

import { useEffect, useRef, useState } from "react";
import { X, RotateCcw } from "lucide-react";
import { useJobStore, useAppFilters } from "@/store/useJobStore";

import {
  DOMAIN_OPTIONS,
  JOB_TYPE_OPTIONS,
  SENIORITY_OPTIONS,
  POSTED_TIME_OPTIONS,
  VISA_OPTIONS,
  WORK_MODE_OPTIONS,
} from "@/lib/constants/filters";

interface FiltersModalProps {
  totalMatches?: number;
  variant?: "default" | "saved";
}

export function FiltersModal({ totalMatches = 0, variant = "default" }: FiltersModalProps) {
  const { isFilterMenuOpen, setIsFilterMenuOpen } = useJobStore();
  const {
    categories,
    toggleCategory,
    jobType,
    setJobType,
    seniority,
    setSeniority,
    minSalary,
    setMinSalary,
    postedTime,
    setPostedTime,
    visaSponsorship,
    setVisaSponsorship,
    workMode,
    setWorkMode,
    resetFilters,
  } = useAppFilters(variant);

  const modalRef = useRef<HTMLDivElement>(null);
  const [showAllDomains, setShowAllDomains] = useState(false);

  // Smooth Enter / Exit Animation State Management
  const [isRendered, setIsRendered] = useState(isFilterMenuOpen);
  const [isVisible, setIsVisible] = useState(isFilterMenuOpen);

  const [previousOpen, setPreviousOpen] = useState(isFilterMenuOpen);
  if (previousOpen !== isFilterMenuOpen) {
    setPreviousOpen(isFilterMenuOpen);
    if (isFilterMenuOpen) setIsRendered(true);
    else setIsVisible(false);
  }
  useEffect(() => {
    if (isFilterMenuOpen) {
      const frame = requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => cancelAnimationFrame(frame);
    } else {
      const timer = setTimeout(() => {
        setIsRendered(false);
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [isFilterMenuOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isFilterMenuOpen) {
        setIsFilterMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFilterMenuOpen, setIsFilterMenuOpen]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isFilterMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isFilterMenuOpen]);

  if (!isRendered) return null;

  // Active filter count
  let activeCount = 0;
  activeCount += categories.length;
  if (jobType && jobType !== "all") activeCount++;
  if (seniority && seniority !== "all") activeCount++;
  if (minSalary > 0) activeCount++;
  if (postedTime && postedTime !== "all") activeCount++;
  if (visaSponsorship && visaSponsorship !== "all") activeCount++;
  if (workMode && workMode !== "all") activeCount++;

  const renderPill = (
    id: string,
    label: string,
    isSelected: boolean,
    onClick: () => void,
    isDomain: boolean = false
  ) => {
    if (isDomain) {
      return (
        <button
          key={id}
          type="button"
          onClick={onClick}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-[0.875rem] transition-all duration-200 ease-out cursor-pointer select-none border-[1.5px] ${
            isSelected
              ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs"
              : "rounded-[20px] hover:rounded-[10px] bg-gray-50 text-gray-700 border-transparent hover:bg-gray-100 dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
          }`}
        >
          {label}
          {isSelected && <X className="w-3.5 h-3.5 ml-0.5 opacity-80" strokeWidth={2.5} />}
        </button>
      );
    }

    return (
      <button
        key={id}
        type="button"
        onClick={onClick}
        className={`inline-flex items-center px-4 py-2 text-[0.875rem] transition-all duration-200 ease-out cursor-pointer select-none border-[1.5px] ${
          isSelected
            ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs"
            : "rounded-[20px] hover:rounded-[10px] bg-gray-50 text-gray-700 border-transparent hover:bg-gray-100 dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
        }`}
      >
        {label}
      </button>
    );
  };

  const visibleDomains = showAllDomains ? DOMAIN_OPTIONS : DOMAIN_OPTIONS.slice(0, 5);

  return (
    <div
      className={`fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm select-none transition-opacity duration-200 ease-out ${
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onClick={(e) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
          setIsFilterMenuOpen(false);
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="filters-dialog-title"
    >
      <div
        ref={modalRef}
        className={`relative w-full max-w-[540px] max-h-[90vh] flex flex-col bg-white rounded-[20px] shadow-2xl dark:bg-[#1A1C24] overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isVisible
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 translate-y-2"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <h2
              id="filters-dialog-title"
              className="text-[1.25rem] font-bold text-gray-900 dark:text-white tracking-tight"
            >
              Filters
            </h2>
            {activeCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 px-2 rounded-full text-[0.7rem] font-bold bg-[#D6F32F] text-black">
                {activeCount} active
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsFilterMenuOpen(false)}
            aria-label="Close filters"
            className="w-[34px] h-[34px] rounded-lg bg-transparent text-gray-500 hover:text-black hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-[#262A3B] flex items-center justify-center transition-colors duration-200 cursor-pointer"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
        
        <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 pb-6">
          
          <div className="space-y-6">
            {/* Visa Sponsorship */}
            <div className="space-y-3">
              <h3 className="text-[0.95rem] font-bold text-gray-900 dark:text-white tracking-tight">
                Visa Sponsorship
              </h3>
              <div className="flex flex-wrap gap-2">
                {VISA_OPTIONS.map((opt) =>
                  renderPill(
                    opt.id,
                    opt.label,
                    visaSponsorship.toLowerCase() === opt.id.toLowerCase(),
                    () => setVisaSponsorship(opt.id)
                  )
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

            {/* Seniority */}
            <div className="space-y-3">
              <h3 className="text-[0.95rem] font-bold text-gray-900 dark:text-white tracking-tight">
                Seniority
              </h3>
              <div className="flex flex-wrap gap-2">
                {SENIORITY_OPTIONS.map((opt) =>
                  renderPill(
                    opt.id,
                    opt.label,
                    seniority.toLowerCase() === opt.id.toLowerCase(),
                    () => setSeniority(opt.id)
                  )
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

            {/* Employment Type */}
            <div className="space-y-3">
              <h3 className="text-[0.95rem] font-bold text-gray-900 dark:text-white tracking-tight">
                Employment type
              </h3>
              <div className="flex flex-wrap gap-2">
                {JOB_TYPE_OPTIONS.map((opt) =>
                  renderPill(
                    opt.id,
                    opt.label,
                    jobType.toLowerCase() === opt.id.toLowerCase(),
                    () => setJobType(opt.id)
                  )
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

            {/* Work Mode */}
            <div className="space-y-3">
              <h3 className="text-[0.95rem] font-bold text-gray-900 dark:text-white tracking-tight">
                Work Mode
              </h3>
              <div className="flex flex-wrap gap-2">
                {WORK_MODE_OPTIONS.map((opt) =>
                  renderPill(
                    opt.id,
                    opt.label,
                    workMode.toLowerCase() === opt.id.toLowerCase(),
                    () => setWorkMode(opt.id)
                  )
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

            {/* Minimum Salary */}
            <div className="space-y-3">
              <h3 className="text-[0.95rem] font-bold text-gray-900 dark:text-white tracking-tight">
                Minimum salary
              </h3>
              <div className="relative flex items-center w-full sm:max-w-[280px]">
                <span className="absolute left-4 text-gray-500 font-medium text-[1.05rem] pointer-events-none">
                  $
                </span>
                <input
                  type="number"
                  placeholder="e.g. 40000"
                  value={minSalary > 0 ? minSalary : ""}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setMinSalary(isNaN(val) ? 0 : val);
                  }}
                  className="w-full h-[48px] bg-gray-50 border-2 border-transparent text-gray-900 text-[1rem] font-semibold rounded-xl pl-8 pr-4 outline-none focus:bg-white focus:border-black transition-all dark:bg-[#202330] dark:text-white dark:focus:bg-[#1A1C24] dark:focus:border-white placeholder:text-gray-400 placeholder:font-medium"
                />
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

            {/* Domain */}
            <div className="space-y-3">
              <h3 className="text-[0.95rem] font-bold text-gray-900 dark:text-white tracking-tight">
                Domain
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {visibleDomains.map((opt) =>
                  renderPill(
                    opt.id,
                    opt.label,
                    categories.includes(opt.id),
                    () => toggleCategory(opt.id),
                    true
                  )
                )}
                {!showAllDomains && DOMAIN_OPTIONS.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllDomains(true)}
                    className="inline-flex items-center text-[0.84rem] font-semibold text-text-muted hover:text-text-primary dark:text-[#9CA3AF] dark:hover:text-white transition-colors duration-150 cursor-pointer select-none py-1.5 px-2 bg-transparent"
                  >
                    + View more
                  </button>
                )}
                {showAllDomains && DOMAIN_OPTIONS.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllDomains(false)}
                    className="inline-flex items-center text-[0.84rem] font-semibold text-text-muted hover:text-text-primary dark:text-[#9CA3AF] dark:hover:text-white transition-colors duration-150 cursor-pointer select-none py-1.5 px-2 bg-transparent"
                  >
                    - View less
                  </button>
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

            {/* Date Posted */}
            <div className="space-y-3">
              <h3 className="text-[0.95rem] font-bold text-gray-900 dark:text-white tracking-tight">
                Date & time posted
              </h3>
              <div className="flex flex-wrap gap-2">
                {POSTED_TIME_OPTIONS.map((opt) =>
                  renderPill(
                    opt.id,
                    opt.label,
                    postedTime.toLowerCase() === opt.id.toLowerCase(),
                    () => setPostedTime(opt.id)
                  )
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-100 dark:border-[#1F222E] shrink-0 bg-white dark:bg-[#1A1C24]">
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-2 px-3 py-2 text-[0.95rem] font-bold text-gray-500 hover:text-black hover:bg-gray-100 rounded-xl dark:text-gray-400 dark:hover:text-white dark:hover:bg-[#262A3B] transition-all cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" strokeWidth={2.2} />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFilterMenuOpen(false)}
            className="flex-1 max-w-[280px] ml-4 h-[50px] rounded-[14px] bg-black text-white text-[1rem] font-bold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-900 active:scale-[0.98] dark:bg-white dark:text-black dark:hover:bg-gray-100"
          >
            <span>Show results</span>
            {totalMatches > 0 && (
              <span className="text-[0.85rem] font-bold opacity-80">
                ({totalMatches.toLocaleString()})
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
