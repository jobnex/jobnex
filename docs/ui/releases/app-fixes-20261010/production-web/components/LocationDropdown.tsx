"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Globe } from "lucide-react";
import { useJobStore } from "@/store/useJobStore";
import { useQuery } from "@tanstack/react-query";
import { LocationOption } from "@/types";

export function FlagWorldwide({ className = "w-5 h-3.5" }: { className?: string }) {
  return <Globe className={`${className} shrink-0 text-text-primary dark:text-[#ACEE5F]`} strokeWidth={2} />;
}

export function FlagUS({ className = "w-5 h-3.5" }: { className?: string }) {
  return (
    <svg className={`${className} rounded-[2px] shrink-0`} viewBox="0 0 640 480" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="#BD3D44" d="M0 0h640v480H0z"/>
      <path stroke="#FFF" strokeWidth="37" d="M0 55.4h640M0 129.2h640M0 203h640M0 277h640M0 350.8h640M0 424.6h640"/>
      <path fill="#192F5D" d="M0 0h256v258.5H0z"/>
      <g fill="#FFF">
        <circle cx="28" cy="24" r="7"/>
        <circle cx="70" cy="24" r="7"/>
        <circle cx="112" cy="24" r="7"/>
        <circle cx="154" cy="24" r="7"/>
        <circle cx="196" cy="24" r="7"/>
        <circle cx="238" cy="24" r="7"/>
        <circle cx="49" cy="50" r="7"/>
        <circle cx="91" cy="50" r="7"/>
        <circle cx="133" cy="50" r="7"/>
        <circle cx="175" cy="50" r="7"/>
        <circle cx="217" cy="50" r="7"/>
        <circle cx="28" cy="76" r="7"/>
        <circle cx="70" cy="76" r="7"/>
        <circle cx="112" cy="76" r="7"/>
        <circle cx="154" cy="76" r="7"/>
        <circle cx="196" cy="76" r="7"/>
        <circle cx="238" cy="76" r="7"/>
        <circle cx="49" cy="102" r="7"/>
        <circle cx="91" cy="102" r="7"/>
        <circle cx="133" cy="102" r="7"/>
        <circle cx="175" cy="102" r="7"/>
        <circle cx="217" cy="102" r="7"/>
        <circle cx="28" cy="128" r="7"/>
        <circle cx="70" cy="128" r="7"/>
        <circle cx="112" cy="128" r="7"/>
        <circle cx="154" cy="128" r="7"/>
        <circle cx="196" cy="128" r="7"/>
        <circle cx="238" cy="128" r="7"/>
        <circle cx="49" cy="154" r="7"/>
        <circle cx="91" cy="154" r="7"/>
        <circle cx="133" cy="154" r="7"/>
        <circle cx="175" cy="154" r="7"/>
        <circle cx="217" cy="154" r="7"/>
        <circle cx="28" cy="180" r="7"/>
        <circle cx="70" cy="180" r="7"/>
        <circle cx="112" cy="180" r="7"/>
        <circle cx="154" cy="180" r="7"/>
        <circle cx="196" cy="180" r="7"/>
        <circle cx="238" cy="180" r="7"/>
        <circle cx="49" cy="206" r="7"/>
        <circle cx="91" cy="206" r="7"/>
        <circle cx="133" cy="206" r="7"/>
        <circle cx="175" cy="206" r="7"/>
        <circle cx="217" cy="206" r="7"/>
        <circle cx="28" cy="232" r="7"/>
        <circle cx="70" cy="232" r="7"/>
        <circle cx="112" cy="232" r="7"/>
        <circle cx="154" cy="232" r="7"/>
        <circle cx="196" cy="232" r="7"/>
        <circle cx="238" cy="232" r="7"/>
      </g>
    </svg>
  );
}

export function FlagUK({ className = "w-5 h-3.5" }: { className?: string }) {
  return (
    <svg className={`${className} rounded-[2px] shrink-0`} viewBox="0 0 640 480" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="#012169" d="M0 0h640v480H0z"/>
      <path stroke="#FFF" strokeWidth="60" d="m0 0 640 480M640 0 0 480"/>
      <path stroke="#C8102E" strokeWidth="40" d="m0 0 640 480M640 0 0 480"/>
      <path stroke="#FFF" strokeWidth="100" d="M320 0v480M0 240h640"/>
      <path stroke="#C8102E" strokeWidth="60" d="M320 0v480M0 240h640"/>
    </svg>
  );
}

