import { NextResponse } from "next/server";
import { Job, JobsResponse } from "@/types";
import { db } from "@/lib/db";
import { jobs, countries } from "@/lib/db/schema";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { buildJobFilterConditions } from "@/lib/db/job-filters";
import { formatSalary, mapDBJobTypeToUI, buildRelevanceOrderBy, JobSearchParamsSchema } from "@/lib/job-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Validate search params with Zod
    const parsedParams = JobSearchParamsSchema.safeParse({
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
      keyword: searchParams.get("keyword") || undefined,
    });

    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid pagination parameters" }, { status: 400 });
    }

    const { page: currentPage, limit, keyword } = parsedParams.data;
    
    const conditions = buildJobFilterConditions(searchParams);
    const whereClause = and(...conditions);

    // 1. Get total count for pagination
    const countResult = await db
      .select({ value: count() })
      .from(jobs)
      .leftJoin(countries, eq(jobs.countryId, countries.id))
      .where(whereClause);
      
    const total = countResult[0].value;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    
    // Ensure current page doesn't exceed total pages if records exist
    const actualPage = total > 0 ? Math.min(currentPage, totalPages) : 1;
    const offset = (actualPage - 1) * limit;

    // 2. Build dynamic orderBy clauses for relevance scoring
    const orderByClauses = [
      ...buildRelevanceOrderBy(jobs.jobRoleTitle, jobs.companyName, keyword),
      desc(jobs.createdAt)
    ];

    // 3. Fetch IDs first to avoid Postgres sorting TOAST columns
    const idRecords = await db
      .select({ id: jobs.id })
      .from(jobs)
      .leftJoin(countries, eq(jobs.countryId, countries.id))
      .where(whereClause)
      .orderBy(...orderByClauses)
      .limit(limit)
      .offset(offset);

    const ids = idRecords.map(r => r.id);
    let rawJobs: any[] = [];
    
    if (ids.length > 0) {
      // 4. Fetch full rows ONLY for those IDs
      const unorderedJobs = await db
        .select({
          id: jobs.id,
          jobRoleTitle: jobs.jobRoleTitle,
          companyName: jobs.companyName,
          employmentType: jobs.employmentType,
          location: jobs.location,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
          currency: jobs.currency,
          jobDescription: jobs.jobDescription,
          createdAt: jobs.createdAt,
          workModel: jobs.workModel,
          visaSponsorship: jobs.visaSponsorship,
          experienceRequired: jobs.experienceRequired,
          jobSource: jobs.jobSource,
          externalApplyUrl: jobs.externalApplyUrl,
          countryName: countries.name,
        })
        .from(jobs)
        .leftJoin(countries, eq(jobs.countryId, countries.id))
        .where(inArray(jobs.id, ids));

      // Restore the proper sort order
      const idMap = new Map();
      unorderedJobs.forEach(j => idMap.set(j.id, j));
      rawJobs = ids.map(id => idMap.get(id)).filter(Boolean);
    }

    // 5. Map DB models strictly to the UI `Job` interface
    const mappedJobs: Job[] = rawJobs.map((row) => {
      const displayLocation = row.countryName 
        ? `${row.location}, ${row.countryName}` 
        : row.location;

      return {
        id: row.id,
        jobRoleTitle: row.jobRoleTitle,
        company: row.companyName || "Unknown Company",
        type: mapDBJobTypeToUI(row.employmentType),
        location: displayLocation,
        salary: formatSalary(row.salaryMin, row.salaryMax, row.currency),
        jobDescription: row.jobDescription,
        categories: [],
        postedAt: row.createdAt.toISOString(),
        isRemote: row.workModel === "remote",
        isHybrid: row.workModel === "hybrid",
        workModel: row.workModel ?? undefined,
        visaSponsorship: row.visaSponsorship ?? undefined,
        experienceRequired: row.experienceRequired ?? undefined,
        jobSource: row.jobSource ?? undefined,
        externalApplyUrl: row.externalApplyUrl ?? undefined,
      };
    });

    const response: JobsResponse = {
      jobs: mappedJobs,
      total,
      page: actualPage,
      limit,
      totalPages,
      hasNextPage: actualPage < totalPages,
      hasPrevPage: actualPage > 1,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch jobs from database:", error);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}
