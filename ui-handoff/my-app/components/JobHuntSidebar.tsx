"use client";

import { Briefcase, FileText, Settings, Menu, X, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useCreditStore } from "@/store/useCreditStore";
import { useJobHuntMenuStore } from "@/store/useJobHuntMenuStore";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/utils/scrollLock";

export const TABS = [
  { id: "curated", label: "Curated Jobs", icon: Briefcase, href: "/job-hunt" },
  { id: "applications", label: "My Applications", icon: FileText, href: "/job-hunt/applications" },
  { id: "manage", label: "Manage Job Hunt", icon: Settings, href: "/job-hunt/manage" },
];

export function JobHuntMobileMenuButton({ className = "" }: { className?: string }) {
  const openMenu = useJobHuntMenuStore((s) => s.openMenu);

  return (
    <button
      type="button"
      onClick={openMenu}
      aria-label="Open Job Hunt menu"
      className={`flex md:hidden items-center justify-center w-10 h-10 rounded-lg text-text-primary dark:text-white hover:bg-bg-tag dark:hover:bg-[#202330] transition-colors cursor-pointer select-none active:scale-95 shrink-0 ${className}`}
    >
      <Menu className="w-6 h-6" strokeWidth={2.2} />
    </button>
  );
}

export function JobHuntSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const getTabIdFromPath = (path: string) => {
    if (path === "/job-hunt/manage") return "manage";
    if (path === "/job-hunt/applications") return "applications";
    return "curated";
  };

  const pathnameTab = getTabIdFromPath(pathname);
  const [activeTab, setActiveTab] = useState<string>(pathnameTab);
  const [prevPathnameTab, setPrevPathnameTab] = useState<string>(pathnameTab);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  const credits = useCreditStore((s) => s.balance);
  const fetchCredits = useCreditStore((s) => s.fetchCredits);

  const isMenuOpen = useJobHuntMenuStore((s) => s.isOpen);
  const openMenu = useJobHuntMenuStore((s) => s.openMenu);
  const closeMenu = useJobHuntMenuStore((s) => s.closeMenu);

  // Smooth bidirectional transition states: mount before slide-in, delay unmount after slide-out
  const [shouldRender, setShouldRender] = useState(false);
  const [isSlidIn, setIsSlidIn] = useState(false);

  if (isMenuOpen && !shouldRender) {
    setShouldRender(true);
  }

  useEffect(() => {
    if (isMenuOpen) {
      // Double rAF ensures the element is first painted in DOM at translateX(100%) before animating to translateX(0%)
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => {
          setIsSlidIn(true);
        });
        return () => cancelAnimationFrame(r2);
      });
      return () => cancelAnimationFrame(r1);
    } else {
      const r = requestAnimationFrame(() => {
        setIsSlidIn(false);
      });
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 340);
      return () => {
        cancelAnimationFrame(r);
        clearTimeout(timer);
      };
    }
  }, [isMenuOpen]);

  const prevPathnameRef = useRef<string | null>(null);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  // When job hunt page is opened in mobile view, open the full-page hamburger menu
  useEffect(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const isEnteringJobHunt =
      pathname === "/job-hunt" &&
      (prevPathnameRef.current === null || !prevPathnameRef.current.startsWith("/job-hunt"));

    if (isMobile && isEnteringJobHunt) {
      openMenu();
    }
    prevPathnameRef.current = pathname;
  }, [pathname, openMenu]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMenuOpen) {
      lockBodyScroll();
      return () => {
        unlockBodyScroll();
      };
    }
  }, [isMenuOpen]);

  useEscapeKey(closeMenu, isMenuOpen);

  if (pathnameTab !== prevPathnameTab) {
    setActiveTab(pathnameTab);
    setPrevPathnameTab(pathnameTab);
  }

  const activeIndex = TABS.findIndex((t) => t.id === activeTab);
  const hoveredIndex = hoveredTab ? TABS.findIndex((t) => t.id === hoveredTab) : -1;
  const currentPillIndex = hoveredIndex !== -1 ? hoveredIndex : (activeIndex !== -1 ? activeIndex : 0);
  const isHoveringOther = hoveredTab !== null && hoveredTab !== activeTab;

  const handleTabClick = (tabId: string, href: string) => {
    setActiveTab(tabId);
    setHoveredTab(null);
    closeMenu();
    router.push(href);
  };

  return (
    <>
      {/* Mobile Full-Page Sliding Hamburger Menu */}
      {shouldRender && mounted && createPortal(
        <>
          {/* Subtle Backdrop Overlay */}
          <div
            onClick={closeMenu}
            aria-hidden="true"
            className="fixed inset-0 z-[140] bg-black/40 backdrop-blur-xs md:hidden"
            style={{
              opacity: isSlidIn ? 1 : 0,
              transition: "opacity 300ms ease",
              pointerEvents: isSlidIn ? "auto" : "none",
            }}
          />

          {/* Smooth Right-Sliding Drawer */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Job Hunt navigation menu"
            className="fixed inset-0 z-[145] md:hidden bg-bg-page dark:bg-[#111216] flex flex-col h-full w-full py-[var(--space-m)] fluid-container overflow-y-auto pb-32"
            style={{
              transform: isSlidIn ? "translateX(0%)" : "translateX(100%)",
              transition: "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Top Bar with Title and Close Button: Exactly aligned to page header & menu button */}
            <div className="flex items-center justify-between gap-3 pt-1.5 pb-1">
              <h1 className="font-heading text-2xl sm:text-3xl font-semibold leading-tight text-text-primary dark:text-white">
                Job Hunt
              </h1>
              <button
                type="button"
                onClick={closeMenu}
                aria-label="Close Job Hunt menu"
                className="flex md:hidden items-center justify-center w-10 h-10 rounded-lg text-text-primary dark:text-white hover:bg-bg-tag dark:hover:bg-[#202330] transition-colors cursor-pointer select-none active:scale-95 shrink-0"
              >
                <X className="w-6 h-6" strokeWidth={2.2} />
              </button>
            </div>

            {/* Tailor Credits Info Card (Moved down to accommodate title/close button, above sections) */}
            <div className="mt-6 mb-5">
              <div className="bg-bg-card dark:bg-[#181A24] rounded-2xl p-4 sm:p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-heading font-bold text-sm sm:text-base text-text-primary dark:text-white">
                    Tailor Credits
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-text-muted dark:text-[#A1A1AA]">
                    {credits !== null ? credits : "..."} / 200
                  </span>
                </div>

                <div className="h-2 w-full bg-[#E5E7EB] dark:bg-[#2A2E3D] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-lime rounded-full transition-all duration-500"
                    style={{
                      width: credits !== null ? `${Math.min(100, Math.max(0, (credits / 200) * 100))}%` : "0%",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Sections List (Below credits card, without 'Current' tag) */}
            <div className="mb-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted dark:text-[#8E92A4] px-1 mb-2">
                Sections
              </div>

              <div className="bg-bg-card dark:bg-[#181A24] rounded-2xl shadow-xs divide-y divide-gray-100 dark:divide-white/[0.06] overflow-hidden">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleTabClick(tab.id, tab.href)}
                      className={`w-full flex items-center justify-between p-4 text-left transition-colors cursor-pointer group active:bg-[#EDF0F3] dark:active:bg-[#202330] ${
                        isActive
                          ? "bg-[#EDF0F3]/60 dark:bg-[#202330]/60"
                          : "hover:bg-[#EDF0F3]/30 dark:hover:bg-[#202330]/30"
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <Icon
                          className={`w-5 h-5 shrink-0 ${
                            isActive
                              ? "text-text-primary dark:text-[#ACEE5F]"
                              : "text-text-muted dark:text-gray-400"
                          }`}
                          strokeWidth={2.2}
                        />
                        <span className={`text-base truncate ${
                          isActive
                            ? "font-bold text-text-primary dark:text-white"
                            : "font-semibold text-text-primary dark:text-white"
                        }`}>
                          {tab.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <ChevronRight
                          className="w-4 h-4 text-text-muted group-hover:translate-x-0.5 transition-transform"
                          strokeWidth={2.2}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Desktop Sticky Sidebar (Visible on md+) */}
      <aside className="hidden md:flex w-[260px] lg:w-[280px] shrink-0 flex-col sticky top-[84px] h-[calc(100vh-110px)] overflow-y-auto hide-scrollbar bg-bg-card rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-border-subtle/80 dark:border-transparent dark:shadow-sm select-none">
        {/* Applications Progress Container -> Repurposed for Credits */}
        <div className="p-5 border-b border-border-subtle">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs sm:text-sm font-bold text-text-primary">Tailor Credits</span>
            <span className="text-xs font-bold text-text-muted">
              {credits !== null ? credits : "..."} / 200
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#E5E7EB] dark:bg-[#374151] rounded-full overflow-hidden">
            <div 
              className="h-full bg-brand-lime rounded-full transition-all duration-500" 
              style={{ width: credits !== null ? `${Math.min(100, Math.max(0, (credits / 200) * 100))}%` : "0%" }} 
            />
          </div>
        </div>

        <nav
          className="relative flex flex-col p-4 pt-8 gap-1"
          onMouseLeave={() => setHoveredTab(null)}
        >
          {/* Sliding Pill Indicator: Solid on active tab, transitions to outline pill on hover, smoothly fills on click */}
          <div
            className={`absolute left-4 right-4 h-[48px] rounded-md transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] pointer-events-none shadow-none ${
              isHoveringOther
                ? "bg-transparent border-[1.5px] border-[#111827] dark:bg-transparent dark:border-[#525B75]"
                : "bg-[#111827] border-[1.5px] border-transparent dark:bg-[#2D3244] dark:border-transparent"
            }`}
            style={{ top: `calc(2rem + ${currentPillIndex * 52}px)` }}
          />

          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isHovered = hoveredTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id, tab.href)}
                onMouseEnter={() => setHoveredTab(tab.id)}
                className={`relative z-10 flex items-center gap-3 px-4 h-[48px] rounded-md font-bold transition-colors duration-250 cursor-pointer text-left w-full ${
                  isActive
                    ? isHoveringOther
                      ? "text-text-primary dark:text-[#E2E8F0]"
                      : "text-white"
                    : isHovered
                    ? "text-[#111827] dark:text-white"
                    : "text-text-muted hover:text-text-primary dark:hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
