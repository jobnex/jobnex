/** Only safe categories reach the UI; never display raw provider/candidate data. */
export function resumeFailureReason(code: string | null | undefined): string {
  if (code?.includes("timed out") || code?.includes("timeout"))
    return "The model provider timed out before a resume could be saved.";
  if (code?.includes("structured output") || code === "invalid_model_output")
    return "The model returned an invalid response before a resume could be saved.";
  return "Generation failed before a usable resume could be saved.";
}
