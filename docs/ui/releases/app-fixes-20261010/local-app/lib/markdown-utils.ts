export function formatJobDescriptionToMarkdown(text: string): string {
  if (!text) return "";

  let processed = text;

  // 1. Normalize line endings
  processed = processed.replace(/\r\n/g, "\n");

  // 2. Normalize and convert fake bullets to markdown bullets
  // Handles bullets like ·, •, ●, ▪, ➢, -, * possibly indented, followed by spaces
  processed = processed.replace(/^[ \t]*[·•●▪➢]\s+/gm, "- ");

  // 3. Detect capitalized words or phrases followed by a colon as bold text (e.g., "Requirements:")
  processed = processed.replace(/^[ \t]*([A-Z][a-zA-Z\s&/]+):(?=\s|\n)/gm, "**$1:**");

  // 4. Detect short stand-alone lines that look like headings
  // It matches the start of the string OR newlines, followed by a short phrase (no punctuation at the end, except maybe a colon), followed by newlines.
  processed = processed.replace(/(^|\n{1,3})[ \t]*([A-Z][A-Za-z0-9&\s,'’/]+?)[ \t]*(\n{1,2}|$)/g, (match, prefix, content, suffix) => {
    const trimmed = content.trim();
    // Exclude common false positives (too short, too long, or common connective words)
    if (trimmed.length >= 3 && trimmed.length <= 60 && !trimmed.includes("  ")) {
      // If it looks like a heading (e.g. "About the Role", "What you'll do", "Requirements")
      return `${prefix}\n### ${trimmed}\n${suffix}`;
    }
    return match;
  });

  // 5. Clean up excessive newlines (more than 2 into just 2)
  processed = processed.replace(/\n{3,}/g, "\n\n");

  return processed.trim();
}
