"use client";

import { memo } from "react";

const SKELETON_BG = "bg-[#EDF0F3] dark:bg-[#2C3246] animate-pulse";

interface ApplicationCardSkeletonProps {
  hasStatusPill?: boolean;
  titleWidth?: "short" | "medium" | "long";
}

export const ApplicationCardSkeleton = memo(function ApplicationCardSkeleton({
  hasStatusPill = false,
  titleWidth = "medium",
}: ApplicationCardSkeletonProps) {
  const titleWidthClass = 
    titleWidth === "long" 
      ? "w-[85%] sm:w-[75%]" 
      : titleWidth === "short" 
        ? "w-[55%] sm:w-[45%]" 
        : "w-[70%] sm:w-[60%]";

  return (
    <div 
      className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] xl:grid-cols-[1fr_auto_auto] items-center p-3.5 sm:p-4 lg:p-[1.15rem_1.4rem] xl:p-[1.25rem_1.5rem] bg-bg-card border-[1.5px] border-border-subtle rounded-[10px] dark:border-[#2B3042] gap-3 lg:gap-4 xl:gap-6"
      aria-hidden="true"
    >
      {/* Left Zone: Details */}
      <div className="flex flex-col justify-center min-h-[5.1rem] min-w-0 pr-2 col-span-1">
        {/* Meta Header Row */}
        <div className="flex items-center gap-2.5 mb-[0.45rem]">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={`w-3.5 h-3.5 rounded-full ${SKELETON_BG}`} />
            <div className={`h-3 w-28 rounded-sm ${SKELETON_BG}`} />
          </div>
          {hasStatusPill && (
            <div className={`h-[1.65rem] w-20 sm:w-24 rounded-full ${SKELETON_BG}`} />
          )}
        </div>

        {/* Title Block */}
        <div className="min-h-[2.85rem] flex flex-col justify-center">
          <div className={`h-5 sm:h-6 rounded-md ${titleWidthClass} ${SKELETON_BG}`} />
        </div>

        {/* Company Row */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className={`w-3.5 h-3.5 rounded-xs shrink-0 ${SKELETON_BG}`} />
          <div className={`h-3.5 w-32 sm:w-36 rounded-sm ${SKELETON_BG}`} />
        </div>
      </div>

      {/* Middle Zone: Progress Tracker Capsule */}
      <div className="flex items-center justify-center py-2 lg:py-1 xl:py-0 shrink-0 mx-auto lg:col-span-2 xl:col-span-1 lg:row-start-2 xl:row-start-1 xl:col-start-2">
        <div className="bg-bg-input px-3 sm:px-4 xl:px-5 py-[0.55rem] sm:py-[0.65rem] rounded-full border border-border-subtle dark:bg-[#222534] dark:border-[#2F3446] flex items-center justify-center gap-1.5 sm:gap-2 shadow-none max-w-full">
          {/* Step 1: Applied */}
          <div className="flex items-center gap-1.5">
            <div className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-[3px] ${SKELETON_BG}`} />
            <div className={`h-2.5 w-10 sm:w-12 rounded-sm ${SKELETON_BG}`} />
          </div>

          {/* Connector 1 */}
          <div className={`w-3 sm:w-5 h-[2px] rounded-full ${SKELETON_BG}`} />

          {/* Step 2: Interview */}
          <div className="flex items-center gap-1.5">
            <div className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-[3px] ${SKELETON_BG}`} />
            <div className={`h-2.5 w-12 sm:w-14 rounded-sm ${SKELETON_BG}`} />
          </div>

          {/* Connector 2 */}
          <div className={`w-3 sm:w-5 h-[2px] rounded-full ${SKELETON_BG}`} />

          {/* Step 3: Offer */}
          <div className="flex items-center gap-1.5">
            <div className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-[3px] ${SKELETON_BG}`} />
            <div className={`h-2.5 w-8 sm:w-10 rounded-sm ${SKELETON_BG}`} />
          </div>
        </div>
      </div>

      {/* Right Zone: Actions */}
      <div className="flex items-center justify-between lg:justify-end gap-3 sm:gap-4 shrink-0 pt-3 lg:pt-0 border-t border-border-subtle lg:border-t-0 w-full lg:w-auto whitespace-nowrap min-w-fit lg:col-start-2 lg:row-start-1 xl:col-start-3 xl:row-start-1">
        {/* Apply Link Placeholder */}
        <div className={`h-4 w-16 sm:w-20 rounded-sm ${SKELETON_BG}`} />

        {/* Resume Dropdown Button Placeholder */}
        <div className={`h-[34px] w-28 sm:w-32 rounded-md ${SKELETON_BG}`} />
      </div>
    </div>
  );
});

export const ApplicationsSkeletonList = memo(function ApplicationsSkeletonList({
  count = 4,
}: {
  count?: number;
}) {
  return (
    <div 
      className="flex flex-col gap-4 pb-10" 
      role="status" 
      aria-busy="true" 
      aria-label="Loading applications pipeline..."
    >
      {Array.from({ length: count }).map((_, i) => (
        <ApplicationCardSkeleton
          key={i}
          hasStatusPill={i % 2 === 0}
          titleWidth={i % 3 === 0 ? "long" : i % 3 === 1 ? "medium" : "short"}
        />
      ))}
      <span className="sr-only">Loading applications pipeline...</span>
    </div>
  );
});
