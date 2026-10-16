"use client";

import { useRef, useState, useCallback, useEffect, memo } from "react";
import { Search, MapPin, X, ArrowRight, Building2, AlignLeft } from "lucide-react";
import { useAppFilters } from "@/store/useJobStore";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import { LocationDropdown } from "@/components/LocationDropdown";

const TOP_US_CITIES = [
  { id: "new-york", label: "New York", value: "New York" },
  { id: "san-francisco", label: "San Francisco", value: "San Francisco" },
];

const SEARCH_OPTIONS = [
  { id: "title", label: "Job Title", icon: Search },
  { id: "company", label: "Company", icon: Building2 },
  { id: "description", label: "Description", icon: AlignLeft },
];

interface HeaderSearchbarProps {
  scrollProgress: number;
  isTransitioning: boolean;
  isFocusedOverride: boolean;
  drawerHeight: number;
  setFocusedOverride: (focused: boolean, onComplete?: () => void) => void;
  isDrawerExpanded: boolean;
  onDrawerExpandChange: (expanded: boolean) => void;
  onDrawerHeightChange: (height: number) => void;
}

function HeaderSearchbarComponent({
  scrollProgress,
  isTransitioning,
  isFocusedOverride,
  drawerHeight,
  setFocusedOverride,
  isDrawerExpanded,
  onDrawerExpandChange,
  onDrawerHeightChange,
}: HeaderSearchbarProps) {
  const keywordInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const drawerContentRef = useRef<HTMLDivElement>(null);

  // App filters from store
  const {
    searchQuery,
    setSearchQuery,
    locationQuery,
    setLocationQuery,
    searchBy,
    setSearchBy,
  } = useAppFilters("default");

  // Isolated keystroke state: typing only re-renders this component
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [localLocation, setLocalLocation] = useState(locationQuery);
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  const [prevLocationQuery, setPrevLocationQuery] = useState(locationQuery);

  // Controlled state for embedded country selector so its lifecycle strictly matches searchbar active state
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);

  // Sync state during render when external store updates (e.g. filter resets or URL hydration)
  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery);
    setLocalSearch(searchQuery);
  }

  if (locationQuery !== prevLocationQuery) {
    setPrevLocationQuery(locationQuery);
    setLocalLocation(locationQuery);
  }

  // Dynamically measure drawer height to keep spacing exact across device viewports
  useEffect(() => {
    const updateDrawerHeight = () => {
      if (drawerContentRef.current) {
        const measured = drawerContentRef.current.scrollHeight;
        if (measured > 0) {
          onDrawerHeightChange(measured);
        }
      }
    };
    updateDrawerHeight();
    window.addEventListener("resize", updateDrawerHeight);
    return () => window.removeEventListener("resize", updateDrawerHeight);
  }, [onDrawerHeightChange]);

  // Centralized deactivation handler for searchbar & embedded country selector
  const deactivateSearchbar = useCallback(() => {
    onDrawerExpandChange(false);
    setIsCountryDropdownOpen(false);
    if (isFocusedOverride) {
      setFocusedOverride(false);
    }
    keywordInputRef.current?.blur();
    locationInputRef.current?.blur();
  }, [onDrawerExpandChange, isFocusedOverride, setFocusedOverride]);

  // When drawer collapses, auto-sync country dropdown state during render
  const [prevDrawerExpanded, setPrevDrawerExpanded] = useState(isDrawerExpanded);
  if (isDrawerExpanded !== prevDrawerExpanded) {
    setPrevDrawerExpanded(isDrawerExpanded);
    if (!isDrawerExpanded && isCountryDropdownOpen) {
      setIsCountryDropdownOpen(false);
    }
  }

  // When user scrolls while drawer is open at top of page, collapse drawer and country dropdown
  useEffect(() => {
    const handleScroll = () => {
      // If focus override is active, respect the 30px threshold managed by useHeaderMorph
      if (isFocusedOverride) return;

      // If user scrolls at all while drawer is open at top of page, collapse drawer and country dropdown
      if (window.scrollY > 15) {
        deactivateSearchbar();
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isFocusedOverride, deactivateSearchbar]);

  // When header collapses while NOT in focus override, blur inputs
  useEffect(() => {
    if (scrollProgress > 0.05 && !isFocusedOverride && !isTransitioning) {
      keywordInputRef.current?.blur();
      locationInputRef.current?.blur();
    }
  }, [scrollProgress, isFocusedOverride, isTransitioning]);

  // Close search drawer & focus override on outside click or escape, resetting unsubmitted option selections
  useClickOutside(
    searchContainerRef,
    (event) => {
      // If the click is inside the location dropdown portal, do not treat as an outside click
      const target = event.target as Element | null;
      if (target?.closest?.('[data-location-dropdown-portal="true"]')) {
        return;
      }

      deactivateSearchbar();
      if (!localSearch.trim() && searchBy !== "all") {
        setSearchBy("all");
      }
    },
    isDrawerExpanded || isFocusedOverride || isCountryDropdownOpen
  );

  useEscapeKey(() => {
    deactivateSearchbar();
    if (!localSearch.trim() && searchBy !== "all") {
      setSearchBy("all");
    }
  }, isDrawerExpanded || isFocusedOverride || isCountryDropdownOpen);

  // Search submission: user clicks arrow button or hits Enter
  const handleSubmitSearch = useCallback(() => {
    setSearchQuery(localSearch.trim());
    setLocationQuery(localLocation.trim());
    deactivateSearchbar();
  }, [localSearch, localLocation, setSearchQuery, setLocationQuery, deactivateSearchbar]);

  // Independent clearing: removing keyword search effect does NOT affect location filter
  const handleClearKeyword = useCallback(() => {
    setLocalSearch("");
    setSearchQuery("");
    if (searchBy !== "all") {
      setSearchBy("all");
    }
    // If both fields are now empty, collapse searchbar completely
    if (!localLocation.trim()) {
      deactivateSearchbar();
    }
  }, [setSearchQuery, searchBy, setSearchBy, localLocation, deactivateSearchbar]);

  // Independent clearing: removing location search effect does NOT affect keyword filter
  const handleClearLocation = useCallback(() => {
    setLocalLocation("");
    setLocationQuery("");
    // If both fields are now empty, collapse searchbar completely
    if (!localSearch.trim()) {
      deactivateSearchbar();
    }
  }, [setLocationQuery, localSearch, deactivateSearchbar]);

  const handleToggleCity = useCallback((cityName: string) => {
    if (localLocation.trim().toLowerCase() === cityName.toLowerCase()) {
      setLocalLocation("");
      setLocationQuery("");
    } else {
      setLocalLocation(cityName);
      setLocationQuery(cityName);
    }
  }, [localLocation, setLocationQuery]);

  // Searchbar is active to type when full size and settled, OR when in focus override expansion
  const isSearchActiveOrSettled = scrollProgress <= 0.05 && !isTransitioning;
  const isInputInteractive = isSearchActiveOrSettled || isFocusedOverride;

  const handleActivateSearch = useCallback(
    (target: "keyword" | "location" = "keyword") => {
      const focusTarget = () => {
        requestAnimationFrame(() => {
          const input = target === "location" ? locationInputRef.current : keywordInputRef.current;
          if (input) {
            input.focus({ preventScroll: true });
            const len = input.value.length;
            try {
              input.setSelectionRange(len, len);
            } catch {
              // Ignore for browsers/types that do not support setSelectionRange
            }
          }
        });
      };

      if (!isSearchActiveOrSettled) {
        // Step 1: Expand header & searchbar to full size (small searchbar acts as button trigger)
        setFocusedOverride(true, () => {
          // Step 2: Once header reaches full size, expand the drawer downwards and ensure focus
          onDrawerExpandChange(true);
          focusTarget();
        });

        // Open drawer and focus immediately with preventScroll so user can start typing without delay
        onDrawerExpandChange(true);
        if (!localSearch.trim() && searchBy !== "all") {
          setSearchBy("all");
        }
        focusTarget();
      } else {
        // Already full size and settled: expand drawer downwards and focus
        onDrawerExpandChange(true);
        if (!localSearch.trim() && searchBy !== "all") {
          setSearchBy("all");
        }
        focusTarget();
      }
    },
    [isSearchActiveOrSettled, setFocusedOverride, onDrawerExpandChange, localSearch, searchBy, setSearchBy]
  );

  const hasAnyInput = Boolean(localSearch.trim() || localLocation.trim());

  return (
    <div
      className="hidden lg:flex absolute top-0 inset-x-0 px-[var(--space-gutter)] w-full items-start justify-center pointer-events-none will-change-transform z-30 overflow-visible"
      style={{
        height: "var(--control-h-md)",
        transform: "translateY(calc(var(--search-travel-y, 50px) * var(--scroll-inv-p, 1)))",
      }}
    >
      <div
        ref={searchContainerRef}
        className="flex items-start justify-center w-full mx-auto will-change-[max-width] pointer-events-auto"
        style={{
          maxWidth:
            "calc((100% * var(--scroll-inv-p, 1)) + min(calc(100% - var(--header-compact-side-clearance, 31rem)), var(--search-compact-max-w, 24rem)) * var(--scroll-p, 0))",
        }}
      >
        {/* Single Search Form: In small state acts as button trigger; in wide state acts as active searchbar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmitSearch();
          }}
          role="search"
          onClick={(e) => {
            if (!isSearchActiveOrSettled) {
              e.preventDefault();
              handleActivateSearch("keyword");
            }
          }}
          className={`flex-grow flex flex-col relative transition-all duration-200 border-2 min-w-0 shadow-xs will-change-[height,border-radius] ${
            !isSearchActiveOrSettled
              ? "cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 hover:bg-[#E2E6EA]/80 dark:hover:bg-[#282C3D]/80"
              : ""
          } ${
            isDrawerExpanded
              ? "bg-white border-black dark:bg-[#1A1C24] dark:border-white"
              : "bg-[#EDF0F3] border-transparent dark:bg-[#202330] dark:border-transparent focus-within:bg-white focus-within:border-black dark:focus-within:bg-[#1A1C24] dark:focus-within:border-white"
          }`}
          style={{
            borderRadius:
              "calc(var(--search-radius-full, 10px) + (9999px - var(--search-radius-full, 10px)) * var(--scroll-p, 0))",
          }}
        >
          <div className="flex flex-col lg:flex-row items-stretch w-full overflow-hidden">
            {/* 1st Half: Keyword Search Column (Role, skills, company) */}
            <div
              className={`flex-1 min-w-0 flex flex-col ${!isSearchActiveOrSettled ? "cursor-pointer" : ""}`}
              onClick={(e) => {
                if (!isSearchActiveOrSettled) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleActivateSearch("keyword");
                }
              }}
            >
              <div
                className="flex items-center pr-2 sm:pr-3 relative w-full gap-2 sm:gap-2.5 will-change-[height]"
                style={{
                  height:
                    "calc(var(--search-h-compact, 36px) + (var(--search-h-full, 48px) - var(--search-h-compact, 36px)) * var(--scroll-inv-p, 1))",
                  paddingLeft: "var(--search-icon-pad, 1.25rem)",
                }}
              >
                <Search className="w-4 h-4 shrink-0 text-gray-700 dark:text-gray-200 pointer-events-none" />
                <div className="relative flex-1 min-w-0 h-full flex items-center">
                  <input
                    ref={keywordInputRef}
                    type="search"
                    enterKeyHint="search"
                    readOnly={!isInputInteractive}
                    tabIndex={0}
                    value={localSearch}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      setLocalSearch(nextVal);
                      // Reset search effect only when field is emptied; do NOT auto-apply while modifying
                      if (!nextVal.trim() && searchQuery) {
                        setSearchQuery("");
                        if (searchBy !== "all") {
                          setSearchBy("all");
                        }
                      }
                    }}
                    onClick={(e) => {
                      if (!isSearchActiveOrSettled) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleActivateSearch("keyword");
                      } else {
                        onDrawerExpandChange(true);
                        if (!localSearch.trim() && searchBy !== "all") {
                          setSearchBy("all");
                        }
                      }
                    }}
                    onFocus={() => {
                      if (isSearchActiveOrSettled || isFocusedOverride) {
                        onDrawerExpandChange(true);
                        if (!localSearch.trim() && searchBy !== "all") {
                          setSearchBy("all");
                        }
                      }
                    }}
                    className={`w-full h-full pl-0 pr-1 font-body font-medium text-gray-900 bg-transparent outline-none dark:text-white [&::-webkit-search-cancel-button]:hidden text-xs sm:text-sm relative z-10 ${
                      !isSearchActiveOrSettled ? "cursor-pointer" : "cursor-text"
                    }`}
                  />
                  {!localSearch && (
                    <div className="absolute inset-0 flex items-center pointer-events-none select-none overflow-hidden pr-2">
                      <span
                        className="absolute left-0 truncate text-gray-400 font-body text-xs sm:text-sm font-medium transition-none will-change-[opacity,transform]"
                        style={{
                          opacity: "var(--scroll-inv-p, 1)",
                          transform: "translateY(calc(-8px * var(--scroll-p, 0)))",
                        }}
                      >
                        Job title, skills, or company...
                      </span>
                      <span
                        className="absolute left-0 truncate text-gray-400 font-body text-xs sm:text-sm font-medium transition-none will-change-[opacity,transform]"
                        style={{
                          opacity: "var(--scroll-p, 0)",
                          transform: "translateY(calc(8px * var(--scroll-inv-p, 1)))",
                        }}
                      >
                        Search...
                      </span>
                    </div>
                  )}
                </div>
                {localSearch && isSearchActiveOrSettled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearKeyword();
                    }}
                    className="p-1 rounded-sm text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer shrink-0"
                    aria-label="Clear keyword search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Expandable Keyword Filter Options */}
              <div
                className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] w-full overflow-hidden"
                style={{
                  gridTemplateRows: isDrawerExpanded && scrollProgress < 0.2 ? "1fr" : "0fr",
                  opacity: isDrawerExpanded && scrollProgress < 0.2 ? 1 : 0,
                }}
              >
                <div ref={drawerContentRef} className="overflow-hidden">
                  <div
                    className="pr-2 pb-2.5 pt-0.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
                    style={{
                      paddingLeft: "var(--search-icon-pad, 1.25rem)",
                    }}
                  >
                    {SEARCH_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isActive = searchBy === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setSearchBy(isActive ? "all" : option.id)}
                          className={`inline-flex items-center gap-1.5 h-[30px] px-3 text-xs transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px] ${
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

            {/* Vertical Section Divider: Rounded ends top & bottom */}
            <div className="w-[1.5px] bg-stone-300 dark:bg-[#3E455E] my-2.5 sm:my-3 rounded-full self-stretch shrink-0" />

            {/* 2nd Half: Location Search Column (Contains Location input, City chips, and Country selector) */}
            <div
              className={`flex-1 min-w-0 flex flex-row items-stretch ${!isSearchActiveOrSettled ? "cursor-pointer" : ""}`}
              onClick={(e) => {
                if (!isSearchActiveOrSettled) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleActivateSearch("location");
                }
              }}
            >
              <div className="flex-1 min-w-0 flex flex-col">
                <div
                  className="flex items-center relative w-full gap-2 sm:gap-2.5 will-change-[height]"
                  style={{
                    height:
                      "calc(var(--search-h-compact, 36px) + (var(--search-h-full, 48px) - var(--search-h-compact, 36px)) * var(--scroll-inv-p, 1))",
                    paddingLeft: "var(--search-icon-pad, 1.25rem)",
                    paddingRight:
                      "calc(var(--search-icon-pad, 1.25rem) * var(--scroll-p, 0) + 0.375rem * var(--scroll-inv-p, 1))",
                  }}
                >
                  <MapPin className="w-4 h-4 shrink-0 text-gray-700 dark:text-gray-200 pointer-events-none" />
                  <div className="relative flex-1 min-w-0 h-full flex items-center">
                    <input
                      ref={locationInputRef}
                      type="search"
                      enterKeyHint="search"
                      readOnly={!isInputInteractive}
                      tabIndex={0}
                      value={localLocation}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setLocalLocation(nextVal);
                        // Reset search effect only when field is emptied; do NOT auto-apply while modifying
                        if (!nextVal.trim() && locationQuery) {
                          setLocationQuery("");
                        }
                      }}
                      onClick={(e) => {
                        if (!isSearchActiveOrSettled) {
                          e.preventDefault();
                          e.stopPropagation();
                          handleActivateSearch("location");
                        } else {
                          onDrawerExpandChange(true);
                        }
                      }}
                      onFocus={() => {
                        if (isSearchActiveOrSettled || isFocusedOverride) {
                          onDrawerExpandChange(true);
                        }
                      }}
                      className={`w-full h-full pl-0 pr-1 font-body font-medium text-gray-900 bg-transparent outline-none dark:text-white [&::-webkit-search-cancel-button]:hidden text-xs sm:text-sm relative z-10 ${
                        !isSearchActiveOrSettled ? "cursor-pointer" : "cursor-text"
                      }`}
                    />
                    {!localLocation && (
                      <div className="absolute inset-0 flex items-center pointer-events-none select-none overflow-hidden pr-2">
                        <span
                          className="absolute left-0 truncate text-gray-400 font-body text-xs sm:text-sm font-medium transition-none will-change-[opacity,transform]"
                          style={{
                            opacity: "var(--scroll-inv-p, 1)",
                            transform: "translateY(calc(-8px * var(--scroll-p, 0)))",
                          }}
                        >
                          City, state, or remote...
                        </span>
                        <span
                          className="absolute left-0 truncate text-gray-400 font-body text-xs sm:text-sm font-medium transition-none will-change-[opacity,transform]"
                          style={{
                            opacity: "var(--scroll-p, 0)",
                            transform: "translateY(calc(8px * var(--scroll-inv-p, 1)))",
                          }}
                        >
                          Location...
                        </span>
                      </div>
                    )}
                  </div>
                  {localLocation && isSearchActiveOrSettled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearLocation();
                      }}
                      className="p-1 rounded-sm text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer shrink-0 mr-1"
                      aria-label="Clear location search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Expandable Location Chips */}
                <div
                  className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] w-full overflow-hidden"
                  style={{
                    gridTemplateRows: isDrawerExpanded && scrollProgress < 0.2 ? "1fr" : "0fr",
                    opacity: isDrawerExpanded && scrollProgress < 0.2 ? 1 : 0,
                  }}
                >
                  <div className="overflow-hidden">
                    <div
                      className="pr-2 pb-2.5 pt-0.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
                      style={{
                        paddingLeft: "var(--search-icon-pad, 1.25rem)",
                      }}
                    >
                      {TOP_US_CITIES.map((city) => {
                        const isSelected = localLocation.toLowerCase() === city.value.toLowerCase();
                        return (
                          <button
                            key={city.id}
                            type="button"
                            onClick={() => handleToggleCity(city.value)}
                            className={`inline-flex items-center gap-1.5 h-[30px] px-3 text-xs transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px] ${
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

              {/* Embedded Country Selector: Functionally independent from searchbar */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                className={`flex items-center shrink-0 overflow-hidden will-change-[max-width,opacity,padding] transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                  isDrawerExpanded && scrollProgress < 0.2 ? "self-end pb-2.5 pt-0.5" : "self-center"
                }`}
                style={{
                  maxWidth: "calc(110px * var(--scroll-inv-p, 1))",
                  opacity: "var(--scroll-inv-p, 1)",
                  paddingRight: "calc(var(--search-icon-pad, 1.25rem) * var(--scroll-inv-p, 1))",
                  pointerEvents: scrollProgress > 0.2 ? "none" : "auto",
                }}
              >
                <div className="shrink-0">
                  <LocationDropdown
                    variant="embedded"
                    isOpen={isCountryDropdownOpen}
                    onOpenChange={setIsCountryDropdownOpen}
                  />
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* External Desktop Search Arrow Button: Middle-aligned to searchbar when expanded, smoothly moving along with expansion */}
        <div
          className="hidden lg:flex items-center justify-center shrink-0 overflow-hidden will-change-[max-width,opacity,margin,transform] transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            maxWidth: "calc(var(--control-h-lg) * var(--scroll-inv-p, 1))",
            opacity: "var(--scroll-inv-p, 1)",
            marginLeft: "calc(0.5rem * var(--scroll-inv-p, 1))",
            transform:
              isDrawerExpanded && scrollProgress < 0.2
                ? `translateY(${drawerHeight * 0.5}px)`
                : "translateY(0px)",
            pointerEvents: scrollProgress > 0.2 ? "none" : "auto",
          }}
        >
          <button
            type="button"
            onClick={handleSubmitSearch}
            className="w-[var(--control-h-lg)] h-[var(--control-h-lg)] rounded-full bg-[#E2E6EA] hover:bg-[#D8DCE2] dark:bg-[#202330] dark:hover:bg-[#2B3042] flex items-center justify-center transition-all duration-150 cursor-pointer shadow-xs active:scale-95 select-none shrink-0"
            aria-label="Submit search"
            title="Search jobs"
          >
            <ArrowRight
              className={`w-5 h-5 transition-colors duration-150 ${
                hasAnyInput ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"
              }`}
              strokeWidth={2.5}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

export const HeaderSearchbar = memo(HeaderSearchbarComponent);
