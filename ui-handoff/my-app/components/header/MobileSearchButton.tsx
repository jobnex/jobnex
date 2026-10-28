"use client";

import { useState, useCallback, memo } from "react";
import { Search, X } from "lucide-react";
import { useAppFilters } from "@/store/useJobStore";
import { LocationDropdown } from "@/components/LocationDropdown";
import { MobileSearchModal } from "./MobileSearchModal";

interface MobileSearchButtonProps {
  scrollProgress?: number;
}

function MobileSearchButtonComponent({ scrollProgress = 0 }: MobileSearchButtonProps) {
  const {
    searchQuery,
    setSearchQuery,
    locationQuery,
    setLocationQuery,
    setSearchBy,
  } = useAppFilters("default");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCountryOpen, setIsCountryOpen] = useState(false);

  const hasActiveQuery = Boolean(searchQuery.trim() || locationQuery.trim());

  let querySummary = "";
  if (searchQuery.trim() && locationQuery.trim()) {
    querySummary = `${searchQuery.trim()} in ${locationQuery.trim()}`;
  } else if (searchQuery.trim()) {
    querySummary = searchQuery.trim();
  } else if (locationQuery.trim()) {
    querySummary = `Jobs in ${locationQuery.trim()}`;
  }

  const handleQuickClear = useCallback(() => {
    setSearchQuery("");
    setLocationQuery("");
    setSearchBy("all");
  }, [setSearchQuery, setLocationQuery, setSearchBy]);

  return (
    <>
      <div
        className="absolute top-0 inset-x-0 w-full flex items-center justify-center pointer-events-none will-change-transform z-30 overflow-visible"
        style={{
          height: "var(--control-h-md, 36px)",
          transform:
            "translateX(calc(-20px * var(--scroll-p, 0))) translateY(calc((var(--control-h-md, 36px) + var(--gap-header-row-mobile, 1.0rem)) * var(--scroll-inv-p, 1)))",
        }}
      >
        <div
          className="w-full min-w-[150px] max-w-[32rem] flex items-center bg-[#EDF0F3] dark:bg-[#202330] border-[1.5px] border-transparent hover:border-gray-300 dark:hover:border-[#383D52] shadow-2xs pointer-events-auto will-change-[max-width,height,border-radius] overflow-hidden"
          style={{
            maxWidth:
              "calc(min(52%, 230px) + (94% - min(52%, 230px)) * var(--scroll-inv-p, 1))",
            height: "calc(32px + (var(--search-mobile-h-full, 42px) - 32px) * var(--scroll-inv-p, 1))",
            borderRadius: "calc(9999px - (9999px - 12px) * var(--scroll-inv-p, 1))",
          }}
        >
          {/* Search trigger button */}
          <button
            type="button"
            onClick={() => {
              setIsCountryOpen(false);
              setIsModalOpen(true);
            }}
            aria-label="Open search dialog"
            className="flex-1 flex items-center min-w-0 h-full pl-3 sm:pl-3.5 pr-2 gap-2.5 text-left cursor-pointer select-none active:opacity-85"
          >
            <Search className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" strokeWidth={2.2} />
            <div className="flex-1 min-w-0 flex items-center overflow-hidden">
              {hasActiveQuery ? (
                <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {querySummary}
                </span>
              ) : (
                <div className="relative flex-1 min-w-0 h-full flex items-center overflow-hidden">
                  <span
                    className="truncate text-gray-400 font-medium text-xs sm:text-sm select-none"
                    style={{
                      display: scrollProgress > 0.4 ? "none" : "inline",
                    }}
                  >
                    Search jobs, skills, company...
                  </span>
                  <span
                    className="truncate text-gray-400 font-medium text-xs select-none"
                    style={{
                      display: scrollProgress > 0.4 ? "inline" : "none",
                    }}
                  >
                    Search...
                  </span>
                </div>
              )}
            </div>
          </button>

          {/* Quick Clear Button (Only when active query exists and in full mode) */}
          {hasActiveQuery && (
            <button
              type="button"
              onClick={handleQuickClear}
              aria-label="Clear active search"
              className="p-1 mr-1 text-gray-400 hover:text-black dark:hover:text-white rounded-md transition-colors cursor-pointer shrink-0"
              style={{
                display: scrollProgress > 0.4 ? "none" : "block",
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Embedded Location / Country Selector (Removes when scrolled up into header) */}
          <div
            className="shrink-0 flex items-center overflow-hidden will-change-[max-width,opacity]"
            style={{
              maxWidth: "calc(96px * var(--scroll-inv-p, 1))",
              opacity: "var(--scroll-inv-p, 1)",
              pointerEvents: scrollProgress > 0.3 ? "none" : "auto",
              paddingRight: "calc(7px * var(--scroll-inv-p, 1))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <LocationDropdown
              variant="embedded"
              isOpen={isCountryOpen}
              onOpenChange={setIsCountryOpen}
            />
          </div>
        </div>
      </div>

      {/* Accessible Mobile Search Modal */}
      <MobileSearchModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

export const MobileSearchButton = memo(MobileSearchButtonComponent);
