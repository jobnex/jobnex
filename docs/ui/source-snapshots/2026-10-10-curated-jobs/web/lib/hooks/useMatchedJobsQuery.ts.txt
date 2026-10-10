import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { MatchedJobsResult, PostedWithin, CuratedSort } from "@/lib/db/job-matching";
import { DEFAULT_PAGE_SIZE } from "@/lib/job-utils";

export interface UseMatchedJobsQueryProps {
  page: number;
  debouncedSearchQuery: string;
  activeTab: "jobs" | "requested";
  limit?: number;
  postedWithin?: PostedWithin;
  sort?: CuratedSort;
}

export function useMatchedJobsQuery(props: UseMatchedJobsQueryProps) {
  const { page, debouncedSearchQuery, activeTab, limit = DEFAULT_PAGE_SIZE, postedWithin = "24h", sort = "newest" } = props;

  return useQuery<MatchedJobsResult>({
    queryKey: ["matched-jobs", activeTab, debouncedSearchQuery, postedWithin, sort, page, limit],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("limit", limit.toString());
      params.append("tab", activeTab);
      params.append("postedWithin", postedWithin);
      params.append("sort", sort);
      if (debouncedSearchQuery) {
        params.append("keyword", debouncedSearchQuery);
      }

      const res = await fetch(`/api/jobs/curated?${params.toString()}`, { cache: "no-store", signal });
      if (!res.ok) {
        throw new Error(res.status === 401 ? "Sign in to view your curated jobs" : "Could not load curated jobs. Please retry.");
      }
      return res.json();
    },
    // Preserve only pagination within the same criteria; never flash older-window results.
    placeholderData: (previousData, previousQuery) => {
      const key = previousQuery?.queryKey;
      return key?.[1] === activeTab && key?.[2] === debouncedSearchQuery
        && key?.[3] === postedWithin && key?.[4] === sort ? keepPreviousData(previousData) : undefined;
    },
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });
}
