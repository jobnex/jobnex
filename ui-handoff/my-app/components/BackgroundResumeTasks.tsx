"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listResumeRequests } from "@/app/actions/tailored-resume";
import { useCreditStore } from "@/store/useCreditStore";
import { toast } from "sonner";

/**
 * Headless Background Resume Watcher
 * 
 * Runs silently in the background across the entire application:
 * - Completely strips away floating UI elements, drawers, and pills (0 DOM footprint).
 * - Monitors active ("queued" | "running") resume tailoring requests.
 * - Shuts down polling completely when idle (zero network requests when no jobs are active).
 * - Fires global Sonner toasts when jobs transition to terminal states (completed / failed).
 * - Synchronizes credit balances and dispatches "resume-requests-changed" events.
 */
export function BackgroundResumeTasks() {
  const router = useRouter();
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef<boolean>(false);
  const activeIdsRef = useRef<Set<string>>(new Set());
  const prevStatusesRef = useRef<Map<string, string>>(new Map());
  const pollTickRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Stop polling timer cleanly
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Authoritative status check loop
  // ONLY schedules subsequent ticks if there are active ("queued" or "running") requests.
  // Shuts down completely (0 network requests) when idle or all jobs reach terminal state.
  const pollTick = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const res = await listResumeRequests();
      if (!res.success || !res.requests) {
        return;
      }

      const newActiveIds = new Set<string>();
      let anyJustFinished = false;

      for (const req of res.requests) {
        const isNowActive = req.status === "queued" || req.status === "running";
        if (isNowActive) {
          newActiveIds.add(req.id);
        }

        const prevStatus = prevStatusesRef.current.get(req.id);
        const wasActive = prevStatus === "queued" || prevStatus === "running";

        // Detect status transition from active -> terminal state
        if (wasActive && !isNowActive) {
          anyJustFinished = true;
          if (req.status === "completed" || req.hasDraft) {
            if (req.status === "needs_review") {
              toast.info(`Tailored resume ready for ${req.companyName} (Review suggested)`, {
                description: req.reviewReason || "Review bullet points in My Applications.",
                action: {
                  label: "View in Applications",
                  onClick: () => router.push("/job-hunt/applications"),
                },
                duration: 7000,
              });
            } else {
              toast.success(`Tailored resume ready for ${req.companyName}!`, {
                description: req.jobTitle ? `${req.jobTitle}` : undefined,
                action: {
                  label: "View in Applications",
                  onClick: () => router.push("/job-hunt/applications"),
                },
                duration: 6000,
              });
            }
          } else if (req.status === "failed") {
            toast.error(`Tailoring failed for ${req.companyName}`, {
              description: req.errorCode || "Your credit has been refunded.",
              action: {
                label: "View in Applications",
                onClick: () => router.push("/job-hunt/applications"),
              },
              duration: 6000,
            });
          }
        }

        prevStatusesRef.current.set(req.id, req.status);
      }

      if (anyJustFinished) {
        // Sync candidate credit wallet across the application
        useCreditStore.getState().fetchCredits().catch(() => {});
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("resume-requests-changed"));
        }
      }

      activeIdsRef.current = newActiveIds;

      // Stop any existing timer before scheduling next tick
      stopPolling();

      // Controlled polling schedule:
      // If there are still active jobs in progress, check again in 4 seconds.
      // If ALL jobs have finished (or none exist), STOP polling completely. Zero idle network calls.
      if (newActiveIds.size > 0) {
        pollTimerRef.current = setTimeout(() => {
          pollTickRef.current();
        }, 4000);
      }
    } catch (err) {
      console.warn("[BackgroundResumeWatcher] Polling check encountered error:", err);
      stopPolling();
      // On network failure, retry once in 8s if active jobs were pending
      if (activeIdsRef.current.size > 0) {
        pollTimerRef.current = setTimeout(() => {
          pollTickRef.current();
        }, 8000);
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, [stopPolling, router]);

  // Keep ref synchronized with the memoized callback
  useEffect(() => {
    pollTickRef.current = pollTick;
  }, [pollTick]);

  // Mount, external event listener, and tab visibility management
  useEffect(() => {
    // 1. Initial status fetch on mount
    void Promise.resolve().then(() => {
      pollTick();
    });

    // 2. React to tailoring initiation from modal
    const handleRequestsChanged = () => {
      stopPolling();
      pollTick();
    };

    // 3. Tab visibility handler: pause timer when backgrounded, resume when focused
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (activeIdsRef.current.size > 0) {
          stopPolling();
          pollTick();
        }
      } else {
        stopPolling();
      }
    };

    window.addEventListener("resume-requests-changed", handleRequestsChanged);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("resume-requests-changed", handleRequestsChanged);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopPolling();
    };
  }, [pollTick, stopPolling]);

  // Zero DOM footprint: 100% headless watcher service
  return null;
}
