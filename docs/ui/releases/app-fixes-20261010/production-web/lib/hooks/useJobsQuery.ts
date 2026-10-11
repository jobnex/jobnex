import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { JobsResponse } from "@/types";

export interface UseJobsQueryProps {
  debouncedSearchQuery: string;
  searchBy: string;
  location: string;
  categories: string[];
  jobType: string;
  seniority: string;
  minSalary: number;
  postedTime: string;
  visaSponsorship: string;
  workMode: string;
  page: number;
}

export function useJobsQuery(props: UseJobsQueryProps) {
  const {
    debouncedSearchQuery,
    searchBy,
    location,
    categories,
    jobType,
    seniority,
    minSalary,
    postedTime,
    visaSponsorship,
    workMode,
    page,
  } = props;

  return useQuery<JobsResponse>({
    queryKey: [
      "jobs",
      debouncedSearchQuery,
      debouncedSearchQuery ? searchBy : 'all',
      location,
      categories,
      jobType,
      seniority,
      minSalary,
      postedTime,
      visaSponsorship,
      workMode,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearchQuery) {
        params.append("keyword", debouncedSearchQuery);
        if (searchBy && searchBy !== "all") params.append("searchBy", searchBy);
      }
      if (location) params.append("location", location);
      if (categories && categories.length > 0) params.append("categories", categories.join(","));
      if (jobType && jobType !== "all") params.append("type", jobType);
      if (seniority && seniority !== "all") params.append("seniority", seniority);
      if (minSalary > 0) params.append("minSalary", minSalary.toString());
      if (postedTime && postedTime !== "all") params.append("postedTime", postedTime);
      if (visaSponsorship && visaSponsorship !== "all") params.append("visaSponsorship", visaSponsorship);
      if (workMode && workMode !== "all") params.append("workMode", workMode);
      params.append("page", page.toString());
      params.append("limit", "24");

      const res = await fetch(`/api/jobs?${params.toString()}`);
      if (!res.ok) throw new Error("Network response was not ok");
      return res.json();
    },
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
}
