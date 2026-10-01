"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCreditStore } from "@/store/useCreditStore";

const pending = new Map<string, Promise<{ id: string; status: string }>>();
async function submit(jobId: string) {
  const storageKey = `resume-tailor-request:${jobId}`;
  let key = sessionStorage.getItem(storageKey);
  if (!key) { key = crypto.randomUUID(); sessionStorage.setItem(storageKey, key); }
  const response = await fetch("/api/resume-generations", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId, idempotencyKey: key }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not start resume generation");
  sessionStorage.removeItem(storageKey);
  return body as { id: string; status: string };
}
export function useTailorResume() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const start = async (jobId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      let request = pending.get(jobId);
      if (!request) { request = submit(jobId); pending.set(jobId, request); }
      const result = await request;
      toast.success(result.status === "queued" ? "Resume generation queued" : `Resume generation: ${result.status.replaceAll("_", " ")}`);
      void useCreditStore.getState().fetchCredits();
      router.push(`/job-hunt/resumes?jobId=${encodeURIComponent(jobId)}&generationId=${encodeURIComponent(result.id)}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not start resume generation"); }
    finally { pending.delete(jobId); setBusy(false); }
  };
  return { start, busy };
}
