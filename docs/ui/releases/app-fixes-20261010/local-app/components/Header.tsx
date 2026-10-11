"use client";

import { useTheme } from "next-themes";
import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from "react";
import {
  Moon,
  Sun,
  Bookmark,
  Bell,
  Settings,
  LogOut,
  ChevronRight,
  Search,
  MapPin,
  X,
  SlidersHorizontal,
  RotateCcw,
  ArrowRight,
  Building2,
  AlignLeft,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { StrawberryLogo } from "@/components/ui/StrawberryLogo";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import { authClient } from "@/lib/auth/client";
import { useCreditStore } from "@/store/useCreditStore";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "@/app/actions/profile";
import { useJobStore, useAppFilters } from "@/store/useJobStore";
import { useHeaderMorph } from "@/lib/hooks/useHeaderMorph";
import { LocationDropdown } from "./LocationDropdown";

const TOP_US_CITIES = [
  { id: "new-york", label: "New York", value: "New York" },
  { id: "san-francisco", label: "San Francisco", value: "San Francisco" },
];

const SEARCH_OPTIONS = [
  { id: "title", label: "Job Title", icon: Search },
  { id: "company", label: "Company", icon: Building2 },
  { id: "description", label: "Description", icon: AlignLeft },
];

const subscribeHydration = () => () => {};

export function Header() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isProfileHovered, setIsProfileHovered] = useState(false);
  const showProfileMenu = isProfileOpen || isProfileHovered;
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const keywordInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const pathname = usePathname();
  const router = useRouter();
  const isJobBoard = pathname === "/";

  // Mathematical continuous snap engine
  const {
    scrollProgress,
    isFocusedOverride,
    setFocusedOverride,
    headerRef,
    shortcutsContainerRef,
    shortcutsTrackRef,
  } = useHeaderMorph({ enabled: isJobBoard });

  const setIsHeaderScrolled = useJobStore((s) => s.setIsHeaderScrolled);
  const toggleFilterMenu = useJobStore((s) => s.toggleFilterMenu);

  // Sync scroll status to global store on settled state
  useEffect(() => {
    setIsHeaderScrolled(scrollProgress > 0.5);
  }, [scrollProgress, setIsHeaderScrolled]);

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
  } = useAppFilters("default");

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [localLocation, setLocalLocation] = useState(locationQuery);
  const [isSearchDrawerExpanded, setIsSearchDrawerExpanded] = useState(false);

  const [previousQueries, setPreviousQueries] = useState({ searchQuery, locationQuery });
  if (previousQueries.searchQuery !== searchQuery || previousQueries.locationQuery !== locationQuery) {
    setPreviousQueries({ searchQuery, locationQuery });
    if (previousQueries.searchQuery !== searchQuery) setLocalSearch(searchQuery);
    if (previousQueries.locationQuery !== locationQuery) setLocalLocation(locationQuery);
  }

  const pathnameTab = pathname.startsWith("/job-hunt")
    ? "Job Hunt"
    : pathname.startsWith("/saved-jobs")
      ? "Saved"
      : pathname.startsWith("/profile")
        ? "Profile"
        : "Job Board";
  const [activeTab, setActiveTab] = useState<"Job Board" | "Job Hunt" | "Saved" | "Profile">(pathnameTab);
  const [prevPathnameTab, setPrevPathnameTab] = useState(pathnameTab);
  const [hoveredTab, setHoveredTab] = useState<"Job Board" | "Job Hunt" | "Saved" | "Profile" | null>(null);

  // Authentication & Profile
  const { data: sessionData, isPending: isAuthPending } = authClient.useSession();
  useEffect(() => {
    const userId = sessionData?.user?.id || null;
    useCreditStore.getState().setUser(userId);
    if (userId) void useCreditStore.getState().fetchCredits();
  }, [sessionData?.user?.id]);
  const { data: profileData } = useQuery({
    queryKey: ["user-profile", sessionData?.user?.id],
    queryFn: async () => {
      const res = await getProfile();
      return res.data;
    },
    enabled: !!sessionData?.user,
    staleTime: 5 * 60 * 1000,
  });

  const displayName = profileData?.fullName || sessionData?.user?.name || sessionData?.user?.email;

  if (pathnameTab !== prevPathnameTab) {
    setActiveTab(pathnameTab);
    setPrevPathnameTab(pathnameTab);
  }

  // Close profile dropdown on outside click or escape
  useClickOutside(profileDropdownRef, () => {
    setIsProfileOpen(false);
    setIsProfileHovered(false);
  }, showProfileMenu);

  useEscapeKey(() => {
    setIsProfileOpen(false);
    setIsProfileHovered(false);
  }, showProfileMenu);

  // Close search drawer & focus override on outside click or escape, resetting unsubmitted option selections
  useClickOutside(searchContainerRef, () => {
    setIsSearchDrawerExpanded(false);
    if (isFocusedOverride) {
      setFocusedOverride(false);
    }
    if (!localSearch.trim() && searchBy !== "all") {
      setSearchBy("all");
    }
  }, isSearchDrawerExpanded || isFocusedOverride);

  useEscapeKey(() => {
    setIsSearchDrawerExpanded(false);
    if (isFocusedOverride) {
      setFocusedOverride(false);
    }
    if (!localSearch.trim() && searchBy !== "all") {
      setSearchBy("all");
    }
  }, isSearchDrawerExpanded || isFocusedOverride);

  // Close dropdown on route change
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setIsProfileOpen(false);
    setIsProfileHovered(false);
    setPrevPathname(pathname);
  }

  const currentPillTab = hoveredTab ?? activeTab;
  const isHoveringOther = hoveredTab !== null && hoveredTab !== activeTab;

  const handleTabClick = (tab: "Job Board" | "Job Hunt", href: string) => {
    setActiveTab(tab);
    setHoveredTab(null);
    router.push(href);
  };



  // Search submission & clearing
  const handleSubmitSearch = useCallback(() => {
    setSearchQuery(localSearch.trim());
    setLocationQuery(localLocation.trim());
    setIsSearchDrawerExpanded(false);
    setFocusedOverride(false);
    keywordInputRef.current?.blur();
    locationInputRef.current?.blur();
  }, [localSearch, localLocation, setSearchQuery, setLocationQuery, setFocusedOverride]);

  const handleClearKeyword = useCallback(() => {
    setLocalSearch("");
    setSearchQuery("");
    if (searchBy !== "all") {
      setSearchBy("all");
    }
  }, [setSearchQuery, searchBy, setSearchBy]);

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

  const handleInputFocus = useCallback(() => {
    if (scrollProgress > 0.05 && !isFocusedOverride) {
      setFocusedOverride(true);
    }
    setIsSearchDrawerExpanded(true);
    if (!localSearch.trim() && searchBy !== "all") {
      setSearchBy("all");
    }
  }, [scrollProgress, isFocusedOverride, setFocusedOverride, localSearch, searchBy, setSearchBy]);

  // Filter calculations
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

  const hasAnyInput = Boolean(localSearch.trim() || localLocation.trim());

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-[100] w-full bg-[#F8F9FA]/95 dark:bg-[#111216]/95 backdrop-blur-md pt-[var(--space-header-py)] pb-2 select-none border-b border-transparent will-change-[height] [overflow-anchor:none]"
      style={
        {
          "--search-h-full": "var(--control-h-lg)",
          "--search-h-compact": "var(--control-h-md)",
          "--search-radius-full": "var(--border-radius-card)",
          "--search-radius-compact": "var(--border-radius-pill)",
          "--gap-full": "0.875rem",
          "--gap-compact": "0.625rem",
          "--search-travel-y": "calc(var(--control-h-md) + 0.875rem)",
          "--tab-travel-y": "calc(-1 * var(--control-h-md) * 0.75)",
          "--search-icon-pad": "calc(0.875rem + 0.375rem * var(--scroll-inv-p, 1))",
        } as React.CSSProperties
      }
    >
      <div className="fluid-container relative">
        {/* ROW 1: Logo & Morphing Wordmark | Tab Switcher | Right Actions */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 relative h-[var(--control-h-md)]">
          
          {/* Left: Brand Logo & Wordmark (Wordmark smoothly collapses width & opacity on mobile as scroll progresses) */}
          <div className="flex justify-start items-center min-w-0 shrink-0 md:flex-1 relative z-20">
            <Link
              href="/"
              className="flex items-center gap-2 sm:gap-2.5 font-heading text-xl sm:text-2xl font-semibold text-text-primary group select-none shrink-0"
            >
              <StrawberryLogo size="md" />
              <span
                className={`font-heading font-semibold text-text-primary overflow-hidden whitespace-nowrap will-change-[max-width,opacity,transform] ${
                  isJobBoard ? "md:!max-w-[200px] md:!opacity-100 md:!transform-none" : ""
                }`}
                style={
                  isJobBoard
                    ? {
                        maxWidth: "calc(var(--scroll-inv-p, 1) * 160px)",
                        opacity: "var(--scroll-inv-p, 1)",
                        transform: "translateX(calc(-8px * var(--scroll-p, 0)))",
                      }
                    : undefined
                }
              >
                strawberry Jobs
              </span>
            </Link>
          </div>

          {/* Center: Tab Switcher (Moves UP and fades away as searchbar morphs into Row 1, and comes DOWN when returning to full) */}
          <div className="flex-1 flex items-center justify-center min-w-0 px-1 sm:px-2 md:px-3 relative z-10 h-full">
            <div
              className="hidden md:flex items-center relative will-change-[opacity,transform]"
              style={{
                opacity: isJobBoard ? "var(--scroll-inv-p, 1)" : 1,
                transform: isJobBoard
                  ? "translateY(calc(var(--tab-travel-y, -26px) * var(--scroll-p, 0))) scale(calc(1 - 0.06 * var(--scroll-p, 0)))"
                  : "none",
                pointerEvents: isJobBoard && scrollProgress > 0.3 ? "none" : "auto",
              }}
              onMouseLeave={() => setHoveredTab(null)}
            >
              {/* Sliding Pill Indicator */}
              <div
                className={`absolute top-0 bottom-0 w-[100px] rounded-full transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] pointer-events-none ${
                  currentPillTab === "Saved" || currentPillTab === "Profile"
                    ? "opacity-0"
                    : isHoveringOther
                      ? "opacity-100 bg-transparent border-[1.5px] border-[#111827] shadow-none dark:bg-transparent dark:border-[#4B5563] dark:shadow-none"
                      : "opacity-100 bg-[#111827] border-[1.5px] border-transparent dark:bg-[#222534] dark:border-transparent dark:shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
                }`}
                style={{ left: currentPillTab === "Job Hunt" ? "calc(100% - 100px)" : "0px" }}
              />
              <button
                type="button"
                onClick={() => handleTabClick("Job Board", "/")}
                onMouseEnter={() => setHoveredTab("Job Board")}
                className={`relative z-10 w-[100px] py-[0.45rem] text-sm font-bold rounded-full cursor-pointer transition-colors duration-250 ${
                  activeTab === "Job Board"
                    ? isHoveringOther
                      ? "text-text-primary dark:text-[#E2E8F0]"
                      : "text-white"
                    : hoveredTab === "Job Board"
                    ? "text-[#111827] dark:text-white"
                    : "text-text-muted hover:text-text-primary dark:hover:text-white"
                }`}
              >
                Job Board
              </button>
              <button
                type="button"
                onClick={() => handleTabClick("Job Hunt", "/job-hunt")}
                onMouseEnter={() => setHoveredTab("Job Hunt")}
                className={`relative z-10 w-[100px] py-[0.45rem] text-sm font-bold rounded-full cursor-pointer transition-colors duration-250 ${
                  activeTab === "Job Hunt"
                    ? isHoveringOther
                      ? "text-text-primary dark:text-[#E2E8F0]"
                      : "text-white"
                    : hoveredTab === "Job Hunt"
                    ? "text-[#111827] dark:text-white"
                    : "text-text-muted hover:text-text-primary dark:hover:text-white"
                }`}
              >
                Job Hunt
              </button>
            </div>
          </div>

          {/* Right: Actions (Saved, Notifications, Profile, Gap, Theme Toggle) */}
          <div className="flex items-center justify-end gap-1 sm:gap-2 shrink-0 md:flex-1 relative z-20">
            {/* Authentication Actions */}
            {isAuthPending ? (
              <div className="h-9 w-16 sm:w-20 animate-pulse bg-[#DFE4EC] dark:bg-[#222534] rounded-md shrink-0 hidden md:block" />
            ) : !sessionData?.user ? (
              /* Sign In Button */
              <Link
                href={`/auth?callbackUrl=${encodeURIComponent(pathname)}`}
                className="h-9 hidden md:inline-flex items-center justify-center px-3.5 sm:px-4 rounded-md border-[1.5px] border-border-color bg-brand-dark text-white font-heading font-semibold text-[0.84rem] transition-all duration-150 hover:bg-brand-lime hover:text-[#111827] active:scale-[0.98] cursor-pointer select-none dark:border-[#111827] dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white dark:hover:text-[#111827]"
              >
                <span>Sign In</span>
              </Link>
            ) : (
              <div className="hidden md:flex items-center gap-1 sm:gap-2">
                {/* Saved Icon with Tooltip */}
                <div className="relative group/tooltip flex items-center justify-center">
                  <Link
                    href="/saved-jobs"
                    onClick={(e) => {
                      (e.currentTarget as HTMLElement).blur();
                      router.push("/job-hunt/applications");
                    }}
                    className={`h-9 w-9 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                      activeTab === "Saved"
                        ? "bg-[#111827] text-white dark:bg-[#222534] dark:text-white shadow-[0_1px_4px_rgba(0,0,0,0.15)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
                        : "text-text-muted hover:text-text-primary hover:bg-[#D3DAE6] dark:text-[#A1A1AA] dark:hover:text-white dark:hover:bg-[#2C3042]"
                    }`}
                    aria-label="Saved Jobs"
                    aria-describedby="tooltip-saved-jobs"
                  >
                    <Bookmark className="w-[18px] h-[18px]" strokeWidth={2.2} fill="currentColor" />
                  </Link>

                  <div
                    id="tooltip-saved-jobs"
                    role="tooltip"
                    className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50 opacity-0 invisible scale-95 -translate-y-1 group-hover/tooltip:opacity-100 group-hover/tooltip:visible group-hover/tooltip:scale-100 group-hover/tooltip:translate-y-0 transition-all duration-200 delay-75 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  >
                    <div className="relative px-2.5 py-1 text-[0.75rem] font-semibold tracking-wide whitespace-nowrap rounded-md bg-[#111827] text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)] dark:bg-[#1E212B] dark:text-[#F3F4F6] dark:border dark:border-[#31364A] dark:shadow-[0_6px_20px_rgba(0,0,0,0.45)]">
                      <span
                        className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-[#111827] dark:bg-[#1E212B] dark:border-t dark:border-l dark:border-[#31364A]"
                        aria-hidden="true"
                      />
                      <span className="relative z-10">Saved Jobs</span>
                    </div>
                  </div>
                </div>

                {/* Notifications Icon with Tooltip */}
                <div className="relative group/tooltip flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      (e.currentTarget as HTMLElement).blur();
                    }}
                    className="relative h-9 w-9 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-[#D3DAE6] dark:text-[#A1A1AA] dark:hover:text-white dark:hover:bg-[#2C3042] transition-colors cursor-pointer"
                    aria-label="Resume status and applications"
                    aria-describedby="tooltip-notifications"
                  >
                    <Bell className="w-[18px] h-[18px]" strokeWidth={2.2} fill="currentColor" />
                  </button>

                  <div
                    id="tooltip-notifications"
                    role="tooltip"
                    className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50 opacity-0 invisible scale-95 -translate-y-1 group-hover/tooltip:opacity-100 group-hover/tooltip:visible group-hover/tooltip:scale-100 group-hover/tooltip:translate-y-0 transition-all duration-200 delay-75 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  >
                    <div className="relative px-2.5 py-1 text-[0.75rem] font-semibold tracking-wide whitespace-nowrap rounded-md bg-[#111827] text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)] dark:bg-[#1E212B] dark:text-[#F3F4F6] dark:border dark:border-[#31364A] dark:shadow-[0_6px_20px_rgba(0,0,0,0.45)]">
                      <span
                        className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-[#111827] dark:bg-[#1E212B] dark:border-t dark:border-l dark:border-[#31364A]"
                        aria-hidden="true"
                      />
                      <span className="relative z-10">
                        Resume status and applications
                      </span>
                    </div>
                  </div>
                </div>

                {/* Profile Icon Avatar with Dropdown */}
                <div
                  className="relative shrink-0"
                  ref={profileDropdownRef}
                  onMouseEnter={() => setIsProfileHovered(true)}
                  onMouseLeave={() => setIsProfileHovered(false)}
                >
                  <button
                    type="button"
                    onClick={() => setIsProfileOpen((prev) => !prev)}
                    aria-expanded={showProfileMenu}
                    aria-haspopup="menu"
                    aria-label="User profile menu"
                    className={`h-9 w-9 rounded-full text-text-muted hover:text-text-primary hover:bg-[#D3DAE6] flex items-center justify-center transition-all duration-150 active:scale-[0.96] cursor-pointer select-none dark:text-[#A1A1AA] dark:hover:text-white dark:hover:bg-[#2C3042] ${
                      showProfileMenu ? "bg-[#D3DAE6] text-text-primary dark:bg-[#2C3042] dark:text-white" : ""
                    }`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-[18px] h-[18px] shrink-0"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="7" r="4" />
                      <path d="M4 20.5C4 16.91 7.13 14 11 14H13C16.87 14 20 16.91 20 20.5C20 21.05 19.55 21.5 19 21.5H5C4.45 21.5 4 21.05 4 20.5Z" />
                    </svg>
                  </button>

                  {showProfileMenu && (
                    <div className="absolute right-0 top-full pt-2.5 z-[110]">
                      <div
                        role="menu"
                        aria-label="User Menu"
                        className="w-72 sm:w-80 bg-white dark:bg-[#161822] rounded-xl shadow-[0_16px_45px_rgba(0,0,0,0.14)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] p-3 sm:p-3.5 animate-in fade-in zoom-in-95 duration-150"
                      >
                        <Link
                          href="/profile"
                          onClick={() => { setIsProfileOpen(false); setIsProfileHovered(false); }}
                          className="w-full flex items-center justify-between p-3 sm:p-3.5 mb-2 rounded-lg bg-[#EEF2F9] hover:bg-[#E3E8F4] text-text-primary dark:bg-[#222534] dark:hover:bg-[#2B2F42] dark:text-white transition-all duration-200 cursor-pointer group text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-white dark:bg-[#181A24] text-[#1E293B] dark:text-[#E2E8F0] flex items-center justify-center shrink-0">
                              <svg
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="w-4 h-4 shrink-0"
                                aria-hidden="true"
                              >
                                <circle cx="12" cy="7" r="4" />
                                <path d="M4 20.5C4 16.91 7.13 14 11 14H13C16.87 14 20 16.91 20 20.5C20 21.05 19.55 21.5 19 21.5H5C4.45 21.5 4 21.05 4 20.5Z" />
                              </svg>
                            </div>
                            <span className="font-heading font-semibold text-sm sm:text-base text-[#111827] dark:text-white truncate">
                              {displayName}
                            </span>
                          </div>
                          <ChevronRight
                            className="w-5 h-5 text-[#111827] dark:text-white transition-transform duration-200 ease-out group-hover:translate-x-0.5 shrink-0"
                            strokeWidth={2.5}
                          />
                        </Link>

                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setIsProfileOpen(false); setIsProfileHovered(false); router.push("/job-hunt/manage"); }}
                            className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-md text-sm font-semibold text-text-primary dark:text-[#E2E8F0] hover:bg-bg-tag hover:text-text-primary dark:hover:bg-[#222534] dark:hover:text-white transition-colors cursor-pointer text-left"
                          >
                            <Settings className="w-[18px] h-[18px] text-text-muted dark:text-[#A1A1AA] shrink-0" strokeWidth={2.2} />
                            <span>Job Hunt preferences</span>
                          </button>

                          <div className="my-1 border-t border-black/5 dark:border-white/10" />

                          <button
                            type="button"
                            role="menuitem"
                            onClick={async () => {
                              setIsProfileOpen(false);
                              setIsProfileHovered(false);
                              await authClient.signOut();
                              router.push("/");
                              router.refresh();
                            }}
                            className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-md text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-left"
                          >
                            <LogOut className="w-[18px] h-[18px] text-red-600 dark:text-red-400 shrink-0" strokeWidth={2.2} />
                            <span>Sign Out</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="w-1.5 sm:w-3 border-l-2 border-border-color h-5 mx-1 hidden sm:block opacity-60" />

            {/* Dual Mode Theme Toggle */}
            <div
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="relative inline-flex items-center h-9 p-1 rounded-full border border-border-input bg-bg-input cursor-pointer select-none transition-colors duration-200 dark:border-[#2B3042] dark:bg-[#151720] ml-1 sm:ml-0"
              role="button"
              aria-label="Toggle theme"
            >
              <div
                className="absolute top-1 bottom-1 w-7 rounded-full bg-[#111827] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] dark:bg-[#222534] dark:shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
                style={{ left: mounted && theme === "dark" ? "calc(100% - 28px - 4px)" : "4px" }}
              />

              <div
                className={`relative z-10 w-7 h-7 flex items-center justify-center rounded-full transition-colors duration-200 ${
                  mounted && theme !== "dark"
                    ? "text-white font-bold"
                    : "text-text-subtle hover:text-text-primary dark:hover:text-white"
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
              </div>

              <div
                className={`relative z-10 w-7 h-7 flex items-center justify-center rounded-full transition-colors duration-200 ${
                  mounted && theme === "dark"
                    ? "text-white font-bold"
                    : "text-text-subtle hover:text-text-primary dark:hover:text-white"
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2: PHYSICAL MORPHING SEARCHBAR */}
        {/* Absolute overlay anchored to Row 1 top (y = 0), glides down to Row 2 in Full mode */}
        {isJobBoard && (
          <div
            className="absolute top-0 inset-x-0 px-[var(--space-gutter)] w-full flex items-center justify-center pointer-events-none will-change-transform z-30 overflow-visible"
            style={{
              height: "var(--control-h-md)",
              transform: "translateY(calc(var(--search-travel-y, 50px) * var(--scroll-inv-p, 1)))",
            }}
          >
            <div
              ref={searchContainerRef}
              className="flex items-center justify-center w-full mx-auto will-change-[max-width] pointer-events-auto"
              style={{
                maxWidth:
                  "min(calc(100% - (var(--space-gutter) * 2 + 4.5rem) * var(--scroll-p, 0)), calc(min(32rem, 100%) + (100% - min(32rem, 100%)) * var(--scroll-inv-p, 1)))",
              }}
            >
              {/* Single Search Form: Contains Keyword + Location Sections */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmitSearch();
                }}
                role="search"
                onClick={() => {
                  if (scrollProgress > 0.1 && !isFocusedOverride) {
                    setFocusedOverride(true);
                  }
                }}
                className={`flex-grow flex flex-col relative transition-colors duration-200 border-2 min-w-0 shadow-xs will-change-[height,border-radius] ${
                  isSearchDrawerExpanded
                    ? "bg-white border-black dark:bg-[#1A1C24] dark:border-white"
                    : "bg-[#EDF0F3] border-transparent dark:bg-[#202330] dark:border-transparent focus-within:bg-white focus-within:border-black dark:focus-within:bg-[#1A1C24] dark:focus-within:border-white"
                }`}
                style={{
                  borderRadius:
                    "calc(var(--search-radius-full, 10px) + (9999px - var(--search-radius-full, 10px)) * var(--scroll-p, 0))",
                }}
              >
                <div className="flex flex-col md:flex-row items-stretch w-full overflow-hidden">
                  {/* 1st Half: Keyword Search Column (Role, skills, company) */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div
                      className="flex items-center pr-2 sm:pr-3 relative w-full gap-2 sm:gap-2.5 will-change-[height]"
                      style={{
                        height:
                          "calc(var(--search-h-compact, 36px) + (var(--search-h-full, 48px) - var(--search-h-compact, 36px)) * var(--scroll-inv-p, 1))",
                        paddingLeft: "var(--search-icon-pad, 1.25rem)",
                      }}
                    >
                      <Search className="w-4 h-4 shrink-0 text-gray-500 pointer-events-none" />
                      <input
                        ref={keywordInputRef}
                        type="search"
                        enterKeyHint="search"
                        placeholder={scrollProgress > 0.5 ? "Search..." : "Job title, skills, or company..."}
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                        onFocus={handleInputFocus}
                        className="flex-1 min-w-0 h-full pl-0 pr-1 font-body font-medium text-gray-900 bg-transparent outline-none dark:text-white placeholder:text-gray-400 [&::-webkit-search-cancel-button]:hidden"
                        style={{
                          fontSize: "calc(var(--text-xs) + (var(--text-sm) - var(--text-xs)) * var(--scroll-inv-p, 1))",
                        }}
                      />
                      {localSearch && (
                        <button
                          type="button"
                          onClick={handleClearKeyword}
                          className="p-1 rounded-sm text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer shrink-0"
                          aria-label="Clear keyword search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Expandable Keyword Filter Options (Under Keyword Column, NO horizontal line) */}
                    <div
                      className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] w-full overflow-hidden"
                      style={{
                        gridTemplateRows: isSearchDrawerExpanded && scrollProgress < 0.2 ? "1fr" : "0fr",
                        opacity: isSearchDrawerExpanded && scrollProgress < 0.2 ? 1 : 0,
                      }}
                    >
                      <div className="overflow-hidden">
                        <div className="pl-4 sm:pl-5 pr-2 pb-2.5 pt-0.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
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

                  {/* Vertical Section Divider: Stretches between columns */}
                  <div className="w-[1.5px] bg-stone-300 dark:bg-[#3E455E] my-2 sm:my-2.5 self-stretch shrink-0" />

                  {/* 2nd Half: Location Search Column (Contains Location input, City chips, and Country selector) */}
                  <div className="flex-1 min-w-0 flex flex-row items-stretch">
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div
                        className="flex items-center relative w-full gap-2 sm:gap-2.5 will-change-[height]"
                        style={{
                          height:
                            "calc(var(--search-h-compact, 36px) + (var(--search-h-full, 48px) - var(--search-h-compact, 36px)) * var(--scroll-inv-p, 1))",
                          paddingLeft: "var(--search-icon-pad, 1.25rem)",
                          paddingRight: "calc(var(--search-icon-pad, 1.25rem) * var(--scroll-p, 0) + 0.375rem * var(--scroll-inv-p, 1))",
                        }}
                      >
                        <MapPin className="w-4 h-4 shrink-0 text-gray-500 pointer-events-none" />
                        <input
                          ref={locationInputRef}
                          type="search"
                          enterKeyHint="search"
                          placeholder={scrollProgress > 0.5 ? "Location..." : "City, state, or remote..."}
                          value={localLocation}
                          onChange={(e) => setLocalLocation(e.target.value)}
                          onFocus={handleInputFocus}
                          className="flex-1 min-w-0 h-full pl-0 pr-1 font-body font-medium text-gray-900 bg-transparent outline-none dark:text-white placeholder:text-gray-400 [&::-webkit-search-cancel-button]:hidden"
                          style={{
                            fontSize: "calc(var(--text-xs) + (var(--text-sm) - var(--text-xs)) * var(--scroll-inv-p, 1))",
                          }}
                        />
                        {localLocation && (
                          <button
                            type="button"
                            onClick={handleClearLocation}
                            className="p-1 rounded-sm text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer shrink-0 mr-1"
                            aria-label="Clear location search"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Expandable Location Chips (Under Location Column, NO horizontal line) */}
                      <div
                        className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] w-full overflow-hidden"
                        style={{
                          gridTemplateRows: isSearchDrawerExpanded && scrollProgress < 0.2 ? "1fr" : "0fr",
                          opacity: isSearchDrawerExpanded && scrollProgress < 0.2 ? 1 : 0,
                        }}
                      >
                        <div className="overflow-hidden">
                          <div className="pl-4 sm:pl-5 pr-2 pb-2.5 pt-0.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
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

                    {/* Embedded Country Selector: Folds inward cleanly with zero clipping */}
                    <div
                      className={`flex items-center shrink-0 overflow-hidden will-change-[max-width,opacity] transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                        isSearchDrawerExpanded && scrollProgress < 0.2 ? "self-end pb-2.5 pt-0.5" : "self-center"
                      }`}
                      style={{
                        maxWidth: "calc(95px * var(--scroll-inv-p, 1))",
                        opacity: "var(--scroll-inv-p, 1)",
                        pointerEvents: scrollProgress > 0.2 ? "none" : "auto",
                      }}
                    >
                      <div className="pl-0.5 pr-2 sm:pr-3 shrink-0">
                        <LocationDropdown variant="embedded" />
                      </div>
                    </div>
                  </div>
                </div>
              </form>

              {/* External Desktop Search Arrow Button: Folds away smoothly as searchbar morphs into compact form */}
              <div
                className="hidden md:flex items-center justify-center shrink-0 overflow-hidden will-change-[max-width,opacity,margin]"
                style={{
                  maxWidth: "calc(var(--control-h-lg) * var(--scroll-inv-p, 1))",
                  opacity: "var(--scroll-inv-p, 1)",
                  marginLeft: "calc(0.5rem * var(--scroll-inv-p, 1))",
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
        )}

        {/* ROW 2 SPACER: Provides layout space for Searchbar in Full mode, collapses cleanly to 0 in Compact mode */}
        {isJobBoard && (
          <div
            className="w-full will-change-[height]"
            style={{
              height: "calc((var(--search-h-full) + 0.875rem) * var(--scroll-inv-p, 1))",
            }}
            aria-hidden="true"
          />
        )}

        {/* ROW 3: Filter Button, Reset Button & Quick Filter Shortcuts */}
        {/* Follows Row 2 layout collapse naturally with proportional dynamic spacing */}
        {isJobBoard && (
          <div
            ref={shortcutsContainerRef}
            className="w-full overflow-x-auto no-scrollbar scroll-smooth pt-1 pb-1"
            style={{
              marginTop:
                "calc(var(--gap-full, 0.875rem) * var(--scroll-inv-p, 1) + var(--gap-compact, 0.625rem) * var(--scroll-p, 0))",
            }}
          >
            <div
              ref={shortcutsTrackRef}
              className="flex items-center gap-[0.5rem] w-max md:w-full min-w-0 transition-transform duration-0 will-change-transform"
            >
              {/* Filter Button & Dynamic Reset Button */}
              <div className="flex items-center md:gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={toggleFilterMenu}
                  aria-label="Toggle filters"
                  title="Toggle filters"
                  className="relative inline-flex items-center justify-center font-semibold transition-all duration-200 cursor-pointer select-none border-[1.5px] bg-[#E8F0FE] text-[#1A73E8] border-transparent hover:bg-[#D2E3FC] dark:bg-[#1A2744] dark:text-[#8AB4F8] dark:hover:bg-[#23355A] h-[36px] w-[42px] md:w-auto px-0 md:px-3.5 md:gap-2 rounded-[10px] hover:rounded-[8px] text-xs sm:text-sm"
                >
                  <SlidersHorizontal className="w-4 h-4 shrink-0" />
                  <span className="hidden md:inline">Filters</span>
                  {activeFiltersCount > 0 && (
                    <span className="absolute -top-1 -right-1 z-10 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#1A73E8] text-white dark:bg-[#4285F4] dark:text-white border-2 border-white dark:border-[#111216] text-[10px] font-bold leading-none shadow-xs pointer-events-none">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>

                {/* Reset Button (Desktop) */}
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
                      className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-700 transition-colors duration-200 hover:bg-[#E2E6EA] dark:hover:bg-[#2B3042] dark:text-gray-300 cursor-pointer select-none whitespace-nowrap h-[36px] px-2.5 md:px-3 rounded-[10px]"
                    >
                      <RotateCcw className="w-3 h-3" strokeWidth={2.2} />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Desktop Divider */}
              <div className="hidden md:block h-5 w-[1px] bg-border-subtle mx-0.5 dark:bg-[#2B3042] shrink-0" />

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
        )}
      </div>
    </header>
  );
}
