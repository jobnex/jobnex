"use client";

import { useTheme } from "next-themes";
import { useState, useRef, useSyncExternalStore, memo } from "react";
import {
  Moon,
  Sun,
  Bookmark,
  Bell,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { JobnexLogo } from "@/components/ui/JobnexLogo";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import { authClient } from "@/lib/auth/client";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "@/app/actions/profile";

interface HeaderNavProps {
  isJobBoard: boolean;
  scrollProgress: number;
}

function HeaderNavComponent({ isJobBoard, scrollProgress }: HeaderNavProps) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isProfileHovered, setIsProfileHovered] = useState(false);
  const showProfileMenu = isProfileOpen || isProfileHovered;
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const pathname = usePathname();
  const router = useRouter();

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
  const { data: profileData } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const res = await getProfile();
      return res.data;
    },
    enabled: !!sessionData?.user,
    staleTime: 5 * 60 * 1000,
  });

  const displayName = profileData?.fullName || sessionData?.user?.name || sessionData?.user?.email;
  const notificationCount = 0;

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

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-3 relative z-50 h-[var(--control-h-md)] pointer-events-none">
      {/* Left: Brand Logo & Wordmark (Wordmark smoothly collapses width & opacity on mobile as scroll progresses) */}
      <div className="flex justify-start items-center min-w-0 shrink-0 lg:flex-1 relative z-20 pointer-events-auto">
        <Link
          href="/"
          className="flex items-center gap-2 sm:gap-2.5 group select-none shrink-0"
        >
          <JobnexLogo size="md" />
          <span
            className={`font-wordmark font-bold tracking-tight text-xl sm:text-2xl overflow-hidden whitespace-nowrap will-change-[max-width,opacity,transform] select-none ${
              isJobBoard ? "lg:!max-w-[200px] lg:!opacity-100 lg:!transform-none" : ""
            }`}
            style={
              isJobBoard
                ? {
                    maxWidth: "calc(clamp(0px, (1 - var(--scroll-p, 0) * 1.8) * 160px, 160px))",
                    opacity: "calc(clamp(0, 1 - var(--scroll-p, 0) * 2, 1))",
                    transform: "translateX(calc(-8px * var(--scroll-p, 0)))",
                  }
                : undefined
            }
          >
            <span className="text-[#111827] dark:text-white transition-colors duration-200">Job</span>
            <span className="text-brand-lime">nex</span>
          </span>
        </Link>
      </div>

      {/* Center: Tab Switcher (Moves UP and fades away as searchbar morphs into Row 1, and comes DOWN when returning to full) */}
      <div
        className={`flex-1 flex items-center justify-center min-w-0 px-1 sm:px-2 lg:px-3 relative z-10 h-full ${
          isJobBoard && scrollProgress > 0.3 ? "pointer-events-none" : "pointer-events-auto"
        }`}
      >
        <div
          className="hidden lg:flex items-center relative will-change-[opacity,transform]"
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
      <div className="flex items-center justify-end gap-1 sm:gap-2 shrink-0 lg:flex-1 relative z-50 pointer-events-auto">
        {/* Authentication Actions */}
        {isAuthPending ? (
          <div className="h-9 w-16 sm:w-20 animate-pulse bg-[#DFE4EC] dark:bg-[#222534] rounded-md shrink-0 hidden lg:block" />
        ) : !sessionData?.user ? (
          /* Sign In Button */
          <Link
            href={`/auth?callbackUrl=${encodeURIComponent(pathname)}`}
            className="h-9 hidden lg:inline-flex items-center justify-center px-3.5 sm:px-4 rounded-md border-[1.5px] border-border-color bg-brand-dark text-white font-heading font-semibold text-[0.84rem] transition-all duration-150 hover:bg-brand-lime hover:text-[#111827] active:scale-[0.98] cursor-pointer select-none dark:border-[#111827] dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white dark:hover:text-[#111827]"
          >
            <span>Sign In</span>
          </Link>
        ) : (
          <div className="hidden lg:flex items-center gap-1 sm:gap-2">
            {/* Saved Icon with Tooltip */}
            <div className="relative group/tooltip flex items-center justify-center">
              <Link
                href="/saved-jobs"
                onClick={(e) => {
                  (e.currentTarget as HTMLElement).blur();
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
                className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 pt-2 z-[80] opacity-0 invisible scale-95 -translate-y-1 group-hover/tooltip:opacity-100 group-hover/tooltip:visible group-hover/tooltip:scale-100 group-hover/tooltip:translate-y-0 transition-all duration-200 delay-75 ease-[cubic-bezier(0.16,1,0.3,1)]"
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
                aria-label="Notifications"
                aria-describedby="tooltip-notifications"
              >
                <Bell className="w-[18px] h-[18px]" strokeWidth={2.2} fill="currentColor" />
                {notificationCount > 0 && (
                  <span className="absolute top-[6px] right-[8px] flex h-2 w-2 rounded-full bg-brand-lime border border-[#F8F9FA] dark:border-[#111216]"></span>
                )}
              </button>

              <div
                id="tooltip-notifications"
                role="tooltip"
                className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 pt-2 z-[80] opacity-0 invisible scale-95 -translate-y-1 group-hover/tooltip:opacity-100 group-hover/tooltip:visible group-hover/tooltip:scale-100 group-hover/tooltip:translate-y-0 transition-all duration-200 delay-75 ease-[cubic-bezier(0.16,1,0.3,1)]"
              >
                <div className="relative px-2.5 py-1 text-[0.75rem] font-semibold tracking-wide whitespace-nowrap rounded-md bg-[#111827] text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)] dark:bg-[#1E212B] dark:text-[#F3F4F6] dark:border dark:border-[#31364A] dark:shadow-[0_6px_20px_rgba(0,0,0,0.45)]">
                  <span
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-[#111827] dark:bg-[#1E212B] dark:border-t dark:border-l dark:border-[#31364A]"
                    aria-hidden="true"
                  />
                  <span className="relative z-10">
                    {notificationCount > 0 ? `Notifications (${notificationCount})` : "Notifications"}
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
                <div className="absolute right-0 top-full pt-2.5 z-[120]">
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
                        onClick={() => { setIsProfileOpen(false); setIsProfileHovered(false); }}
                        className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-md text-sm font-semibold text-text-primary dark:text-[#E2E8F0] hover:bg-bg-tag hover:text-text-primary dark:hover:bg-[#222534] dark:hover:text-white transition-colors cursor-pointer text-left"
                      >
                        <Settings className="w-[18px] h-[18px] text-text-muted dark:text-[#A1A1AA] shrink-0" strokeWidth={2.2} />
                        <span>Settings</span>
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
  );
}

export const HeaderNav = memo(HeaderNavComponent);
