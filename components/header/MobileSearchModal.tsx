"use client";

import { useState, useRef, useEffect, useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Search, MapPin, X, ArrowRight, ArrowLeft, Building2, AlignLeft, RotateCcw } from "lucide-react";
import { useAppFilters } from "@/store/useJobStore";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";

const TOP_US_CITIES = [
  { id: "new-york", label: "New York", value: "New York" },
  { id: "san-francisco", label: "San Francisco", value: "San Francisco" },
];

const SEARCH_OPTIONS = [
  { id: "title", label: "Job Title", icon: Search },
  { id: "company", label: "Company", icon: Building2 },
  { id: "description", label: "Description", icon: AlignLeft },
];

interface MobileSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function MobileSearchModalDialog({ onClose }: { onClose: () => void }) {
  const {
    searchQuery,
    setSearchQuery,
    locationQuery,
    setLocationQuery,
    searchBy,
    setSearchBy,
  } = useAppFilters("default");

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [localLocation, setLocalLocation] = useState(locationQuery);
  const [localSearchBy, setLocalSearchBy] = useState(searchBy);

  const keywordInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus keyword input on mount
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      keywordInputRef.current?.focus({ preventScroll: true });
    }, 50);

    return () => clearTimeout(timeoutId);
  }, []);

  // Lock body scroll while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Handle ESC key to dismiss
  useEscapeKey(onClose, true);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      setSearchQuery(localSearch.trim());
      setLocationQuery(localLocation.trim());
      setSearchBy(localSearchBy);
      onClose();
    },
    [localSearch, localLocation, localSearchBy, setSearchQuery, setLocationQuery, setSearchBy, onClose]
  );

  const handleClearAll = useCallback(() => {
    setLocalSearch("");
    setLocalLocation("");
    setLocalSearchBy("all");
    setSearchQuery("");
    setLocationQuery("");
    setSearchBy("all");
  }, [setSearchQuery, setLocationQuery, setSearchBy]);

  const handleToggleCity = useCallback((cityName: string) => {
    setLocalLocation((prev) => (prev.trim().toLowerCase() === cityName.toLowerCase() ? "" : cityName));
  }, []);

  const handleToggleSearchBy = useCallback((id: string) => {
    setLocalSearchBy((prev) => (prev === id ? "all" : id));
  }, []);

  const hasDraftInputs = Boolean(localSearch.trim() || localLocation.trim() || localSearchBy !== "all");

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search jobs"
      className="fixed inset-0 z-[9990] flex flex-col justify-start"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-Down Search Panel */}
      <div className="relative z-10 w-full max-h-[90vh] bg-white dark:bg-[#151720] rounded-b-[20px] shadow-2xl border-b border-gray-200 dark:border-[#282C3D] flex flex-col overflow-hidden animate-in slide-in-from-top duration-250 ease-out">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-gray-100 dark:border-[#202330]">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to jobs"
              className="p-1 -ml-1.5 rounded-full text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={2.2} />
            </button>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Search Jobs</h2>
          </div>
          <div className="flex items-center gap-2">
            {hasDraftInputs && (
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white px-2 py-1 rounded-md transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Search Inputs Form */}
        <form onSubmit={handleSubmit} className="flex flex-col p-4 space-y-3.5 overflow-y-auto no-scrollbar">
          {/* Keyword Search Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mobile-search-keyword" className="text-xs font-bold text-gray-700 dark:text-gray-300">
              Keywords
            </label>
            <div className="relative flex items-center h-[42px] px-3 bg-[#EDF0F3] dark:bg-[#202330] rounded-[10px] border-[1.5px] border-transparent focus-within:border-black dark:focus-within:border-white focus-within:bg-white dark:focus-within:bg-[#1A1C24] transition-all">
              <Search className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0 mr-2" />
              <input
                id="mobile-search-keyword"
                ref={keywordInputRef}
                type="search"
                enterKeyHint="search"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Job title, skills, or company..."
                className="w-full h-full bg-transparent text-xs sm:text-sm font-medium text-gray-900 dark:text-white outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={() => setLocalSearch("")}
                  className="p-1 text-gray-400 hover:text-black dark:hover:text-white shrink-0 cursor-pointer"
                  aria-label="Clear keyword input"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Keyword Search By Filter Options */}
            <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
              {SEARCH_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = localSearchBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleToggleSearchBy(opt.id)}
                    className={`inline-flex items-center gap-1.5 h-[28px] px-2.5 text-xs font-semibold rounded-[8px] border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      isActive
                        ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white shadow-2xs"
                        : "bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042]"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location Search Input */}
          <div className="flex flex-col gap-1.5 pt-1">
            <label htmlFor="mobile-search-location" className="text-xs font-bold text-gray-700 dark:text-gray-300">
              Location
            </label>
            <div className="relative flex items-center h-[42px] px-3 bg-[#EDF0F3] dark:bg-[#202330] rounded-[10px] border-[1.5px] border-transparent focus-within:border-black dark:focus-within:border-white focus-within:bg-white dark:focus-within:bg-[#1A1C24] transition-all">
              <MapPin className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0 mr-2" />
              <input
                id="mobile-search-location"
                ref={locationInputRef}
                type="search"
                enterKeyHint="search"
                value={localLocation}
                onChange={(e) => setLocalLocation(e.target.value)}
                placeholder="City, state, or remote..."
                className="w-full h-full bg-transparent text-xs sm:text-sm font-medium text-gray-900 dark:text-white outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {localLocation && (
                <button
                  type="button"
                  onClick={() => setLocalLocation("")}
                  className="p-1 text-gray-400 hover:text-black dark:hover:text-white shrink-0 cursor-pointer"
                  aria-label="Clear location input"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick City Suggestion Chips */}
            <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
              {TOP_US_CITIES.map((city) => {
                const isSelected = localLocation.toLowerCase() === city.value.toLowerCase();
                return (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => handleToggleCity(city.value)}
                    className={`inline-flex items-center gap-1.5 h-[28px] px-2.5 text-xs font-semibold rounded-[8px] border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      isSelected
                        ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white shadow-2xs"
                        : "bg-[#EDF0F3] text-gray-700 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042]"
                    }`}
                  >
                    <MapPin className="w-3 h-3" />
                    <span>{city.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Bar */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 h-[42px] bg-black text-white dark:bg-white dark:text-black font-semibold text-xs sm:text-sm rounded-[10px] flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-[0.99] transition-transform"
            >
              <Search className="w-4 h-4" />
              <span>Search Jobs</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export function MobileSearchModal({ isOpen, onClose }: MobileSearchModalProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!isOpen || !mounted) return null;

  return <MobileSearchModalDialog onClose={onClose} />;
}
