"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalResults: number;
  pageSize?: number;
  onPageChange: (page: number, source: "top" | "bottom") => void;
  position?: "top" | "bottom";
  className?: string;
  forceCompact?: boolean;
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
}: PaginationProps) {
  // Only hide pagination if there are zero results
  if (totalResults <= 0) return null;

  const safeTotalPages = Math.max(1, totalPages);
  const startResult = Math.min((currentPage - 1) * pageSize + 1, totalResults);
  const endResult = Math.min(currentPage * pageSize, totalResults);

  const handlePageClick = (page: number) => {
    if (page >= 1 && page <= safeTotalPages && page !== currentPage) {
      onPageChange(page, position);
    }
  };

  const containerStyles =
    position === "top"
      ? `flex flex-col ${!forceCompact ? 'sm:flex-row justify-between' : 'items-center justify-center'} gap-3 mb-4 sm:mb-5 select-none`
      : `flex flex-col ${!forceCompact ? 'sm:flex-row justify-between' : 'items-center justify-center'} gap-4 mt-8 sm:mt-10 pt-6 border-t border-border-subtle select-none`;

  return (
    <nav
      role="navigation"
      aria-label={`Pagination Navigation (${position})`}
      className={`${containerStyles} ${className}`}
    >
      {/* Left: Summary Counter */}
      <div className="text-[0.88rem] font-semibold text-text-muted select-none order-2 sm:order-1">
        Showing <span className="font-bold text-text-primary dark:text-white">{startResult}-{endResult}</span> of{" "}
        <span className="font-bold text-text-primary dark:text-white">{totalResults}</span> Jobs
      </div>

      {/* Right: Page Indicator & Switcher Controls */}
      <div className="flex items-center gap-3 order-1 sm:order-2">
        {/* Page Indicator matching Header active tab switcher styling */}
        <div className="flex items-center gap-1.5 text-[0.88rem] font-bold text-text-primary dark:text-white">
          <span className="text-text-muted font-semibold">Page</span>
          <span className="w-8 h-8 flex items-center justify-center rounded-md text-[0.88rem] font-bold bg-[#111827] text-white dark:bg-[#222534] dark:text-white dark:shadow-[0_1px_4px_rgba(0,0,0,0.25)] select-none transition-colors duration-200">
            {currentPage}
          </span>
          <span className="text-text-muted font-semibold">of</span>
          <span className="font-bold">{safeTotalPages}</span>
        </div>

        {/* Previous & Next Buttons without hard dropshadow */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handlePageClick(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous Page"
            className="inline-flex items-center justify-center gap-1 h-8 px-2.5 sm:px-3 rounded-md border border-border-input bg-bg-card text-text-primary font-heading text-[0.84rem] font-semibold transition-all duration-150 select-none disabled:opacity-35 disabled:cursor-not-allowed not-disabled:cursor-pointer not-disabled:hover:border-text-primary not-disabled:hover:bg-bg-tag not-disabled:active:scale-[0.98] dark:border-[#2B3042] dark:bg-[#151720] dark:text-white dark:not-disabled:hover:border-[#6B7280] dark:not-disabled:hover:bg-[#1E212D]"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Previous</span>
          </button>

          <button
            onClick={() => handlePageClick(currentPage + 1)}
            disabled={currentPage >= safeTotalPages}
            aria-label="Next Page"
            className="inline-flex items-center justify-center gap-1 h-8 px-2.5 sm:px-3 rounded-md border border-border-input bg-bg-card text-text-primary font-heading text-[0.84rem] font-semibold transition-all duration-150 select-none disabled:opacity-35 disabled:cursor-not-allowed not-disabled:cursor-pointer not-disabled:hover:border-text-primary not-disabled:hover:bg-bg-tag not-disabled:active:scale-[0.98] dark:border-[#2B3042] dark:bg-[#151720] dark:text-white dark:not-disabled:hover:border-[#6B7280] dark:not-disabled:hover:bg-[#1E212D]"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </nav>
  );
}
