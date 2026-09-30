import { useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useJobStore, useAppFilters } from "@/store/useJobStore";
import { useDebounce } from "./useDebounce";

export function useSyncUrlFilters(variant: "default" | "saved" = "default") {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  
  const {
    searchQuery,
    searchBy,
    categories,
    jobType,
    seniority,
    minSalary,
    postedTime,
    visaSponsorship,
    workMode,
    page
  } = useAppFilters(variant);

  const debouncedSearchQuery = useDebounce(searchQuery, 400);
  const isInitialized = useRef(false);

  // 1. On Mount: Read from URL and populate Zustand
  useEffect(() => {
    if (isInitialized.current) return;
    
    const query = searchParams.get("keyword") || "";
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
      searchBy: sBy,
      categories: cats,
      jobType: type,
      seniority: sen,
      minSalary: isNaN(minSal) ? 0 : minSal,
      postedTime: time,
      visaSponsorship: visa,
      workMode: wMode,
      page: isNaN(p) ? 1 : p
    };

    if (variant === "saved") {
      useJobStore.setState({
        savedSearchQuery: updateState.searchQuery,
        savedSearchBy: updateState.searchBy,
        savedCategories: updateState.categories,
        savedJobType: updateState.jobType,
        savedSeniority: updateState.seniority,
        savedMinSalary: updateState.minSalary,
        savedPostedTime: updateState.postedTime,
        savedVisaSponsorship: updateState.visaSponsorship,
        savedWorkMode: updateState.workMode,
        savedPage: updateState.page
      });
    } else {
      useJobStore.setState(updateState);
    }

    isInitialized.current = true;
  }, [searchParams, variant]);

  // 2. On Zustand Change: Update URL
  useEffect(() => {
    if (!isInitialized.current) return;

    const currentParams = new URLSearchParams(searchParams.toString());
    const newParams = new URLSearchParams();

    if (debouncedSearchQuery) newParams.set("keyword", debouncedSearchQuery);
    if (searchBy && searchBy !== "all") newParams.set("searchBy", searchBy);
    if (categories.length > 0) newParams.set("categories", categories.join(","));
    if (jobType) newParams.set("type", jobType);
    if (seniority) newParams.set("seniority", seniority);
    if (minSalary > 0) newParams.set("minSalary", minSalary.toString());
    if (postedTime) newParams.set("postedTime", postedTime);
    if (visaSponsorship) newParams.set("visaSponsorship", visaSponsorship);
    if (workMode) newParams.set("workMode", workMode);
    if (page > 1) newParams.set("page", page.toString());

    if (currentParams.toString() !== newParams.toString()) {
      router.replace(`${pathname}?${newParams.toString()}`, { scroll: false });
    }
  }, [
    debouncedSearchQuery, searchBy, categories, jobType, seniority, 
    minSalary, postedTime, visaSponsorship, workMode, page, 
    pathname, router, searchParams
  ]);
}
