import { JobType } from "@/types";
import { sql, desc, type AnyColumn, type SQL } from "drizzle-orm";
import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 24;

export function formatJobLocation(location?: string | null, country?: string | null): string {
  const parts = (location || "").split(",").map(part => part.trim()).filter(Boolean);
  const cleanCountry = country?.trim();
  const countryKey = (value: string) => {
    const key = value.toLowerCase().replace(/[.\s]/g, "");
    if (["us", "usa", "unitedstates", "unitedstatesofamerica"].includes(key)) return "us";
    if (["uk", "gb", "unitedkingdom", "greatbritain"].includes(key)) return "uk";
    return key;
  };
  const seen = new Set<string>();
  const result = parts.filter(part => {
    const key = countryKey(part);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  if (cleanCountry && !seen.has(countryKey(cleanCountry))) result.push(cleanCountry);
  return result.join(", ") || "Location not specified";
}


export function formatSalary(min: number | null, max: number | null, currency: string | null): string {
  if (!min && !max) return "";
  const curr = currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "INR" ? "₹" : "$";
  
  const formatNum = (num: number) => {
    if (isNaN(num)) return "0";
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return num.toString();
  };

  if (min && max && min !== max) {
    return `${curr}${formatNum(min)} - ${curr}${formatNum(max)}`;
  }
  if (min) return `${curr}${formatNum(min)}+`;
  if (max) return `Up to ${curr}${formatNum(max)}`;
  return "";
}

export const mapDBJobTypeToUI = (type: string): JobType => {
  switch (type) {
    case "full_time": return "Full-time";
    case "part_time": return "Part-time";
    case "internship": return "Intern";
    case "contract": return "Contract";
    default: return "Full-time"; 
  }
};

export const mapUIJobTypeToDB = (type: string): "full_time" | "part_time" | "contract" | "freelance" | "internship" => {
  switch (type.toLowerCase()) {
    case "full-time":
    case "full_time":
      return "full_time";
    case "part-time":
    case "part_time":
      return "part_time";
    case "intern":
    case "internship":
      return "internship";
    case "contract":
      return "contract";
    case "freelance":
      return "freelance";
    default:
      return "full_time";
  }
};

/**
 * Builds the raw SQL for relevance sorting based on keyword match quality.
 * Highest relevance score (4) sorts first via desc().
 * @param jobRoleTitleCol The column reference for job title
 * @param companyNameCol The column reference for company name
 * @param keyword The user's search keyword
 */
export function buildRelevanceOrderBy(jobRoleTitleCol: AnyColumn | SQL, companyNameCol: AnyColumn | SQL, keyword: string) {
  if (!keyword) return [];
  return [
    desc(sql`CASE 
      WHEN ${jobRoleTitleCol} ILIKE ${keyword} THEN 4
      WHEN ${jobRoleTitleCol} ILIKE ${keyword + '%'} THEN 3
      WHEN ${jobRoleTitleCol} ILIKE ${'% ' + keyword + '%'} THEN 2
      WHEN ${companyNameCol} ILIKE ${keyword + '%'} THEN 1
      ELSE 0 
    END`)
  ];
}

// Reusable Zod schema for Job APIs
export const JobSearchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  keyword: z.string().trim().toLowerCase().optional().default(""),
});

/**
 * Sanitizes and normalizes external application URLs.
 * - Trims whitespace
 * - Strips unsafe schemes (javascript:, data:, vbscript:, file:)
 * - Ensures absolute https:// or http:// protocol
 * - Returns null for empty, invalid, or unsafe values
 */
export function normalizeExternalUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "#" || trimmed.toLowerCase() === "javascript:void(0)") {
    return null;
  }

  // Guard against unsafe schemes
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return null;
  }

  // Handle protocol-relative URL
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  // Already has valid http:// or https:// scheme
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Prepend https:// for schemeless domains (e.g. "boards.greenhouse.io/xyz")
  return `https://${trimmed}`;
}

export interface RawJobDbRow {
  id: string;
  jobRoleTitle: string;
  companyName: string | null;
  employmentType: string | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  jobDescription: string | null;
  createdAt: Date;
  publishedAt?: Date | null;
  workModel?: string | null;
  visaSponsorship?: boolean | null;
  experienceRequired?: number | null;
  jobSource?: string | null;
  externalApplyUrl?: string | null;
  countryName?: string | null;
}

/**
 * Standard mapper transforming raw database job rows into canonical UI Job objects.
 */
export function mapDbRowToJob(row: RawJobDbRow): import("@/types").Job {
  const displayLocation = formatJobLocation(row.location, row.countryName);

  const postedDate = row.publishedAt || row.createdAt;

  return {
    id: row.id,
    jobRoleTitle: row.jobRoleTitle,
    company: row.companyName || "Unknown Company",
    type: mapDBJobTypeToUI(row.employmentType || "full_time"),
    location: displayLocation,
    salary: formatSalary(row.salaryMin, row.salaryMax, row.currency),
    jobDescription: row.jobDescription || "",
    categories: [],
    postedAt: postedDate ? postedDate.toISOString() : undefined,
    isRemote: row.workModel === "remote",
    isHybrid: row.workModel === "hybrid",
    workModel: row.workModel ?? undefined,
    visaSponsorship: row.visaSponsorship ?? undefined,
    experienceRequired: row.experienceRequired ?? undefined,
    jobSource: row.jobSource ?? undefined,
    externalApplyUrl: normalizeExternalUrl(row.externalApplyUrl) ?? undefined,
  };
}

/**
 * High-performance work arrangement label extractor.
 * Replaces expensive 350-line full-text parse regexes with direct property evaluation.
 */
export function getWorkArrangement(job: import("@/types").Job): string {
  if (job.isRemote || job.workModel === "remote") {
    return "100% Fully Remote";
  }
  if (job.isHybrid || job.workModel === "hybrid") {
    return "Hybrid (Flexible)";
  }
  if (job.location && job.location.toLowerCase().includes("remote")) {
    return "Fully Remote";
  }
  return "Hybrid / On-site";
}

