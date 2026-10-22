"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { X, RotateCcw } from "lucide-react";
import { useJobStore, useAppFilters } from "@/store/useJobStore";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/utils/scrollLock";

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

interface DraftFilters {
  categories: string[];
  jobType: string;
  seniority: string;
  minSalary: number;
  postedTime: string;
  visaSponsorship: string;
  workMode: string;
}

export function FiltersModal({ totalMatches = 0, variant = "default" }: FiltersModalProps) {
  const isFilterMenuOpen = useJobStore((s) => s.isFilterMenuOpen);
  const setIsFilterMenuOpen = useJobStore((s) => s.setIsFilterMenuOpen);
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
  } = useAppFilters(variant);

  const modalRef = useRef<HTMLDivElement>(null);
  const [showAllDomains, setShowAllDomains] = useState(false);

  // Consolidated draft filter state
  const [draft, setDraft] = useState<DraftFilters>(() => ({
    categories,
    jobType,
    seniority,
    minSalary,
    postedTime,
    visaSponsorship,
    workMode,
  }));

  // Smooth Enter / Exit Animation State Management
  const [isRendered, setIsRendered] = useState(isFilterMenuOpen);
  const [isVisible, setIsVisible] = useState(isFilterMenuOpen);

  // Synchronize draft state and visibility when modal opens/closes during render before paint
  const [prevIsOpen, setPrevIsOpen] = useState(isFilterMenuOpen);
  if (prevIsOpen !== isFilterMenuOpen) {
    setPrevIsOpen(isFilterMenuOpen);
    if (isFilterMenuOpen) {
      setIsRendered(true);
      setIsVisible(false);
      setDraft({
        categories,
        jobType,
        seniority,
        minSalary,
        postedTime,
        visaSponsorship,
        workMode,
      });
    } else {
      setIsVisible(false);
    }
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
  useEscapeKey(() => setIsFilterMenuOpen(false), isFilterMenuOpen);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isFilterMenuOpen) {
      lockBodyScroll();
      return () => {
        unlockBodyScroll();
      };
    }
  }, [isFilterMenuOpen]);

  // Active filter count in current draft
  const activeDraftCount = useMemo(() => {
    let count = draft.categories.length;
    if (draft.jobType && draft.jobType !== "all") count++;
    if (draft.seniority && draft.seniority !== "all") count++;
    if (draft.minSalary > 0) count++;
    if (draft.postedTime && draft.postedTime !== "all") count++;
    if (draft.visaSponsorship && draft.visaSponsorship !== "all") count++;
    if (draft.workMode && draft.workMode !== "all") count++;
    return count;
  }, [draft]);

  const toggleDraftCategory = useCallback((catId: string) => {
    setDraft((prev) => ({
      ...prev,
      categories: prev.categories.includes(catId)
        ? prev.categories.filter((c) => c !== catId)
        : [...prev.categories, catId],
    }));
  }, []);

  const toggleDraftOption = useCallback((
    field: "jobType" | "seniority" | "postedTime" | "visaSponsorship" | "workMode",
    selectedVal: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      [field]: prev[field].toLowerCase() === selectedVal.toLowerCase() ? "" : selectedVal,
    }));
  }, []);

  const handleResetDraft = useCallback(() => {
    setDraft({
      categories: [],
      jobType: "",
      seniority: "",
      minSalary: 0,
      postedTime: "",
      visaSponsorship: "",
      workMode: "",
    });
  }, []);

  const handleApply = useCallback(() => {
    if (variant === "saved") {
      useJobStore.setState({
        savedCategories: draft.categories,
        savedJobType: draft.jobType,
        savedSeniority: draft.seniority,
        savedMinSalary: draft.minSalary,
        savedPostedTime: draft.postedTime,
        savedVisaSponsorship: draft.visaSponsorship,
        savedWorkMode: draft.workMode,
        savedPage: 1,
      });
    } else {
      useJobStore.setState({
        categories: draft.categories,
        jobType: draft.jobType,
        seniority: draft.seniority,
        minSalary: draft.minSalary,
        postedTime: draft.postedTime,
        visaSponsorship: draft.visaSponsorship,
        workMode: draft.workMode,
        page: 1,
      });
    }
    setIsFilterMenuOpen(false);
  }, [draft, variant, setIsFilterMenuOpen]);

  const isDraftSameAsApplied = useMemo(() => {
    return (
      draft.categories.length === categories.length &&
      draft.categories.every((c) => categories.includes(c)) &&
      draft.jobType === jobType &&
      draft.seniority === seniority &&
      draft.minSalary === minSalary &&
      draft.postedTime === postedTime &&
      draft.visaSponsorship === visaSponsorship &&
      draft.workMode === workMode
    );
  }, [draft, categories, jobType, seniority, minSalary, postedTime, visaSponsorship, workMode]);

  const draftKey = useMemo(() => JSON.stringify(draft), [draft]);
  const debouncedDraftKey = useDebounce(draftKey, 180);

  const { data: countData, isFetching: isCountFetching } = useQuery({
    queryKey: [
      "filter-count",
      variant,
      searchQuery,
      locationQuery,
      searchBy,
      location,
      debouncedDraftKey,
    ],
    queryFn: async () => {
      const parsed = JSON.parse(debouncedDraftKey) as DraftFilters;
      const params = new URLSearchParams();
      params.set("countOnly", "true");
      if (searchQuery) params.set("keyword", searchQuery);
      if (locationQuery) params.set("locationQuery", locationQuery);
      if (searchBy && searchBy !== "all") params.set("searchBy", searchBy);
      if (location && location !== "Worldwide") params.set("location", location);
      if (parsed.categories.length > 0) params.set("categories", parsed.categories.join(","));
      if (parsed.jobType) params.set("jobType", parsed.jobType);
      if (parsed.seniority) params.set("seniority", parsed.seniority);
      if (parsed.minSalary > 0) params.set("minSalary", parsed.minSalary.toString());
      if (parsed.postedTime) params.set("postedTime", parsed.postedTime);
      if (parsed.visaSponsorship) params.set("visaSponsorship", parsed.visaSponsorship);
      if (parsed.workMode) params.set("workMode", parsed.workMode);

      const endpoint = variant === "saved" ? "/api/jobs/saved" : "/api/jobs";
      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch filter count");
      const json = await res.json();
      return (json.total as number) ?? 0;
    },
    enabled: isFilterMenuOpen && !isDraftSameAsApplied,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });

  const displayCount = isDraftSameAsApplied
    ? totalMatches
    : (countData ?? (isCountFetching ? undefined : totalMatches));

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
              : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-800 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
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
        className={`inline-flex items-center px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm transition-all duration-200 ease-out cursor-pointer select-none border-[1.5px] ${
          isSelected
            ? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs"
            : "rounded-[20px] hover:rounded-[10px] bg-[#EDF0F3] text-gray-800 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"
        }`}
      >
        {label}
      </button>
    );
  };

  const visibleDomains = showAllDomains ? DOMAIN_OPTIONS : DOMAIN_OPTIONS.slice(0, 5);

  if (!isRendered) return null;

  return (
    <div
      className={`fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm select-none transition-opacity duration-200 ease-out ${
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
        className={`relative w-full max-w-[540px] max-h-[92dvh] sm:max-h-[90vh] flex flex-col bg-white rounded-[20px] shadow-2xl dark:bg-[#1A1C24] overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isVisible
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 translate-y-2"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[var(--space-m)] py-[var(--space-s)] shrink-0">
          <div className="flex items-center gap-3">
            <h2
              id="filters-dialog-title"
              className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight"
            >
              Filters
            </h2>
            {activeDraftCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 px-2 rounded-full text-[0.7rem] font-bold bg-brand-lime text-brand-dark dark:bg-[#ACEE5F] dark:text-[#111827]">
                {activeDraftCount} active
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
        <div className="p-[var(--space-m)] overflow-y-auto flex-1 pb-[var(--space-m)]">
          <div className="space-y-[var(--space-m)]">
            {/* Visa Sponsorship */}
            <div className="space-y-3">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-tight">
                Visa Sponsorship
              </h3>
              <div className="flex flex-wrap gap-2">
                {VISA_OPTIONS.map((opt) =>
                  renderPill(
                    opt.id,
                    opt.label,
                    draft.visaSponsorship.toLowerCase() === opt.id.toLowerCase(),
                    () => toggleDraftOption("visaSponsorship", opt.id)
                  )
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

            {/* Seniority */}
            <div className="space-y-3">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-tight">
                Seniority
              </h3>
              <div className="flex flex-wrap gap-2">
                {SENIORITY_OPTIONS.map((opt) =>
                  renderPill(
                    opt.id,
                    opt.label,
                    draft.seniority.toLowerCase() === opt.id.toLowerCase(),
                    () => toggleDraftOption("seniority", opt.id)
                  )
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

            {/* Employment Type */}
            <div className="space-y-3">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-tight">
                Employment type
              </h3>
              <div className="flex flex-wrap gap-2">
                {JOB_TYPE_OPTIONS.map((opt) =>
                  renderPill(
                    opt.id,
                    opt.label,
                    draft.jobType.toLowerCase() === opt.id.toLowerCase(),
                    () => toggleDraftOption("jobType", opt.id)
                  )
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

            {/* Work Mode */}
            <div className="space-y-3">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-tight">
                Work Mode
              </h3>
              <div className="flex flex-wrap gap-2">
                {WORK_MODE_OPTIONS.map((opt) =>
                  renderPill(
                    opt.id,
                    opt.label,
                    draft.workMode.toLowerCase() === opt.id.toLowerCase(),
                    () => toggleDraftOption("workMode", opt.id)
                  )
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

            {/* Minimum Salary */}
            <div className="space-y-3">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-tight">
                Minimum salary
              </h3>
              <div className="relative flex items-center w-full sm:max-w-[280px]">
                <span className="absolute left-4 text-gray-500 font-medium text-[1.05rem] pointer-events-none">
                  $
                </span>
                <input
                  type="number"
                  placeholder="e.g. 40000"
                  value={draft.minSalary > 0 ? draft.minSalary : ""}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setDraft((prev) => ({ ...prev, minSalary: isNaN(val) ? 0 : val }));
                  }}
                  className="w-full h-[var(--control-h-lg)] bg-[#EDF0F3] border-2 border-transparent text-gray-900 text-[1rem] font-semibold rounded-[var(--border-radius-card)] pl-8 pr-4 outline-none focus:bg-white focus:border-black transition-all dark:bg-[#202330] dark:text-white dark:focus:bg-[#1A1C24] dark:focus:border-white placeholder:text-gray-400 placeholder:font-medium"
                />
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

            {/* Domain */}
            <div className="space-y-3">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-tight">
                Domain
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {visibleDomains.map((opt) =>
                  renderPill(
                    opt.id,
                    opt.label,
                    draft.categories.includes(opt.id),
                    () => toggleDraftCategory(opt.id),
                    true
                  )
                )}
                {!showAllDomains && DOMAIN_OPTIONS.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllDomains(true)}
                    className="inline-flex items-center text-xs sm:text-sm font-semibold text-text-muted hover:text-text-primary dark:text-[#9CA3AF] dark:hover:text-white transition-colors duration-150 cursor-pointer select-none py-1.5 px-2 bg-transparent"
                  >
                    + View more
                  </button>
                )}
                {showAllDomains && DOMAIN_OPTIONS.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllDomains(false)}
                    className="inline-flex items-center text-xs sm:text-sm font-semibold text-text-muted hover:text-text-primary dark:text-[#9CA3AF] dark:hover:text-white transition-colors duration-150 cursor-pointer select-none py-1.5 px-2 bg-transparent"
                  >
                    - View less
                  </button>
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-[#1F222E] w-full" />

            {/* Date Posted */}
            <div className="space-y-3">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-tight">
                Date & time posted
              </h3>
              <div className="flex flex-wrap gap-2">
                {POSTED_TIME_OPTIONS.map((opt) =>
                  renderPill(
                    opt.id,
                    opt.label,
                    draft.postedTime.toLowerCase() === opt.id.toLowerCase(),
                    () => toggleDraftOption("postedTime", opt.id)
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-[var(--space-m)] border-t border-gray-100 dark:border-[#1F222E] shrink-0 bg-white dark:bg-[#1A1C24]">
          <div
            className={`grid transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              activeDraftCount > 0 ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0 pointer-events-none"
            }`}
          >
            <div className="overflow-hidden pr-3">
              <button
                type="button"
                onClick={handleResetDraft}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm sm:text-base font-bold text-gray-500 hover:text-black hover:bg-gray-100 rounded-xl dark:text-gray-400 dark:hover:text-white dark:hover:bg-[#262A3B] transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" strokeWidth={2.2} />
                <span>Reset</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleApply}
            className="flex-1 h-[var(--control-h-lg)] rounded-[var(--border-radius-card)] bg-black text-white text-sm sm:text-base font-bold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-900 active:scale-[0.98] dark:bg-white dark:text-black dark:hover:bg-gray-100"
          >
            <span>Show results</span>
            <span
              className={`text-xs sm:text-sm font-bold transition-opacity duration-150 ${
                isCountFetching && !isDraftSameAsApplied ? "opacity-50" : "opacity-80"
              }`}
            >
              ({displayCount !== undefined ? displayCount.toLocaleString() : "..."})
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
