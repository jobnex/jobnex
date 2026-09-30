import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { jobs, savedJobs, countries } from "@/lib/db/schema";
import { eq, desc, and, count, inArray } from "drizzle-orm";
import { buildJobFilterConditions } from "@/lib/db/job-filters";
import { Job, JobsResponse } from "@/types";
import { formatSalary, mapDBJobTypeToUI, buildRelevanceOrderBy, JobSearchParamsSchema } from "@/lib/job-utils";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
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
    
    // Abstract filtering engine
    const conditions = buildJobFilterConditions(searchParams);
    // Add the fundamental saved job criteria
    conditions.push(eq(savedJobs.userId, userId));

    const whereClause = and(...conditions);
    
    // 1. Get total count
    const countResult = await db
      .select({ value: count() })
      .from(savedJobs)
      .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
      .leftJoin(countries, eq(jobs.countryId, countries.id))
      .where(whereClause);
      
    const total = countResult[0].value;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const actualPage = total > 0 ? Math.min(currentPage, totalPages) : 1;
    const offset = (actualPage - 1) * limit;

    // 2. Build dynamic orderBy clauses for relevance scoring
    const orderByClauses = [
      ...buildRelevanceOrderBy(jobs.jobRoleTitle, jobs.companyName, keyword),
      desc(savedJobs.createdAt)
    ];

    // 3. Fetch IDs first to avoid Postgres sorting TOAST columns
    const idRecords = await db
      .select({ id: jobs.id })
      .from(savedJobs)
      .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
      .leftJoin(countries, eq(jobs.countryId, countries.id))
      .where(whereClause)
      .orderBy(...orderByClauses)
      .limit(limit)
      .offset(offset);

    const ids = idRecords.map(r => r.id);
    let rawJobs: any[] = [];

    if (ids.length > 0) {
      const unorderedJobs = await db
        .select({
          job: jobs,
          countryCode: countries.code,
          countryName: countries.name,
        })
        .from(jobs)
        .leftJoin(countries, eq(jobs.countryId, countries.id))
        .where(inArray(jobs.id, ids));
        
      const idMap = new Map();
      unorderedJobs.forEach(j => idMap.set(j.job.id, j));
      rawJobs = ids.map(id => idMap.get(id)).filter(Boolean);
    }

    // 4. Map to UI
    const mappedJobs: Job[] = rawJobs.map(({ job, countryName }) => {
      const displayLocation = countryName 
        ? `${job.location}, ${countryName}` 
        : job.location;

      return {
        id: job.id,
        jobRoleTitle: job.jobRoleTitle,
        company: job.companyName || "Unknown Company",
        type: mapDBJobTypeToUI(job.employmentType),
        location: displayLocation,
        salary: formatSalary(job.salaryMin, job.salaryMax, job.currency),
        jobDescription: job.jobDescription,
        categories: [],
        postedAt: job.publishedAt ? job.publishedAt.toISOString() : job.createdAt.toISOString(),
        isRemote: job.workModel === "remote",
        isHybrid: job.workModel === "hybrid",
        workModel: job.workModel ?? undefined,
        visaSponsorship: job.visaSponsorship ?? undefined,
        experienceRequired: job.experienceRequired ?? undefined,
        jobSource: job.jobSource ?? undefined,
        externalApplyUrl: job.externalApplyUrl ?? undefined,
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
    console.error("Error fetching saved jobs:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
