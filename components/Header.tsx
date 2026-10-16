"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useJobStore } from "@/store/useJobStore";
import { useHeaderMorph } from "@/lib/hooks/useHeaderMorph";
import { HeaderNav } from "./header/HeaderNav";
import { HeaderSearchbar } from "./header/HeaderSearchbar";
import { HeaderShortcuts } from "./header/HeaderShortcuts";
import { MobileSearchButton } from "./header/MobileSearchButton";

export function Header() {
  const pathname = usePathname();
  const isJobBoard = pathname === "/";

  // Mathematical continuous snap engine
  const {
    scrollProgress,
    isTransitioning,
    isFocusedOverride,
    setFocusedOverride,
    headerRef,
    shortcutsContainerRef,
    shortcutsTrackRef,
  } = useHeaderMorph({ enabled: isJobBoard });

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(44);

  const setIsHeaderScrolled = useJobStore((s) => s.setIsHeaderScrolled);
  const isJdOpen = useJobStore((s) => s.isJdOpen);

  // Sync scroll status to global store on settled state
  useEffect(() => {
    setIsHeaderScrolled(scrollProgress > 0.5);
  }, [scrollProgress, setIsHeaderScrolled]);

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-[100] w-full bg-[#F8F9FA]/95 dark:bg-[#111216]/95 backdrop-blur-md pt-[var(--space-header-py)] pb-2 select-none border-b border-transparent will-change-[height] [overflow-anchor:none] ${
        isJdOpen ? "max-lg:hidden" : ""
      }`}
      style={
        {
          "--search-h-full": "var(--control-h-lg)",
          "--search-h-compact": "var(--control-h-md)",
          "--search-mobile-h-full": "clamp(2.625rem, calc(2.463rem + 0.722vw), 2.75rem)",
          "--search-radius-full": "var(--border-radius-card)",
          "--search-radius-compact": "var(--border-radius-pill)",
          "--search-compact-max-w": "clamp(20rem, calc(17rem + 6vw), 25rem)",
          "--header-compact-side-clearance": "clamp(29rem, calc(25rem + 7vw), 34rem)",
          "--gap-header-row": "clamp(1.375rem, calc(1.05rem + 0.8vw), 1.75rem)",
          "--gap-header-row-mobile": "clamp(1.0rem, calc(0.85rem + 0.65vw), 1.25rem)",
          "--gap-full": "clamp(0.625rem, calc(0.521rem + 0.463vw), 0.9375rem)",
          "--gap-compact": "clamp(0.5rem, calc(0.438rem + 0.278vw), 0.6875rem)",
          "--search-travel-y": "calc(var(--control-h-md) + var(--gap-header-row))",
          "--tab-travel-y": "calc(-1 * var(--control-h-md) * 0.75)",
          "--header-compact-h": "6.75rem",
          "--search-icon-pad": "calc(0.875rem + 0.375rem * var(--scroll-inv-p, 1))",
          "--shortcuts-gap": "calc(var(--gap-full) * var(--scroll-inv-p, 1) + var(--gap-compact) * var(--scroll-p, 0))",
        } as React.CSSProperties
      }
    >
      <div className="fluid-container relative">
        {/* ROW 1: Logo & Morphing Wordmark | Tab Switcher | Right Actions */}
        <HeaderNav isJobBoard={isJobBoard} scrollProgress={scrollProgress} />

        {/* MOBILE ROW 2: SINGLE MORPHING SEARCHBAR BUTTON */}
        {isJobBoard && (
          <div className="block lg:hidden">
            <MobileSearchButton scrollProgress={scrollProgress} />
          </div>
        )}

        {/* MOBILE ROW 2 SPACER: Reserves layout space for mobile search button in Full mode, collapses cleanly to 0 in Compact mode */}
        {isJobBoard && (
          <div
            className="block lg:hidden w-full will-change-[height]"
            style={{
              height: "calc((var(--search-mobile-h-full, 42px) + var(--gap-header-row-mobile, 1.0rem)) * var(--scroll-inv-p, 1))",
            }}
            aria-hidden="true"
          />
        )}

        {/* DESKTOP ROW 2: PHYSICAL MORPHING SEARCHBAR */}
        {isJobBoard && (
          <div className="hidden lg:block">
            <HeaderSearchbar
              scrollProgress={scrollProgress}
              isTransitioning={isTransitioning}
              isFocusedOverride={isFocusedOverride}
              setFocusedOverride={setFocusedOverride}
              isDrawerExpanded={isDrawerExpanded}
              drawerHeight={drawerHeight}
              onDrawerExpandChange={setIsDrawerExpanded}
              onDrawerHeightChange={setDrawerHeight}
            />
          </div>
        )}

        {/* DESKTOP ROW 2 SPACER: Provides layout space for Searchbar in Full mode, collapses cleanly to 0 in Compact mode */}
        {isJobBoard && (
          <div
            className="hidden lg:block w-full will-change-[height]"
            style={{
              height: "calc((var(--search-h-full) + var(--gap-header-row)) * var(--scroll-inv-p, 1))",
            }}
            aria-hidden="true"
          />
        )}

        {/* DESKTOP DRAWER EXPANSION SPACER: Smoothly moves filter shortcuts down to create space for expanded searchbar */}
        {isJobBoard && (
          <div
            className="hidden lg:block w-full overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[height]"
            style={{
              height: isDrawerExpanded && scrollProgress < 0.2 ? `${drawerHeight}px` : "0px",
            }}
            aria-hidden="true"
          />
        )}

        {/* ROW 3: Filter Button, Reset Button & Quick Filter Shortcuts */}
        {isJobBoard && (
          <HeaderShortcuts
            containerRef={shortcutsContainerRef}
            trackRef={shortcutsTrackRef}
          />
        )}
      </div>
    </header>
  );
}
