import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Mask an email address for display (e.g. alexander@gmail.com -> a********@g****.com)
 */
export function maskEmail(rawEmail: string): string {
  const fallback = "alexander@gmail.com";
  const trimmed = (rawEmail || "").trim();
  const target = trimmed.includes("@") && trimmed.includes(".") ? trimmed : fallback;

  const [username, domain] = target.split("@");
  if (!username || !domain) return "a***@g***.com";

  const dotIndex = domain.lastIndexOf(".");
  const provider = dotIndex !== -1 ? domain.slice(0, dotIndex) : domain;
  const suffix = dotIndex !== -1 ? domain.slice(dotIndex) : ".com";

  const maskedUser =
    username.length > 1
      ? username[0] + "*".repeat(Math.max(username.length - 1, 3))
      : username + "***";

  const maskedProvider =
    provider.length > 1
      ? provider[0] + "*".repeat(Math.max(provider.length - 1, 3))
      : provider + "***";

  return `${maskedUser}@${maskedProvider}${suffix}`;
}

/**
 * Returns deterministic relative time (e.g., "5h ago", "1d ago") based on job id or custom postedAt
 */
export function getJobPostedTime(id: string, customTime?: string): string {
  let targetDate: Date;

  if (customTime) {
    const parsed = new Date(customTime);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    } else {
      // Fallback if customTime is not a valid date string
      targetDate = new Date();
    }
  } else {
    // Deterministic fallback for mock data without a date
    const num = parseInt(id, 10);
    const hoursToSubtract = !isNaN(num) ? ((num - 1) % 9) * 4 + 2 : 7; 
    targetDate = new Date(Date.now() - hoursToSubtract * 60 * 60 * 1000);
  }

  const now = new Date();
  const diffMs = now.getTime() - targetDate.getTime();
  
  // If in the future or very recent, show just now or 1m
  if (diffMs < 60000) return "Just now";

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears > 0) return `${diffYears}y`;
  if (diffMonths > 0) return `${diffMonths}m`;
  if (diffWeeks > 0) return `${diffWeeks}w`;
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMins}min`; // minutes if less than an hour
}
