"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useJobStore } from "@/store/useJobStore";
import { authClient } from "@/lib/auth/client";
import { getSavedJobIds } from "@/app/actions/jobs";

export function SavedJobsHydrator() {
  const { data: session, isPending } = authClient.useSession();
  const setSavedJobIds = useJobStore((state) => state.setSavedJobIds);

  const { data } = useQuery({
    queryKey: ["saved-job-ids", session?.user?.id],
    queryFn: async () => {
      if (!session?.user) return [];
      const res = await getSavedJobIds();
      if (!res.success) throw new Error(res.error || "Failed to fetch saved job ids");
      return res.savedJobIds || [];
    },
    enabled: !isPending && !!session?.user,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data) {
      setSavedJobIds(data);
    }
  }, [data, setSavedJobIds]);

  return null;
}
