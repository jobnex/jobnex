import { useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useJobStore, useAppFilters } from "@/store/useJobStore";

/**
 * High-performance bidirectional synchronization between URL search parameters
 * and Zustand filter state. Supports browser back/forward history navigation seamlessly.
 */
export function useSyncUrlFilters(variant: "default" | "saved" = "default") {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const {
    searchQuery,
    locationQuery,
    searchBy,
    categories,
    jobType,
    seniority,
    minSalary,
    postedTime,
    visaSponsorship,
    workMode,
    page,
  } = useAppFilters(variant);

  const lastPushedUrlRef = useRef<string>("");
  const isSyncingFromUrlRef = useRef<boolean>(false);

  // 1. Sync FROM URL to Zustand (on mount and on browser back/forward navigation)
  useEffect(() => {
    const currentUrlParams = searchParams.toString();
    // If this URL change was triggered by our own router.replace, ignore it
    if (currentUrlParams === lastPushedUrlRef.current) return;

    isSyncingFromUrlRef.current = true;

    const query = searchParams.get("keyword") || "";
    const locQuery = searchParams.get("locationQuery") || "";
    const sBy = searchParams.get("searchBy") || "all";
    const cats = searchParams.get("categories")?.split(",").filter(Boolean) || [];
    const type = searchParams.get("type") || "";
    const sen = searchParams.get("seniority") || "";
    const minSal = parseInt(searchParams.get("minSalary") || "0", 10);
    const time = searchParams.get("postedTime") || "";
    const visa = searchParams.get("visaSponsorship") || "";
    const wMode = searchParams.get("workMode") || "";
    const p = parseInt(searchParams.get("page") || "1", 10);

    const updateState = {
      searchQuery: query,
      locationQuery: locQuery,
      searchBy: sBy,
      categories: cats,
      jobType: type,
      seniority: sen,
      minSalary: isNaN(minSal) ? 0 : minSal,
      postedTime: time,
      visaSponsorship: visa,
      workMode: wMode,
      page: isNaN(p) ? 1 : p,
    };

    if (variant === "saved") {
      useJobStore.setState({
        savedSearchQuery: updateState.searchQuery,
        savedLocationQuery: updateState.locationQuery,
        savedSearchBy: updateState.searchBy,
        savedCategories: updateState.categories,
        savedJobType: updateState.jobType,
        savedSeniority: updateState.seniority,
        savedMinSalary: updateState.minSalary,
        savedPostedTime: updateState.postedTime,
        savedVisaSponsorship: updateState.visaSponsorship,
        savedWorkMode: updateState.workMode,
        savedPage: updateState.page,
      });
    } else {
      useJobStore.setState(updateState);
    }

    lastPushedUrlRef.current = currentUrlParams;
    // Reset sync flag on next tick
    requestAnimationFrame(() => {
      isSyncingFromUrlRef.current = false;
    });
  }, [searchParams, variant]);

  // 2. Sync FROM Zustand to URL (when store filters change from user interaction)
  useEffect(() => {
    if (isSyncingFromUrlRef.current) return;

    const newParams = new URLSearchParams();

    if (searchQuery) newParams.set("keyword", searchQuery);
    if (locationQuery) newParams.set("locationQuery", locationQuery);
    if (searchBy && searchBy !== "all") newParams.set("searchBy", searchBy);
    if (categories.length > 0) newParams.set("categories", categories.join(","));
    if (jobType && jobType !== "all") newParams.set("type", jobType);
    if (seniority && seniority !== "all") newParams.set("seniority", seniority);
    if (minSalary > 0) newParams.set("minSalary", minSalary.toString());
    if (postedTime && postedTime !== "all") newParams.set("postedTime", postedTime);
    if (visaSponsorship && visaSponsorship !== "all") newParams.set("visaSponsorship", visaSponsorship);
    if (workMode && workMode !== "all") newParams.set("workMode", workMode);
    if (page > 1) newParams.set("page", page.toString());

    const newQueryString = newParams.toString();
    const currentQueryString = searchParams.toString();

    if (newQueryString !== currentQueryString && newQueryString !== lastPushedUrlRef.current) {
      lastPushedUrlRef.current = newQueryString;
      const targetUrl = newQueryString ? `${pathname}?${newQueryString}` : pathname;
      router.replace(targetUrl, { scroll: false });
    }
  }, [
    searchQuery,
    locationQuery,
    searchBy,
    categories,
    jobType,
    seniority,
    minSalary,
    postedTime,
    visaSponsorship,
    workMode,
    page,
    pathname,
    router,
    searchParams,
  ]);
}
