"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Globe } from "lucide-react";
import { useJobStore } from "@/store/useJobStore";
import { useQuery } from "@tanstack/react-query";
import { LocationOption } from "@/types";
import { getLocations } from "@/app/actions/locations";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";

export function FlagWorldwide({ className = "w-5 h-3.5" }: { className?: string }) {
  return <Globe className={`${className} shrink-0 text-text-primary dark:text-white`} strokeWidth={2} />;
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

const FLAG_REGISTRY: Record<string, React.FC<{ className?: string }>> = {
  US: FlagUS,
};

const DEFAULT_FALLBACK_LOCATIONS: LocationOption[] = [
  { id: "us", country: "United States", code: "US", roleCount: 0 },
];

function getDisplayCountryCode(countryName: string, optionCode?: string): string {
  if (optionCode && optionCode.trim().length > 0) {
    return optionCode.toUpperCase();
  }
  const lower = countryName.toLowerCase().trim();
  if (lower === "united states" || lower === "usa" || lower === "us") return "US";
  if (countryName.length <= 3) return countryName.toUpperCase();
  return countryName.slice(0, 2).toUpperCase();
}

interface LocationDropdownProps {
  variant?: "default" | "chip" | "embedded";
  className?: string;
}

export function LocationDropdown({ variant = "default", className = "" }: LocationDropdownProps) {
  const location = useJobStore((s) => s.location);
  const setLocation = useJobStore((s) => s.setLocation);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [chipMenuCoords, setChipMenuCoords] = useState<{ top: number; left: number } | null>(null);

  const { data: locationsData, isLoading } = useQuery<LocationOption[]>({
    queryKey: ["locations"],
    queryFn: async () => {
      const res = await getLocations();
      if (!res.success) throw new Error("Failed to fetch locations");
      return (res.data as LocationOption[]) || DEFAULT_FALLBACK_LOCATIONS;
    },
    staleTime: 5 * 60 * 1000,
  });

  const locations = locationsData && locationsData.length > 0 ? locationsData : DEFAULT_FALLBACK_LOCATIONS;

  const fallbackSelected: LocationOption = {
    id: "us",
    country: "United States",
    code: "US",
    roleCount: 0,
  };
  const currentSelected = locations.find((opt) => opt.country.toLowerCase() === location.toLowerCase()) || fallbackSelected;
  const displayCode = getDisplayCountryCode(currentSelected?.country || location, currentSelected?.code);
  const SelectedFlag = currentSelected ? (FLAG_REGISTRY[currentSelected.code] || FlagUS) : FlagUS;

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen && dropdownRef.current && variant === "chip") {
      const rect = dropdownRef.current.getBoundingClientRect();
      const menuWidth = 210;
      setChipMenuCoords({
        top: rect.bottom + 6,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12)),
      });
    }
    setIsOpen((prev) => !prev);
  };

  useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);
  useEscapeKey(() => setIsOpen(false), isOpen);

  useEffect(() => {
    if (!isOpen || variant !== "chip") return;
    function handleScrollOrResize() {
      if (dropdownRef.current) {
        const rect = dropdownRef.current.getBoundingClientRect();
        const menuWidth = 210;
        setChipMenuCoords({
          top: rect.bottom + 6,
          left: Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12)),
        });
      }
    }
    window.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, variant]);

  const handleSelect = (optionCountry: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setLocation(optionCountry);
    setIsOpen(false);
  };

  // Render Compact Shortcut Chip for Mobile or Embedded Inside Search Bar
  if (variant === "chip" || variant === "embedded") {
    const isEmbedded = variant === "embedded";
    return (
      <div className={`relative shrink-0 select-none ${className}`} ref={dropdownRef}>
        <button
          type="button"
          onClick={handleToggle}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`Country filter: ${displayCode}. Click to change country`}
          className={`inline-flex items-center gap-1.5 select-none cursor-pointer whitespace-nowrap shrink-0 transition-all duration-150 ${
            isEmbedded
              ? `h-[32px] px-2.5 sm:px-3 rounded-[10px] font-mona text-xs sm:text-sm font-bold border-[1.5px] ${
                  isOpen
                    ? "bg-[#DFE3E8] text-gray-900 border-gray-300 dark:bg-[#2B3042] dark:text-white dark:border-[#383D52]"
                    : "bg-black/[0.05] text-gray-800 border-transparent hover:bg-black/[0.09] dark:bg-white/[0.09] dark:text-gray-200 dark:hover:bg-white/[0.14]"
                }`
              : `h-[36px] px-3 rounded-[10px] font-mona text-xs sm:text-sm font-bold border-[1.5px] ${
                  isOpen
                    ? "bg-[#DFE3E8] text-gray-900 border-gray-300 dark:bg-[#2B3042] dark:text-white dark:border-[#383D52]"
                    : "bg-[#EDF0F3] text-gray-800 border-transparent hover:bg-[#E2E6EA] dark:bg-[#202330] dark:text-gray-200 dark:hover:bg-[#2B3042]"
                }`
          }`}
        >
          <SelectedFlag className="w-[18px] h-[13px] shrink-0" />
          <span className="font-bold tracking-tight uppercase">{displayCode}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-text-muted shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isOpen ? "rotate-180 text-inherit" : ""
            }`}
            strokeWidth={2.2}
          />
        </button>

        {isOpen && locations && locations.length > 0 && (
          <div
            role="listbox"
            aria-label="Location options"
            style={
              isEmbedded
                ? undefined
                : chipMenuCoords
                ? {
                    position: "fixed",
                    top: `${chipMenuCoords.top}px`,
                    left: `${chipMenuCoords.left}px`,
                  }
                : undefined
            }
            className={`${
              isEmbedded
                ? "absolute right-0 top-full mt-2 w-[210px]"
                : "w-auto min-w-[200px]"
            } max-h-[300px] overflow-y-auto bg-bg-card border-[1.5px] border-border-color rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.15)] p-1.5 z-[130] animate-in fade-in zoom-in-95 duration-150 dark:border-[#2B3042] dark:bg-[#151720] dark:shadow-[0_8px_28px_rgba(0,0,0,0.6)]`}
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
                  onClick={(e) => handleSelect(option.country, e)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-xs sm:text-sm font-mona transition-colors duration-150 ${
                    isSelected
                      ? "bg-[#EDF0F3] hover:bg-[#E2E6EA] text-gray-900 font-bold dark:bg-[#202330] dark:hover:bg-[#2B3042] dark:text-white"
                      : "text-text-muted hover:bg-bg-tag hover:text-text-primary dark:hover:bg-[#1E212D] dark:hover:text-white font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <OptionFlag className="w-[18px] h-[13px] shrink-0" />
                    <span className="truncate">{option.country}</span>
                  </div>

                  {isSelected && (
                    <Check
                      className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0"
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

  // Default Variant for Big Screens
  return (
    <div className={`relative shrink-0 select-none md:w-[190px] ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select Job Location"
        disabled={isLoading}
        className={`h-[var(--control-h-lg)] px-3.5 w-full flex items-center justify-between gap-2.5 font-mona text-sm sm:text-base font-semibold text-gray-900 bg-[#EDF0F3] border-[1.5px] border-transparent rounded-[var(--border-radius-card)] outline-none cursor-pointer transition-all duration-150 focus:border-black dark:bg-[#202330] dark:text-white dark:focus:border-white ${
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
            isOpen ? "rotate-180 text-text-primary dark:text-white" : ""
          }`}
          strokeWidth={2.5}
        />
      </button>

      {isOpen && locations && locations.length > 0 && (
        <div
          role="listbox"
          aria-label="Location options"
          className="absolute left-0 right-0 top-full mt-1.5 w-full max-h-[300px] overflow-y-auto bg-bg-card border-[1.5px] border-border-color rounded-[var(--border-radius-card)] shadow-[0_6px_20px_rgba(0,0,0,0.12)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 dark:border-[#2B3042] dark:bg-[#151720] dark:shadow-[0_6px_24px_rgba(0,0,0,0.6)]"
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
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer text-xs sm:text-sm font-mona transition-colors duration-150 ${
                  isSelected
                    ? "bg-[#EDF0F3] hover:bg-[#E2E6EA] text-gray-900 font-bold dark:bg-[#202330] dark:hover:bg-[#2B3042] dark:text-white"
                    : "text-text-muted hover:bg-bg-tag hover:text-text-primary dark:hover:bg-[#1E212D] dark:hover:text-white font-medium"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <OptionFlag className="w-[18px] h-[13px]" />
                  <span className="truncate">{option.country}</span>
                </div>

                {isSelected && (
                  <Check
                    className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0"
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
