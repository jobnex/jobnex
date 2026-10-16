import { eq, or, and, ilike, gte, lte, SQL } from "drizzle-orm";
import { jobs, countries } from "@/lib/db/schema";
import { mapUIJobTypeToDB } from "@/lib/job-utils";

function escapeLikeString(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

// Domain category synonyms & expansion map for smart semantic matching
const DOMAIN_KEYWORD_MAP: Record<string, string[]> = {
  engineering: ["engineer", "software", "developer", "architect", "tech"],
  design: ["design", "ui", "ux", "creative", "graphic", "visual"],
  marketing: ["marketing", "growth", "seo", "content", "brand"],
  product: ["product", "product manager", "sales", "account executive"],
  developer: ["developer", "frontend", "backend", "fullstack", "software"],
  "ai-ml": ["ai", "ml", "machine learning", "artificial intelligence", "data science", "nlp", "llm"],
  analyst: ["analyst", "analytics", "business intelligence", "bi", "data"],
  uxui: ["ux", "ui", "product design", "user experience", "user interface"],
  finance: ["finance", "financial", "accounting", "fintech"],
  operations: ["operations", "ops", "logistics", "coordinator"],
};

const POSTED_TIME_HOURS: Record<string, number> = {
  "1h": 1,
  "2h": 2,
  "12h": 12,
  "24h": 24,
  "1d": 24,
  "2d": 48,
  "7d": 168,
  "1w": 168,
  "14d": 336,
  "2w": 336,
};

export function buildJobFilterConditions(searchParams: URLSearchParams): SQL[] {
  const keyword = searchParams.get("keyword")?.toLowerCase().trim() || "";
  const locationQuery = searchParams.get("locationQuery")?.toLowerCase().trim() || "";
  const location = searchParams.get("location")?.toLowerCase().trim() || "all";
  const jobType = searchParams.get("type")?.toLowerCase().trim() || "all";
  const minSalaryParam = searchParams.get("minSalary");
  const minSalary = minSalaryParam ? parseInt(minSalaryParam, 10) : 0;
  const postedTime = searchParams.get("postedTime")?.toLowerCase().trim() || "all";

  const categoriesParam = searchParams.get("categories");
  const categories = categoriesParam ? categoriesParam.split(",").map(c => c.trim().toLowerCase()).filter(Boolean) : [];
  const seniority = searchParams.get("seniority")?.toLowerCase().trim() || "all";
  const visaSponsorship = searchParams.get("visaSponsorship")?.toLowerCase().trim() || "all";
  const workMode = searchParams.get("workMode")?.toLowerCase().trim() || "all";

  const searchBy = searchParams.get("searchBy")?.toLowerCase().trim() || "all";

  const conditions: SQL[] = [];

  // Base condition: only published jobs
  conditions.push(eq(jobs.status, "published"));

  // 1. Keyword search
  if (keyword) {
    const escapedKeyword = escapeLikeString(keyword);
    const pattern = `%${escapedKeyword}%`;
    switch (searchBy) {
      case "title":
        conditions.push(ilike(jobs.jobRoleTitle, pattern));
        break;
      case "company":
        conditions.push(ilike(jobs.companyName, pattern));
        break;
      case "description":
        conditions.push(ilike(jobs.jobDescription, pattern));
        break;
      case "location":
        conditions.push(
          or(
            ilike(jobs.location, pattern),
            ilike(countries.name, pattern)
          )!
        );
        break;
      default:
        // Default: match title or company for fastest and highest-relevance retrieval
        conditions.push(
          or(
            ilike(jobs.jobRoleTitle, pattern),
            ilike(jobs.companyName, pattern)
          )!
        );
    }
  }

  // 1b. City / State location query
  if (locationQuery) {
    conditions.push(ilike(jobs.location, `%${escapeLikeString(locationQuery)}%`));
  }

  // 2. Country location filtering (omit if 'all' or 'worldwide')
  // Strictly filter based on which country the job is associated with in the DB.
  if (location && location !== "all" && location !== "worldwide") {
    conditions.push(
      or(
        ilike(countries.name, location),
        ilike(countries.code, location)
      )!
    );
  }

  // 3. Job Type (Full-time, Internship, Contract, Part-time, Freelance)
  if (jobType && jobType !== "all") {
    conditions.push(eq(jobs.employmentType, mapUIJobTypeToDB(jobType)));
  }

  // 4. Minimum Salary (satisfied if either min or max salary reaches threshold)
  if (minSalary > 0) {
    conditions.push(
      or(
        gte(jobs.salaryMin, minSalary),
        gte(jobs.salaryMax, minSalary)
      )!
    );
  }

  // 5. Posted Time
  if (postedTime && postedTime !== "all") {
    const maxHours = POSTED_TIME_HOURS[postedTime] || 0;
    if (maxHours > 0) {
      const thresholdDate = new Date(Date.now() - maxHours * 60 * 60 * 1000);
      conditions.push(gte(jobs.createdAt, thresholdDate));
    }
  }

  // 6. Categories (High-performance Role Title Semantic Expansion)
  if (categories.length > 0) {
    const categoryClauses: SQL[] = [];
    for (const cat of categories) {
      const keywords = DOMAIN_KEYWORD_MAP[cat] || [cat];
      const matchKeywords = keywords.map(kw => ilike(jobs.jobRoleTitle, `%${kw}%`));
      categoryClauses.push(or(...matchKeywords)!);
    }
    if (categoryClauses.length > 0) {
      conditions.push(or(...categoryClauses)!);
    }
  }

  // 7. Seniority Level
  if (seniority && seniority !== "all") {
    if (seniority === "fresher") {
      conditions.push(
        or(
          ilike(jobs.jobRoleTitle, "%fresher%"),
          ilike(jobs.jobRoleTitle, "%graduate%"),
          ilike(jobs.jobRoleTitle, "%intern%"),
          lte(jobs.experienceRequired, 0)
        )!
      );
    } else if (seniority === "entry-level" || seniority === "entry") {
      conditions.push(
        or(
          ilike(jobs.jobRoleTitle, "%entry%"),
          ilike(jobs.jobRoleTitle, "%junior%"),
          ilike(jobs.jobRoleTitle, "%associate%"),
          lte(jobs.experienceRequired, 2)
        )!
      );
    } else if (seniority === "mid" || seniority === "mid-level") {
      conditions.push(
        or(
          ilike(jobs.jobRoleTitle, "%mid%"),
          and(gte(jobs.experienceRequired, 2), lte(jobs.experienceRequired, 5))
        )!
      );
    } else if (seniority === "senior") {
      conditions.push(
        or(
          ilike(jobs.jobRoleTitle, "%senior%"),
          ilike(jobs.jobRoleTitle, "%sr.%"),
          ilike(jobs.jobRoleTitle, "%sr %"),
          gte(jobs.experienceRequired, 5)
        )!
      );
    } else if (seniority === "lead") {
      conditions.push(
        or(
          ilike(jobs.jobRoleTitle, "%lead%"),
          ilike(jobs.jobRoleTitle, "%staff%"),
          ilike(jobs.jobRoleTitle, "%principal%"),
          gte(jobs.experienceRequired, 8)
        )!
      );
    } else {
      conditions.push(
        or(
          ilike(jobs.jobRoleTitle, `%${seniority}%`),
          ilike(jobs.jobDescription, `%${seniority}%`)
        )!
      );
    }
  }

  // 8. Visa Sponsorship
  if (visaSponsorship === "sponsored") {
    conditions.push(eq(jobs.visaSponsorship, true));
  }

  // 9. Work Mode (remote, hybrid, on-site)
  if (workMode && workMode !== "all") {
    const dbWorkMode = workMode === "on-site" ? "on_site" : (workMode as "remote" | "hybrid");
    conditions.push(eq(jobs.workModel, dbWorkMode));
  }

  return conditions;
}

/**
 * Returns true if the query conditions require joining the countries table.
 * Skipping this join on general queries speeds up count(*) by up to 2-3x.
 */
export function hasCountryJoinRequired(searchParams: URLSearchParams): boolean {
  const location = searchParams.get("location")?.toLowerCase().trim();
  const searchBy = searchParams.get("searchBy")?.toLowerCase().trim();
  const keyword = searchParams.get("keyword")?.trim();

  if (location && location !== "all" && location !== "worldwide") {
    return true;
  }
  if (keyword && searchBy === "location") {
    return true;
  }
  return false;
}
