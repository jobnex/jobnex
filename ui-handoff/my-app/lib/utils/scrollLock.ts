/**
 * Production-grade reference-counted body scroll lock utility.
 * Prevents race conditions and nested locking bugs when multiple
 * components (or parent + child views) request body scroll locking on mobile.
 */

let lockCount = 0;
let prevBodyOverflow = "";

export function lockBodyScroll(): void {
  if (typeof document === "undefined") return;
  if (lockCount === 0) {
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount++;
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined") return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    // If the captured overflow was already "hidden" (e.g., from an overlapping modal or race),
    // always fall back to empty string "" so the webpage is never permanently frozen.
    document.body.style.overflow = prevBodyOverflow === "hidden" ? "" : prevBodyOverflow;
    prevBodyOverflow = "";
  }
}
