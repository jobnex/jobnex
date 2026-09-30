import { JobType } from "@/types";
import { sql } from "drizzle-orm";
import { z } from "zod";

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
}

export const mapUIJobTypeToDB = (type: string): "full_time" | "part_time" | "contract" | "freelance" | "internship" => {
  switch (type.toLowerCase()) {
    case "full-time": return "full_time";
    case "part-time": return "part_time";
    case "intern": return "internship";
    case "contract": return "contract";
    default: return "full_time";
  }
}

/**
 * Builds the raw SQL for relevance sorting based on keyword match quality.
 * @param jobRoleTitleCol The column reference for job title
 * @param companyNameCol The column reference for company name
 * @param keyword The user's search keyword
 */
export function buildRelevanceOrderBy(jobRoleTitleCol: any, companyNameCol: any, keyword: string) {
  if (!keyword) return [];
  return [
    sql`CASE 
      WHEN ${jobRoleTitleCol} ILIKE ${keyword} THEN 4
      WHEN ${jobRoleTitleCol} ILIKE ${keyword + '%'} THEN 3
      WHEN ${jobRoleTitleCol} ILIKE ${'% ' + keyword + '%'} THEN 2
      WHEN ${companyNameCol} ILIKE ${keyword + '%'} THEN 1
      ELSE 0 
    END`
  ];
}

// Reusable Zod schema for Job APIs
export const JobSearchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  keyword: z.string().trim().toLowerCase().optional().default(""),
});
