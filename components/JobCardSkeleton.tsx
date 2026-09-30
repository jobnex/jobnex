import { memo } from "react";

export const JobCardSkeleton = memo(function JobCardSkeleton({ 
  compact = false 
}: { 
  compact?: boolean 
}) {
  return (
    <article className="relative h-full flex flex-col justify-between p-[1.25rem_1.35rem_1.15rem] rounded-card border-[1.5px] border-border-subtle bg-bg-card shadow-[0_4px_0_0_transparent] dark:border-[#31364A]">
      <div className="flex flex-col">
        {/* Title Block Skeleton */}
        <div className="min-h-[5.35rem] flex flex-col justify-start mb-[0.85rem]">
          <div className="flex items-start justify-between gap-2.5 mb-[0.45rem]">
            <div className="flex flex-col gap-2 flex-1 pt-1">
              <div className="h-5 bg-[#EDF0F3] dark:bg-[#31364A] rounded-md w-[85%] animate-pulse" />
              <div className="h-5 bg-[#EDF0F3] dark:bg-[#31364A] rounded-md w-[60%] animate-pulse hidden" />
            </div>
            <div className="w-[18px] h-[18px] shrink-0 bg-[#EDF0F3] dark:bg-[#31364A] rounded-sm animate-pulse" />
          </div>

          {/* Company & Details Block Skeleton */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0 rounded-md bg-[#EDF0F3] dark:bg-[#31364A] animate-pulse" />
            <div className="flex flex-col gap-[0.35rem] min-w-0 flex-1 justify-center">
              <div className="h-3.5 bg-[#EDF0F3] dark:bg-[#31364A] rounded w-[45%] animate-pulse" />
              <div className="flex items-center gap-[0.35rem]">
                 <div className="w-3 h-3 bg-[#EDF0F3] dark:bg-[#31364A] rounded-sm animate-pulse" />
                 <div className="h-3 bg-[#EDF0F3] dark:bg-[#31364A] rounded w-[35%] animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Metadata Badges */}
        <div className="flex flex-wrap content-end gap-[0.35rem] mb-[0.65rem] min-h-[3.35rem]">
          <div className="h-[22px] w-[60px] rounded-[4px] bg-[#EDF0F3] dark:bg-[#31364A] animate-pulse" />
          <div className="h-[22px] w-[60px] rounded-[4px] bg-[#EDF0F3] dark:bg-[#31364A] animate-pulse" />
          <div className="h-[22px] w-[50px] rounded-[4px] bg-[#EDF0F3] dark:bg-[#31364A] animate-pulse" />
          <div className="h-[22px] w-[65px] rounded-[4px] bg-[#EDF0F3] dark:bg-[#31364A] animate-pulse" />
          <div className="h-[22px] w-[95px] rounded-[4px] bg-[rgba(185,255,102,0.18)] dark:bg-[rgba(172,238,95,0.12)] animate-pulse" />
        </div>
      </div>

      {/* Card Footer Actions - Hidden in compact mode */}
      {!compact && (
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-dashed border-[#E5E7EB] dark:border-[#31364A] mt-auto">
          <div className="h-3 bg-[#EDF0F3] dark:bg-[#31364A] rounded w-[80px] animate-pulse" />
          <div className="h-3 bg-[#EDF0F3] dark:bg-[#31364A] rounded w-[100px] animate-pulse" />
        </div>
      )}
    </article>
  );
});