export function FlagIN({ className = "w-5 h-3.5" }: { className?: string }) {
  return (
    <svg className={`${className} rounded-[2px] shrink-0`} viewBox="0 0 640 480" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="#FF9933" d="M0 0h640v160H0z"/>
      <path fill="#FFF" d="M0 160h640v160H0z"/>
      <path fill="#138808" d="M0 320h640v160H0z"/>
      <circle cx="320" cy="240" r="54" stroke="#000080" strokeWidth="7" fill="none"/>
      <circle cx="320" cy="240" r="14" fill="#000080"/>
      <g stroke="#000080" strokeWidth="3.5">
        <line x1="320" y1="188" x2="320" y2="292"/>
        <line x1="268" y1="240" x2="372" y2="240"/>
        <line x1="283" y1="203" x2="357" y2="277"/>
        <line x1="283" y1="277" x2="357" y2="203"/>
        <line x1="271" y1="220" x2="369" y2="260"/>
        <line x1="271" y1="260" x2="369" y2="220"/>
        <line x1="300" y1="191" x2="340" y2="289"/>
        <line x1="340" y1="191" x2="300" y2="289"/>
      </g>
    </svg>
  );
}

const FLAG_REGISTRY: Record<string, React.FC<{ className?: string }>> = {
  US: FlagUS,
  UK: FlagUK,
  IN: FlagIN,
};
import { getLocations } from "@/app/actions/locations";

export function LocationDropdown() {
  const { location, setLocation } = useJobStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: locations, isLoading } = useQuery<LocationOption[]>({
    queryKey: ["locations"],
    queryFn: async () => {
      const res = await getLocations();
      if (!res.success) throw new Error(res.error || "Failed to fetch locations");
      return (res.data as LocationOption[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const currentSelected = locations?.find((opt) => opt.country.toLowerCase() === location.toLowerCase()) || { country: location, code: "WW" };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelect = (optionCountry: string) => {
    setLocation(optionCountry);
    setIsOpen(false);
  };

  const SelectedFlag = currentSelected ? (FLAG_REGISTRY[currentSelected.code] || FlagWorldwide) : FlagWorldwide;

  return (
    <div className="relative shrink-0 select-none" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select Job Location"
        disabled={isLoading}
        className={`h-[48px] px-3.5 min-w-[190px] w-full flex items-center justify-between gap-3 font-body text-[0.95rem] font-semibold text-gray-900 bg-[#EDF0F3] border-[1.5px] border-transparent rounded-[12px] outline-none cursor-pointer transition-all duration-150 focus:border-black dark:bg-[#202330] dark:text-white dark:focus:border-white ${
          isOpen
            ? "border-black dark:border-white bg-[#E2E6EA] dark:bg-[#1A1C24]"
            : "hover:bg-[#E2E6EA] hover:border-gray-300 dark:hover:border-[#383D52]"
        } ${isLoading ? "opacity-70 cursor-not-allowed" : ""}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <SelectedFlag className="w-[18px] h-[13px]" />
          <span className="truncate">
            {isLoading ? "Loading..." : (currentSelected?.country || "Select Location")}
          </span>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-text-muted shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isOpen ? "rotate-180 text-text-primary dark:text-[#ACEE5F]" : ""
          }`}
          strokeWidth={2.5}
        />
      </button>

      {isOpen && locations && locations.length > 0 && (
        <div
          role="listbox"
          aria-label="Location options"
          className="absolute left-0 top-full mt-1.5 w-full min-w-[210px] bg-bg-card border-[1.5px] border-border-color rounded-lg shadow-[0_6px_20px_rgba(0,0,0,0.12)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 dark:border-[#2B3042] dark:bg-[#151720] dark:shadow-[0_6px_24px_rgba(0,0,0,0.6)]"
        >
          {locations.map((option) => {
            const isSelected = option.country.toLowerCase() === currentSelected?.country.toLowerCase();
            const OptionFlag = FLAG_REGISTRY[option.code] || FlagWorldwide;

            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(option.country)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer text-[0.88rem] transition-colors duration-150 ${
                  isSelected
                    ? "bg-brand-lime/25 text-text-primary font-bold dark:bg-[#ACEE5F]/15 dark:text-[#ACEE5F]"
                    : "text-text-muted hover:bg-bg-tag hover:text-text-primary dark:hover:bg-[#1E212D] dark:hover:text-white font-medium"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <OptionFlag className="w-[18px] h-[13px]" />
                  <span>{option.country}</span>
                </div>

                {isSelected && (
                  <Check
                    className="w-4 h-4 text-brand-dark dark:text-[#ACEE5F] shrink-0"
                    strokeWidth={2.8}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
