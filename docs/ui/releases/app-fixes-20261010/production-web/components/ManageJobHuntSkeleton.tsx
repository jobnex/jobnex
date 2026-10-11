import { memo } from "react";

const SKELETON_EL = "bg-[#DDE2E7] dark:bg-[#2C3246] animate-skeleton-pulse";

/**
 * ManageJobHuntFormSkeleton
 * 
 * Production-grade skeleton loading component for the preferences form content.
 * Mirrors the exact DOM hierarchy, padding, borders, and responsive grid layout of the
 * form sections (Resume, Preferences, Templates, and Save action) without replacing the
 * permanent static page title & subtitle header.
 */
export const ManageJobHuntFormSkeleton = memo(function ManageJobHuntFormSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading preferences form...">
      {/* SECTION 1: Resume Skeleton */}
      <section className="bg-bg-card border border-border-subtle dark:border-[#31364A] rounded-lg p-5 md:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-xs ${SKELETON_EL}`} />
            <div className={`h-5 w-24 rounded-md ${SKELETON_EL}`} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`h-4 w-36 rounded-md hidden sm:block ${SKELETON_EL}`} />
            <div className={`h-[32px] w-36 rounded-sm ${SKELETON_EL}`} />
          </div>
        </div>

        {/* Upload / Dropzone Box Skeleton */}
        <div className="relative flex flex-col items-center justify-center py-7 px-4 border-2 border-dashed border-border-input dark:border-[#31364A] rounded-md mb-4 bg-bg-input/40 dark:bg-bg-input/20">
          <div className={`w-10 h-10 rounded-full mb-2.5 ${SKELETON_EL}`} />
          <div className={`h-4 w-52 rounded-md mb-1.5 ${SKELETON_EL}`} />
          <div className={`h-3 w-32 rounded-md ${SKELETON_EL}`} />
        </div>

        {/* Switch toggle on right */}
        <div className="flex items-center justify-end gap-3">
          <div className={`h-4 w-36 rounded-md ${SKELETON_EL}`} />
          <div className={`w-[48px] h-[25px] rounded-full ${SKELETON_EL}`} />
        </div>
      </section>

      {/* SECTION 2: Job Preferences Skeleton */}
      <section className="bg-bg-card border border-border-subtle dark:border-[#31364A] rounded-lg shadow-sm">
        <div className="p-5 md:p-6 border-b border-border-subtle dark:border-[#31364A]">
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-xs ${SKELETON_EL}`} />
            <div className={`h-5 w-36 rounded-md ${SKELETON_EL}`} />
          </div>
        </div>

        {/* Location Group Skeleton (2 Columns) */}
        <div className="p-5 md:p-6 border-b border-border-subtle dark:border-[#31364A] grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2.5">
            <div className={`h-4 w-20 rounded-md ${SKELETON_EL}`} />
            <div className={`h-[42px] w-48 rounded-[10px] ${SKELETON_EL}`} />
          </div>

          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <div className={`h-4 w-28 rounded-md ${SKELETON_EL}`} />
              <div className={`h-3 w-8 rounded-md ${SKELETON_EL}`} />
            </div>
            <div className={`h-[42px] w-full rounded-[10px] ${SKELETON_EL}`} />
            <div className="min-h-[30px] flex flex-wrap gap-2 pt-0.5">
              <div className={`h-[34px] w-36 rounded-[10px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-40 rounded-[10px] ${SKELETON_EL}`} />
            </div>
          </div>
        </div>

        {/* Role Details Group Skeleton (2 Columns: Seniority & Job Type) */}
        <div className="p-5 md:p-6 border-b border-border-subtle dark:border-[#31364A] grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2.5">
            <div className={`h-4 w-28 rounded-md ${SKELETON_EL}`} />
            <div className="grid grid-cols-2 gap-2">
              <div className={`h-[40px] rounded-[10px] ${SKELETON_EL}`} />
              <div className={`h-[40px] rounded-[10px] ${SKELETON_EL}`} />
              <div className={`h-[40px] rounded-[10px] ${SKELETON_EL}`} />
              <div className={`h-[40px] rounded-[10px] ${SKELETON_EL}`} />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className={`h-4 w-24 rounded-md ${SKELETON_EL}`} />
            <div className="grid grid-cols-2 gap-2">
              <div className={`h-[40px] rounded-[10px] ${SKELETON_EL}`} />
              <div className={`h-[40px] rounded-[10px] ${SKELETON_EL}`} />
              <div className={`h-[40px] rounded-[10px] ${SKELETON_EL}`} />
              <div className={`h-[40px] rounded-[10px] ${SKELETON_EL}`} />
            </div>
          </div>
        </div>

        {/* Experience & Salary Group Skeleton (2 Columns) */}
        <div className="p-5 md:p-6 border-b border-border-subtle dark:border-[#31364A] grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2.5">
            <div className={`h-4 w-36 rounded-md ${SKELETON_EL}`} />
            <div className={`h-[42px] w-[130px] rounded-[10px] ${SKELETON_EL}`} />
          </div>

          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <div className={`h-4 w-28 rounded-md ${SKELETON_EL}`} />
              <div className={`h-3 w-16 rounded-md ${SKELETON_EL}`} />
            </div>
            <div className="flex items-center gap-3">
              <div className={`h-[42px] flex-1 rounded-[10px] ${SKELETON_EL}`} />
              <div className="font-bold text-text-muted text-sm shrink-0">to</div>
              <div className={`h-[42px] flex-1 rounded-[10px] ${SKELETON_EL}`} />
            </div>
          </div>
        </div>

        {/* Domains & Skills Group Skeleton (2 Columns) */}
        <div className="p-5 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Domains Column Skeleton */}
          <div className="space-y-2.5">
            <div className={`h-4 w-20 rounded-md ${SKELETON_EL}`} />
            <div className={`h-[42px] w-full rounded-[10px] ${SKELETON_EL}`} />
            <div className="min-h-[120px] max-h-[165px] p-3 bg-bg-input border-[1.5px] border-transparent rounded-[10px] flex flex-wrap gap-2 content-start">
              <div className={`h-[34px] w-36 rounded-[10px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-32 rounded-[10px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-40 rounded-[20px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-28 rounded-[20px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-36 rounded-[20px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-32 rounded-[20px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-30 rounded-[20px] ${SKELETON_EL}`} />
            </div>
          </div>

          {/* Skills Column Skeleton */}
          <div className="space-y-2.5">
            <div className={`h-4 w-16 rounded-md ${SKELETON_EL}`} />
            <div className={`h-[42px] w-full rounded-[10px] ${SKELETON_EL}`} />
            <div className="min-h-[120px] max-h-[165px] p-3 bg-bg-input border-[1.5px] border-transparent rounded-[10px] flex flex-wrap gap-2 content-start">
              <div className={`h-[34px] w-28 rounded-[10px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-24 rounded-[10px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-32 rounded-[10px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-24 rounded-[20px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-28 rounded-[20px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-20 rounded-[20px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-24 rounded-[20px] ${SKELETON_EL}`} />
              <div className={`h-[34px] w-22 rounded-[20px] ${SKELETON_EL}`} />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Resume Template Preferences Skeleton */}
      <section className="bg-bg-card border border-border-subtle dark:border-[#31364A] rounded-lg shadow-sm">
        <div className="p-5 md:p-6 border-b border-border-subtle dark:border-[#31364A]">
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-xs ${SKELETON_EL}`} />
            <div className={`h-5 w-40 rounded-md ${SKELETON_EL}`} />
          </div>
        </div>

        <div className="p-5 md:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className={`h-4 w-80 max-w-full rounded-md ${SKELETON_EL}`} />
            <div className="flex items-center gap-3">
              <div className={`h-4 w-44 rounded-md ${SKELETON_EL}`} />
              <div className={`w-[48px] h-[25px] rounded-full ${SKELETON_EL}`} />
            </div>
          </div>

          {/* 3 Template Cards Grid Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((cardId) => (
              <div
                key={cardId}
                className="rounded-2xl border-[2.5px] border-black/10 dark:border-white/10 overflow-hidden flex flex-col"
              >
                {/* Top Preview Image Placeholder */}
                <div className={`h-[220px] w-full ${SKELETON_EL}`} />

                {/* Bottom Details Skeleton */}
                <div className="p-4 flex flex-col gap-3 bg-black/5 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1.5">
                      <div className={`h-4 w-3/4 rounded-md ${SKELETON_EL}`} />
                      <div className={`h-3 w-1/2 rounded-md ${SKELETON_EL}`} />
                    </div>
                    <div className={`h-4 w-14 rounded-xs ${SKELETON_EL}`} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <div className={`h-4 w-14 rounded-xs ${SKELETON_EL}`} />
                    <div className={`h-4 w-16 rounded-xs ${SKELETON_EL}`} />
                    <div className={`h-4 w-12 rounded-xs ${SKELETON_EL}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom Save Action Button Skeleton */}
      <div className="pt-2 flex justify-end">
        <div className={`h-[42px] w-44 rounded-sm ${SKELETON_EL}`} />
      </div>
    </div>
  );
});

/**
 * ManageJobHuntSkeleton
 * 
 * Full page skeleton including the permanent static title & subtitle header.
 * Used by Next.js streaming (loading.tsx) during route transitions.
 */
export const ManageJobHuntSkeleton = memo(function ManageJobHuntSkeleton() {
  return (
    <div 
      aria-busy="true" 
      aria-label="Loading job preferences..." 
      className="w-full max-w-5xl pb-16 mx-auto animate-in fade-in duration-300"
    >
      {/* Header with permanent Title & Subtitle (never skeletonized) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">
            Manage Job Hunt
          </h1>
          <p className="text-text-muted text-base">
            Fine-tune your preferences to get better curated job matches.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`h-[38px] w-40 rounded-sm ${SKELETON_EL}`} />
        </div>
      </div>

      <ManageJobHuntFormSkeleton />
    </div>
  );
});
