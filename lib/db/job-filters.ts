import { eq, or, ilike, gte, and, SQL } from "drizzle-orm";
import { jobs, countries } from "@/lib/db/schema";

const mapUIJobTypeToDB = (type: string): "full_time" | "part_time" | "contract" | "freelance" | "internship" => {
  switch (type.toLowerCase()) {
    case "full-time": return "full_time";
    case "part-time": return "part_time";
    case "intern": return "internship";
    case "contract": return "contract";
    default: return "full_time";
  }
};

export function buildJobFilterConditions(searchParams: URLSearchParams): SQL[] {
  const keyword = searchParams.get("keyword")?.toLowerCase().trim() || "";
  const location = searchParams.get("location")?.toLowerCase().trim() || "all";
  const jobType = searchParams.get("type")?.toLowerCase().trim() || "all";
  const minSalaryParam = searchParams.get("minSalary");
  const minSalary = minSalaryParam ? parseInt(minSalaryParam, 10) : 0;
  const postedTime = searchParams.get("postedTime")?.toLowerCase().trim() || "all";
  
  const categoriesParam = searchParams.get("categories");
  const categories = categoriesParam ? categoriesParam.split(",") : [];
  const seniority = searchParams.get("seniority")?.toLowerCase().trim() || "all";
  const visaSponsorship = searchParams.get("visaSponsorship")?.toLowerCase().trim() || "all";
  const workMode = searchParams.get("workMode")?.toLowerCase().trim() || "all";

  const searchBy = searchParams.get("searchBy")?.toLowerCase().trim() || "all";

  const conditions: SQL[] = [];

  // Base condition: only published jobs
  conditions.push(eq(jobs.status, 'published'));

  if (keyword) {
    const pattern = `%${keyword}%`;
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
        conditions.push(or(
          ilike(jobs.location, pattern),
          ilike(countries.name, pattern)
        )!);
        break;
      default:
        // Default: Title and Company (Fastest, avoids searching full description by default)
        conditions.push(
          or(
            ilike(jobs.jobRoleTitle, pattern),
            ilike(jobs.companyName, pattern)
          )!
        );
    }
  }

  if (location !== "all" && location !== "") {
    const loc = location.toLowerCase();
    // Match country name via relation
    conditions.push(ilike(countries.name, `%${loc}%`));
  }

  if (jobType && jobType !== "all") {
    conditions.push(eq(jobs.employmentType, mapUIJobTypeToDB(jobType)));
  }

  if (minSalary > 0) {
    conditions.push(gte(jobs.salaryMin, minSalary));
  }

  if (postedTime && postedTime !== "all") {
    let maxHours = 0;
    if (postedTime === "1h") maxHours = 1;
    else if (postedTime === "12h") maxHours = 12;
    else if (postedTime === "24h" || postedTime === "1d") maxHours = 24;
    else if (postedTime === "7d" || postedTime === "1w") maxHours = 168;

    if (maxHours > 0) {
      const thresholdDate = new Date(Date.now() - maxHours * 60 * 60 * 1000);
      conditions.push(gte(jobs.createdAt, thresholdDate));
    }
  }

  if (categories.length > 0) {
    const categoryConditions = categories.map(cat => 
      or(
        ilike(jobs.jobRoleTitle, `%${cat}%`),
        ilike(jobs.jobDescription, `%${cat}%`)
      )
    );
    if (categoryConditions.length > 0) {
      // Match ANY of the selected categories
      conditions.push(or(...categoryConditions)!);
    }
  }

  if (seniority && seniority !== "all") {
    conditions.push(
      or(
        ilike(jobs.jobRoleTitle, `%${seniority}%`),
        ilike(jobs.jobDescription, `%${seniority}%`)
      )!
    );
  }

  if (visaSponsorship === "sponsored") {
    conditions.push(eq(jobs.visaSponsorship, true));
  }

  if (workMode && workMode !== "all") {
    const dbWorkMode = workMode === "on-site" ? "on_site" : workMode as "remote" | "hybrid";
    conditions.push(eq(jobs.workModel, dbWorkMode));
  }

  return conditions;
}
