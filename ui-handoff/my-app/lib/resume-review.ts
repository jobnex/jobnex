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

const messages: Record<string, string> = {
  "experience.metric_count": "Review the number of source-backed results in each flagged role.",
  "projects.metric_count": "Review the source-backed results in the project bullets.",
  "length.word_count": "Review resume length and retain relevant source details without adding filler.",
  "length.fit_unavailable": "Automatic length fitting could not finish. Review the saved draft.",
  "experience.bullet_count": "Review the number of bullets under each role.",
  "project.bullet_count": "Review the number of project bullets.",
  "skills.category_count": "Review skill categories and remove duplicate technologies.",
};

export function resumeReviewReason(audit: Record<string, unknown>): string | null {
  const ledger = Array.isArray(audit.compliance_ledger) ? audit.compliance_ledger : [];
  const codes = ledger.filter((entry) => entry && typeof entry === "object" && entry.passed === false)
    .map((entry) => String(entry.code || ""));
  const raw = [audit.error, audit.review_reason, audit.reason, audit.summary,
    ...(Array.isArray(audit.issues) ? audit.issues : [])].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const reasons = [...new Set([...codes, ...raw.flatMap(value => value.split(/[,;]/).map(code => code.trim()))]
    .map(code => messages[code]).filter(Boolean))];
  if (reasons.length) return reasons.join(" ");
  if (!raw.length && !codes.length) return null;
  return "Review this draft's factual accuracy, role details and formatting before approving.";
}
