import { createHash } from "node:crypto";

export const RESUME_VALIDATOR_VERSION = "single-column-v1";
export const UNSUPPORTED_LAYOUT = "This layout isn't supported. Use one of our four templates or upload a standard single-column PDF.";
export const sourceDigest = (text: string) => createHash("sha256").update(text.replace(/\r\n?/g, "\n")).digest("hex");

export function admissionError(content: string, parsed: Record<string, unknown>): string | null {
  const proof = parsed.layoutValidation as Record<string, unknown> | undefined;
  if (proof?.validatorVersion !== RESUME_VALIDATOR_VERSION || !proof.confirmedAt ||
      proof.contentSha256 !== sourceDigest(content) || typeof proof.importId !== "string") {
    return "Your base resume needs format validation and confirmation. Open Manage Job Hunt and review a supported PDF before generating.";
  }
  return null;
}
