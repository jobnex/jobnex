import { createHash } from "node:crypto";

export interface ResumeGenerationReview {
  id: string;
  status: string;
  auditJson: unknown;
}

export function resumeDigest(markdown: string): string {
  return createHash("sha256").update(markdown).digest("hex");
}

export function resumeReviewError(generation: ResumeGenerationReview | undefined, expectedId: string | null | undefined, markdown: string): string | null {
  if (!generation || generation.id !== expectedId) return "Reload the latest resume before continuing.";
  if (!["completed", "completed_with_estimates", "needs_review"].includes(generation.status)) return "This generation did not produce a usable resume.";
  if (generation.status === "needs_review") {
    const audit = generation.auditJson as { human_review?: { generation_id?: string; markdown_sha256?: string } } | null;
    if (audit?.human_review?.generation_id !== generation.id || audit.human_review.markdown_sha256 !== resumeDigest(markdown)) {
      return "This draft needs review. Save your corrections, then explicitly approve the saved version before exporting.";
    }
  }
  return null;
}
