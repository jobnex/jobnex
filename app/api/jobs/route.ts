import { NextResponse } from "next/server";
import { Job, JobsResponse } from "@/types";
import { db } from "@/lib/db";
import { jobs, countries } from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { buildJobFilterConditions, hasCountryJoinRequired } from "@/lib/db/job-filters";
import { buildRelevanceOrderBy, JobSearchParamsSchema, mapDbRowToJob } from "@/lib/job-utils";

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

    const { page: requestedPage, limit, keyword } = parsedParams.data;

    const conditions = buildJobFilterConditions(searchParams);
    const whereClause = and(...conditions);
    const needsCountryJoin = hasCountryJoinRequired(searchParams);

    const executeCount = () =>
      needsCountryJoin
        ? db.select({ value: count() }).from(jobs).leftJoin(countries, eq(jobs.countryId, countries.id)).where(whereClause)
        : db.select({ value: count() }).from(jobs).where(whereClause);

    // Fast path: if only count is requested, skip row retrieval and relevance sorting
    if (searchParams.get("countOnly") === "true") {
      const countResult = await executeCount();
      const total = countResult[0]?.value ?? 0;
      return NextResponse.json({ total, jobs: [], totalPages: 0, page: 1, limit: 0 });
    }

    // Build dynamic orderBy clauses with relevance scoring (highest score first)
    const orderByClauses = [
      ...buildRelevanceOrderBy(jobs.jobRoleTitle, jobs.companyName, keyword),
      desc(jobs.createdAt)
    ];

    const fetchJobRows = (offset: number) =>
      db
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
          publishedAt: jobs.publishedAt,
          workModel: jobs.workModel,
          visaSponsorship: jobs.visaSponsorship,
          experienceRequired: jobs.experienceRequired,
          jobSource: jobs.jobSource,
          externalApplyUrl: jobs.externalApplyUrl,
          countryName: countries.name,
        })
        .from(jobs)
        .leftJoin(countries, eq(jobs.countryId, countries.id))
        .where(whereClause)
        .orderBy(...orderByClauses)
        .limit(limit)
        .offset(offset);

    const initialOffset = (requestedPage - 1) * limit;

    // Concurrently fetch count and job records in a single database round-trip
    const [countResult, initialRows] = await Promise.all([
      executeCount(),
      fetchJobRows(initialOffset),
    ]);

    const total = countResult[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const actualPage = total > 0 ? Math.min(requestedPage, totalPages) : 1;

    let rawJobs = initialRows;
    // Edge case: if client requested an out-of-range page that returned empty, fetch the clamped page
    if (actualPage !== requestedPage && total > 0 && rawJobs.length === 0) {
      rawJobs = await fetchJobRows((actualPage - 1) * limit);
    }

    const mappedJobs: Job[] = rawJobs.map(mapDbRowToJob);

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
