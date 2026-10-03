import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { matchUserJobs, UserPreferencesInput, MatchedJobRecord } from "@/lib/db/job-preference-matching";
import { formatSalary, mapDBJobTypeToUI } from "@/lib/job-utils";
import { Job } from "@/types";

export const dynamic = "force-dynamic";

function mapRecordToUIJob(row: MatchedJobRecord): Job & { similarityScore?: number; tierRank?: number } {
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

    const userId = searchParams.get("userId") || user?.id || null;
    const cursor = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 24;

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

    // Forward directly to GCP Cloud Run microservice if configured
    const cloudRunUrl = process.env.CLOUDRUN_MATCHING_URL;
    if (cloudRunUrl) {
      try {
        const targetUrl = new URL(`${cloudRunUrl}/api/jobs/matched`);
        if (userId) targetUrl.searchParams.set("userId", userId);
        if (cursor) targetUrl.searchParams.set("cursor", cursor);
        if (limitParam) targetUrl.searchParams.set("limit", limitParam);
        if (mode) targetUrl.searchParams.set("mode", mode);
        if (country) targetUrl.searchParams.set("country", country);
        if (seniority) targetUrl.searchParams.set("seniority", seniority);
        if (domainsParam) targetUrl.searchParams.set("domains", domainsParam);
        if (skillsParam) targetUrl.searchParams.set("skills", skillsParam);
        if (citiesParam) targetUrl.searchParams.set("cities", citiesParam);
        if (jobTypesParam) targetUrl.searchParams.set("jobTypes", jobTypesParam);

        const cloudRes = await fetch(targetUrl.toString(), {
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (cloudRes.ok) {
          const cloudData = await cloudRes.json();
          return NextResponse.json(cloudData);
        }
      } catch (err) {
        console.warn("Cloud Run proxy forward failed, using local DB fallback:", err);
      }
    }

    const preferences: UserPreferencesInput = {};
    if (country) preferences.country = country;
    if (seniority) preferences.seniority = seniority;
    if (domains) preferences.domains = domains;
    if (skills) preferences.skills = skills;
    if (cities) preferences.cities = cities;
    if (jobTypes) preferences.jobTypes = jobTypes;
    if (mode) preferences.mode = mode;

    const result = await matchUserJobs({
      userId,
      preferences: Object.keys(preferences).length > 0 ? preferences : null,
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
  } catch (error: any) {
    console.error("Failed to fetch matched jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch matched jobs", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser().catch(() => null);
    const body = await request.json().catch(() => ({}));

    const userId = body.userId || user?.id || null;
    const rawPreferences = body.preferences || body;
    const preferences: UserPreferencesInput = {};
    if (rawPreferences && typeof rawPreferences === "object") {
      for (const [k, v] of Object.entries(rawPreferences)) {
        if (v !== null && v !== undefined) {
          (preferences as any)[k] = v;
        }
      }
    }
    const cursor = body.cursor || null;
    const limit = typeof body.limit === "number" ? body.limit : 24;
    const rawMode = body.mode !== undefined ? body.mode : preferences?.mode;
    const mode = (rawMode === "strict" || rawMode === "balanced" || rawMode === "broad")
      ? rawMode
      : (rawMode !== undefined && rawMode !== null ? "balanced" : undefined);

    // Forward directly to GCP Cloud Run microservice if configured
    const cloudRunUrl = process.env.CLOUDRUN_MATCHING_URL;
    if (cloudRunUrl) {
      try {
        const cloudRes = await fetch(`${cloudRunUrl}/api/jobs/matched`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            preferences: Object.keys(preferences).length > 0 ? preferences : undefined,
            cursor,
            limit,
            mode,
          }),
          cache: "no-store",
        });

        if (cloudRes.ok) {
          return NextResponse.json(await cloudRes.json());
        }
      } catch (err) {
        console.warn("Cloud Run POST proxy failed, using local DB fallback:", err);
      }
    }

    const result = await matchUserJobs({
      userId,
      preferences: Object.keys(preferences).length > 0 ? preferences : null,
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
  } catch (error: any) {
    console.error("Failed to match jobs by preferences:", error);
    return NextResponse.json(
      { error: "Failed to match jobs by preferences", details: error.message },
      { status: 500 }
    );
  }
}
