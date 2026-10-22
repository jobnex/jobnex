"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft } from "lucide-react";
import { toast } from "sonner";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalResults: number;
  pageSize?: number;
  onPageChange: (page: number, source: "top" | "bottom") => void;
  position?: "top" | "bottom";
  className?: string;
  forceCompact?: boolean;
  showFloatingPill?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  totalResults,
  pageSize = 24,
  onPageChange,
  position = "bottom",
  className = "",
  forceCompact = false,
  showFloatingPill = position === "bottom",
}: PaginationProps) {
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Big-screen inline page jump input state
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(currentPage));
  const [hasError, setHasError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus and select input on edit mode activation
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Monitor vertical scrolling on mobile to surface the floating pill
  useEffect(() => {
    if (!showFloatingPill) return;

    const handleScroll = () => {
      setIsScrolling(true);
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
      scrollTimerRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 1200);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
    };
  }, [showFloatingPill]);

  // Only hide pagination if there are zero results
  if (totalResults <= 0) return null;

  const safeTotalPages = Math.max(1, totalPages);
  const startResult = Math.min((currentPage - 1) * pageSize + 1, totalResults);
  const endResult = Math.min(currentPage * pageSize, totalResults);
  const pageDigits = String(currentPage).length;

  const indicatorShapeClass =
    pageDigits <= 1
      ? "w-8 h-8 rounded-full"
      : pageDigits === 2
        ? "h-8 min-w-[2.4rem] px-2 rounded-full"
        : "h-8 min-w-[2.85rem] px-2.5 rounded-full";

  const editDigits = Math.max(inputValue.length, 1);
  const editShapeClass =
    editDigits <= 1
      ? "w-8 h-8 rounded-full"
      : editDigits === 2
        ? "h-8 min-w-[2.4rem] px-2 rounded-full"
        : "h-8 min-w-[2.85rem] px-2.5 rounded-full";

  const handlePageClick = (page: number) => {
    if (page >= 1 && page <= safeTotalPages && page !== currentPage) {
      onPageChange(page, position);
    }
  };

  const handleStartEditing = () => {
    setIsEditing(true);
    setInputValue(String(currentPage));
    setHasError(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only accept numeric digits or empty string
    const sanitized = e.target.value.replace(/[^0-9]/g, "");
    setInputValue(sanitized);
    if (hasError) {
      setHasError(false);
    }
  };

  const handleInputSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      // Empty input: show invalid, empty field, don't change page
      setHasError(true);
      setInputValue("");
      toast.error("Invalid page number", {
        description: `Please enter a page between 1 and ${safeTotalPages}`,
      });
      return;
    }

    const targetPage = parseInt(trimmed, 10);
    if (isNaN(targetPage) || targetPage < 1 || targetPage > safeTotalPages) {
      // Out of bounds: show invalid, empty field, don't change page
      setHasError(true);
      setInputValue("");
      toast.error("Invalid page number", {
        description: `Please enter a page between 1 and ${safeTotalPages}`,
      });
      return;
    }

    // Valid page
    setHasError(false);
    setIsEditing(false);
    if (targetPage !== currentPage) {
      onPageChange(targetPage, position);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInputSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsEditing(false);
      setInputValue(String(currentPage));
      setHasError(false);
    }
  };

  const handleInputBlur = () => {
    // Exit edit mode on blur without changing page
    setIsEditing(false);
    setInputValue(String(currentPage));
    setHasError(false);
  };

  const containerStyles =
    position === "top"
      ? `hidden sm:flex flex-col sm:flex-row items-center ${!forceCompact ? 'sm:justify-between' : 'sm:justify-center'} gap-3 mb-4 sm:mb-5 select-none`
      : `flex flex-col sm:flex-row items-center ${!forceCompact ? 'sm:justify-between' : 'sm:justify-center'} gap-4 mt-8 sm:mt-10 pt-4 select-none`;

  return (
    <>
      <nav
        role="navigation"
        aria-label={`Pagination Navigation (${position})`}
        className={`${containerStyles} ${className}`}
      >
        {/* Left: Summary Counter (Visible only on multi-column grid >= sm, hidden on single-column mobile) */}
        <div className={`hidden sm:block font-mona text-xs sm:text-sm font-medium text-text-muted select-none ${forceCompact ? 'sm:hidden' : ''}`}>
          Showing{" "}
          <span className="font-mona font-bold text-text-primary dark:text-white tabular-nums">
            {startResult}-{endResult}
          </span>{" "}
          of{" "}
          <span className="font-mona font-bold text-text-primary dark:text-white tabular-nums">
            {totalResults}
          </span>{" "}
          Jobs
        </div>

        {/* Controls Container:
            On mobile (< sm): outer container is full-width relative, Prev / Page info / Next are centered;
            "Return to start" (page >= 3) has absolute left-0 with double arrows only, not shifting the centered original UI!
            On big screen (>= sm): info 1st (sm:order-1) & buttons later: [Return to start (sm:order-2)] [Previous (sm:order-3)] [Next (sm:order-4)]
        */}
        <div className="relative w-full sm:w-auto flex items-center justify-center sm:justify-start gap-2.5 sm:gap-1.5">
          {/* Page Info: sm:order-1 (1st on big screen), order-2 (between Prev and Next on mobile) */}
          <div className="order-2 sm:order-1 flex items-center gap-1.5 font-mona text-xs sm:text-sm text-text-primary dark:text-white sm:mr-1.5">
            <span className="hidden sm:inline text-text-muted font-medium">Page</span>

            {/* Mobile Single-Row View: Non-editable circle/pill indicator */}
            <span
              className={`sm:hidden ${indicatorShapeClass} flex items-center justify-center font-mona text-xs font-bold bg-transparent border-2 border-[#EDF0F3] text-text-primary dark:border-[#202330] dark:text-white tabular-nums select-none shrink-0`}
            >
              {currentPage}
            </span>

            {/* Big Screen View: Clickable to type page number inline */}
            {isEditing ? (
              <div
                className={`hidden sm:flex ${editShapeClass} items-center justify-center font-mona text-xs sm:text-sm font-bold bg-transparent border-2 ${
                  hasError
                    ? "border-red-500 text-red-500 dark:border-red-400 dark:text-red-400 animate-shake ring-2 ring-red-500/20"
                    : "border-black text-text-primary dark:border-white dark:text-white ring-2 ring-black/10 dark:ring-white/10"
                } tabular-nums shrink-0 transition-all duration-150`}
              >
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={inputValue}
                  placeholder={hasError ? "" : String(currentPage)}
                  onChange={handleInputChange}
                  onKeyDown={handleInputKeyDown}
                  onBlur={handleInputBlur}
                  className="w-full h-full text-center bg-transparent border-0 outline-none p-0 font-mona text-xs sm:text-sm font-bold text-inherit tabular-nums"
                  aria-label="Enter page number and press Enter"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartEditing}
                title="Click to jump to page"
                aria-label={`Page ${currentPage}. Click to enter page number`}
                className={`hidden sm:flex ${indicatorShapeClass} items-center justify-center font-mona text-xs sm:text-sm font-bold bg-transparent border-2 border-[#EDF0F3] hover:border-black text-text-primary dark:border-[#202330] dark:hover:border-white dark:text-white tabular-nums select-none transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] shrink-0 cursor-pointer`}
              >
                {currentPage}
              </button>
            )}

            <span className="text-text-muted font-medium">of</span>
            <span className="font-mona font-bold text-text-primary dark:text-white tabular-nums">
              {safeTotalPages}
            </span>
          </div>

          {/* "Return to start" Button: Double arrows only (no text), sm:order-2 (placed before Prev on big screen), absolute left-0 on mobile */}
          {currentPage >= 3 && (
            <button
              type="button"
              onClick={() => handlePageClick(1)}
              title="Return to start (Page 1)"
              aria-label="Return to start (Page 1)"
              className="absolute left-0 sm:static sm:order-2 inline-flex items-center justify-center w-8 h-8 rounded-[10px] bg-[#EDF0F3] text-gray-700 border-[1.5px] border-transparent font-mona transition-colors duration-200 select-none cursor-pointer hover:bg-[#E2E6EA] hover:text-black active:scale-[0.98] dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] dark:hover:text-white shrink-0"
            >
              <ChevronsLeft className="w-4 h-4 shrink-0" strokeWidth={2.2} />
            </button>
          )}

          {/* Previous Button: order-1 on mobile (left of page info), sm:order-3 on big screen (after Return to start) */}
          <button
            type="button"
            onClick={() => handlePageClick(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous Page"
            className="order-1 sm:order-3 inline-flex items-center justify-center w-12 h-8 sm:w-auto sm:px-3.5 sm:gap-1.5 rounded-[10px] bg-[#EDF0F3] text-gray-700 border-[1.5px] border-transparent font-mona text-xs sm:text-sm font-medium transition-colors duration-200 select-none disabled:opacity-40 disabled:cursor-not-allowed not-disabled:cursor-pointer not-disabled:hover:bg-[#E2E6EA] not-disabled:hover:text-black not-disabled:active:scale-[0.98] dark:bg-[#202330] dark:text-gray-300 dark:not-disabled:hover:bg-[#2B3042] dark:not-disabled:hover:text-white"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" strokeWidth={2.2} />
            <span className="hidden sm:inline">Prev</span>
          </button>

          {/* Next Button: order-3 on mobile (right of page info), sm:order-4 on big screen */}
          <button
            type="button"
            onClick={() => handlePageClick(currentPage + 1)}
            disabled={currentPage >= safeTotalPages}
            aria-label="Next Page"
            className="order-3 sm:order-4 inline-flex items-center justify-center w-12 h-8 sm:w-auto sm:px-3.5 sm:gap-1.5 rounded-[10px] bg-[#EDF0F3] text-gray-700 border-[1.5px] border-transparent font-mona text-xs sm:text-sm font-medium transition-colors duration-200 select-none disabled:opacity-40 disabled:cursor-not-allowed not-disabled:cursor-pointer not-disabled:hover:bg-[#E2E6EA] not-disabled:hover:text-black not-disabled:active:scale-[0.98] dark:bg-[#202330] dark:text-gray-300 dark:not-disabled:hover:bg-[#2B3042] dark:not-disabled:hover:text-white"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-4 h-4 shrink-0" strokeWidth={2.2} />
          </button>
        </div>
      </nav>

      {/* Mobile Floating Pill: Surfaces on scroll, smoothly fades away when stopped */}
      {showFloatingPill && (
        <aside
          aria-label="Job count indicator"
          className={`fixed bottom-[calc(max(1rem,env(safe-area-inset-bottom,1rem))+3.75rem)] left-1/2 -translate-x-1/2 z-40 sm:hidden pointer-events-none select-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isScrolling
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 translate-y-2 scale-95"
          }`}
        >
          <div className="flex items-center justify-center px-3.5 py-1.5 rounded-full bg-white/95 text-zinc-900 shadow-[0_4px_20px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)] backdrop-blur-xl dark:bg-[#151720]/95 dark:text-white dark:shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
            <span className="font-mona text-xs font-bold tabular-nums">
              {startResult}-{endResult}/{totalResults}
            </span>
          </div>
        </aside>
      )}
    </>
  );
}
