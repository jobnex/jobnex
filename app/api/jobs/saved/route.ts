import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { jobs, savedJobs, countries } from "@/lib/db/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { buildJobFilterConditions, hasCountryJoinRequired } from "@/lib/db/job-filters";
import { Job, JobsResponse } from "@/types";
import { buildRelevanceOrderBy, JobSearchParamsSchema, mapDbRowToJob } from "@/lib/job-utils";

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

    const { page: requestedPage, limit, keyword } = parsedParams.data;

    // Abstract filtering engine
    const conditions = buildJobFilterConditions(searchParams);
    // Add the fundamental saved job criteria
    conditions.push(eq(savedJobs.userId, userId));

    const whereClause = and(...conditions);
    const needsCountryJoin = hasCountryJoinRequired(searchParams);

    const executeCount = () =>
      needsCountryJoin
        ? db
            .select({ value: count() })
            .from(savedJobs)
            .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
            .leftJoin(countries, eq(jobs.countryId, countries.id))
            .where(whereClause)
        : db
            .select({ value: count() })
            .from(savedJobs)
            .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
            .where(whereClause);

    // Fast path: if only count is requested, skip row retrieval and relevance sorting
    if (searchParams.get("countOnly") === "true") {
      const countResult = await executeCount();
      const total = countResult[0]?.value ?? 0;
      return NextResponse.json({ total, jobs: [], totalPages: 0, page: 1, limit: 0 });
    }

    // Build dynamic orderBy clauses with relevance scoring (highest score first)
    const orderByClauses = [
      ...buildRelevanceOrderBy(jobs.jobRoleTitle, jobs.companyName, keyword),
      desc(savedJobs.createdAt)
    ];

    const fetchSavedJobRows = (offset: number) =>
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
          createdAt: savedJobs.createdAt,
          publishedAt: jobs.publishedAt,
          workModel: jobs.workModel,
          visaSponsorship: jobs.visaSponsorship,
          experienceRequired: jobs.experienceRequired,
          jobSource: jobs.jobSource,
          externalApplyUrl: jobs.externalApplyUrl,
          countryName: countries.name,
        })
        .from(savedJobs)
        .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
        .leftJoin(countries, eq(jobs.countryId, countries.id))
        .where(whereClause)
        .orderBy(...orderByClauses)
        .limit(limit)
        .offset(offset);

    const initialOffset = (requestedPage - 1) * limit;

    // Concurrently fetch count and saved job rows in a single database round-trip
    const [countResult, initialRows] = await Promise.all([
      executeCount(),
      fetchSavedJobRows(initialOffset),
    ]);

    const total = countResult[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const actualPage = total > 0 ? Math.min(requestedPage, totalPages) : 1;

    let rawJobs = initialRows;
    if (actualPage !== requestedPage && total > 0 && rawJobs.length === 0) {
      rawJobs = await fetchSavedJobRows((actualPage - 1) * limit);
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
    console.error("Error fetching saved jobs:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
