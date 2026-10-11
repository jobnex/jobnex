import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { matchUserJobs, UserPreferencesInput, MatchedJobRecord } from "@/lib/db/job-preference-matching";
import { formatSalary, mapDBJobTypeToUI, formatJobLocation } from "@/lib/job-utils";
import { Job } from "@/types";

export const dynamic = "force-dynamic";
function boundedLimit(value: unknown) {
  const number = Number(value ?? 24);
  return Number.isFinite(number) ? Math.min(50, Math.max(1, Math.floor(number))) : 24;
}

function mapRecordToUIJob(row: MatchedJobRecord): Job & { similarityScore?: number; tierRank?: number } {
  const displayLocation = formatJobLocation(row.location, row.countryName);

  return {
    id: row.id,
    jobRoleTitle: row.jobRoleTitle,
    company: row.companyName || "Unknown Company",
    type: mapDBJobTypeToUI(row.employmentType),
    location: displayLocation,
    salary: formatSalary(row.salaryMin, row.salaryMax, row.currency),
    jobDescription: row.jobDescription,
    categories: [],
    postedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : new Date().toISOString(),
    isRemote: row.workModel === "remote",
    isHybrid: row.workModel === "hybrid",
    workModel: row.workModel ?? undefined,
    visaSponsorship: row.visaSponsorship ?? undefined,
    experienceRequired: row.experienceRequired ?? undefined,
    similarityScore: row.similarityScore,
    tierRank: row.tierRank,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = await getCurrentUser().catch(() => null);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const cursor = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");
    const limit = boundedLimit(limitParam);

    // Optional query overrides
    const country = searchParams.get("country");
    const seniority = searchParams.get("seniority");
    const domainsParam = searchParams.get("domains");
    const domains = domainsParam ? domainsParam.split(",").map(d => d.trim()).filter(Boolean) : null;
    const skillsParam = searchParams.get("skills");
    const skills = skillsParam ? skillsParam.split(",").map(s => s.trim()).filter(Boolean) : null;
    const citiesParam = searchParams.get("cities");
    const cities = citiesParam ? citiesParam.split(",").map(c => c.trim()).filter(Boolean) : null;
    const jobTypesParam = searchParams.get("jobTypes");
    const jobTypes = jobTypesParam ? jobTypesParam.split(",").map(t => t.trim()).filter(Boolean) : null;
    const modeParam = searchParams.get("mode");
    const mode = (modeParam === "strict" || modeParam === "balanced" || modeParam === "broad") 
      ? modeParam 
      : undefined;

    let preferences: UserPreferencesInput | null = null;
    if (country || seniority || domains || skills || cities || jobTypes || mode) {
      preferences = {
        country: country || null,
        seniority: seniority || null,
        domains: domains || null,
        skills: skills || null,
        cities: cities || null,
        jobTypes: jobTypes || null,
        mode: mode || null,
      };
    }

    const result = await matchUserJobs({
      userId,
      preferences,
      cursor,
      limit,
      mode,
    });

    const mappedJobs = result.jobs.map(mapRecordToUIJob);

    return NextResponse.json({
      jobs: mappedJobs,
      nextCursor: result.nextCursor,
      nextKeyset: result.nextKeyset,
      hasMore: result.hasMore,
      executionTimeMs: result.executionTimeMs,
    });
  } catch (error) {
    console.error("Failed to fetch matched jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch matched jobs" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser().catch(() => null);
    const body = await request.json().catch(() => ({}));

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const preferences: UserPreferencesInput = body.preferences || body;
    const cursor = body.cursor || null;
    const limit = boundedLimit(body.limit);
    const rawMode = body.mode !== undefined ? body.mode : preferences?.mode;
    const mode = (rawMode === "strict" || rawMode === "balanced" || rawMode === "broad")
      ? rawMode
      : (rawMode !== undefined && rawMode !== null ? "balanced" : undefined);

    const result = await matchUserJobs({
      userId,
      preferences,
      cursor,
      limit,
      mode,
    });

    const mappedJobs = result.jobs.map(mapRecordToUIJob);

    return NextResponse.json({
      jobs: mappedJobs,
      nextCursor: result.nextCursor,
      nextKeyset: result.nextKeyset,
      hasMore: result.hasMore,
      executionTimeMs: result.executionTimeMs,
    });
  } catch (error) {
    console.error("Failed to match jobs by preferences:", error);
    return NextResponse.json(
      { error: "Failed to match jobs by preferences" },
      { status: 500 }
    );
  }
}
