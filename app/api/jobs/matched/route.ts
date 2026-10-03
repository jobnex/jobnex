import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { matchUserJobs, UserPreferencesInput, MatchedJobRecord } from "@/lib/db/job-preference-matching";
import { formatSalary, mapDBJobTypeToUI } from "@/lib/job-utils";
import { Job } from "@/types";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeStringList(param: string | null, maxItems = 25, maxLen = 100): string[] | null {
  if (!param) return null;
  const items = param
    .split(",")
    .map(s => s.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
  return items.length > 0 ? items : null;
}

function sanitizeText(param: string | null, maxLen = 100): string | null {
  if (!param) return null;
  const clean = param.trim().slice(0, maxLen);
  return clean.length > 0 ? clean : null;
}

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

    // OWASP API1:2023 - Broken Object Level Authorization (IDOR) Prevention:
    // If authenticated, lock candidate to their own identity.
    const authenticatedUserId = user?.id && UUID_REGEX.test(user.id) ? user.id : null;
    const requestedUserId = searchParams.get("userId");
    const validRequestedUserId = requestedUserId && UUID_REGEX.test(requestedUserId) ? requestedUserId : null;
    const userId = authenticatedUserId ? authenticatedUserId : validRequestedUserId;

    // OWASP API4:2023 - Unrestricted Resource Consumption: Clamp limit to [1, 50]
    const rawLimit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 24;
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(1, rawLimit), 50) : 24;

    const cursorParam = searchParams.get("cursor");
    const cursor = cursorParam && cursorParam.length <= 512 ? cursorParam : null;

    // Sanitize query overrides against JSON-bombs and excessive string lengths
    const country = sanitizeText(searchParams.get("country"), 60);
    const seniority = sanitizeText(searchParams.get("seniority"), 50);
    const domains = sanitizeStringList(searchParams.get("domains"));
    const skills = sanitizeStringList(searchParams.get("skills"));
    const cities = sanitizeStringList(searchParams.get("cities"));
    const jobTypes = sanitizeStringList(searchParams.get("jobTypes"));
    const rawMode = searchParams.get("mode");
    const mode = (rawMode === "strict" || rawMode === "balanced" || rawMode === "broad") 
      ? rawMode 
      : undefined;

    // Forward directly to GCP Cloud Run microservice if configured
    const cloudRunUrl = process.env.CLOUDRUN_MATCHING_URL;
    if (cloudRunUrl) {
      try {
        const targetUrl = new URL(`${cloudRunUrl}/api/jobs/matched`);
        if (userId) targetUrl.searchParams.set("userId", userId);
        if (cursor) targetUrl.searchParams.set("cursor", cursor);
        targetUrl.searchParams.set("limit", limit.toString());
        if (mode) targetUrl.searchParams.set("mode", mode);
        if (country) targetUrl.searchParams.set("country", country);
        if (seniority) targetUrl.searchParams.set("seniority", seniority);
        if (domains) targetUrl.searchParams.set("domains", domains.join(","));
        if (skills) targetUrl.searchParams.set("skills", skills.join(","));
        if (cities) targetUrl.searchParams.set("cities", cities.join(","));
        if (jobTypes) targetUrl.searchParams.set("jobTypes", jobTypes.join(","));

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (process.env.INTERNAL_SERVICE_KEY) {
          headers["x-internal-secret"] = process.env.INTERNAL_SERVICE_KEY;
        }

        const cloudRes = await fetch(targetUrl.toString(), {
          headers,
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
    // OWASP API10:2023 - Prevent internal server/database error leakage in production
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

    // OWASP API1:2023 - IDOR Prevention
    const authenticatedUserId = user?.id && UUID_REGEX.test(user.id) ? user.id : null;
    const requestedUserId = body.userId;
    const validRequestedUserId = requestedUserId && UUID_REGEX.test(requestedUserId) ? requestedUserId : null;
    const userId = authenticatedUserId ? authenticatedUserId : validRequestedUserId;

    const rawLimit = typeof body.limit === "number" ? body.limit : 24;
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(1, rawLimit), 50) : 24;

    const cursor = typeof body.cursor === "string" && body.cursor.length <= 512 ? body.cursor : null;

    const rawPreferences = body.preferences || body;
    const preferences: UserPreferencesInput = {};
    if (rawPreferences && typeof rawPreferences === "object") {
      if (rawPreferences.country) preferences.country = sanitizeText(rawPreferences.country, 60);
      if (rawPreferences.seniority) preferences.seniority = sanitizeText(rawPreferences.seniority, 50);
      if (Array.isArray(rawPreferences.domains)) {
        preferences.domains = rawPreferences.domains.map((d: unknown) => String(d).slice(0, 100)).slice(0, 25);
      }
      if (Array.isArray(rawPreferences.skills)) {
        preferences.skills = rawPreferences.skills.map((s: unknown) => String(s).slice(0, 100)).slice(0, 25);
      }
      if (Array.isArray(rawPreferences.cities)) {
        preferences.cities = rawPreferences.cities.map((c: unknown) => String(c).slice(0, 100)).slice(0, 25);
      }
      if (Array.isArray(rawPreferences.jobTypes)) {
        preferences.jobTypes = rawPreferences.jobTypes.map((t: unknown) => String(t).slice(0, 100)).slice(0, 25);
      }
    }

    const rawMode = body.mode !== undefined ? body.mode : preferences?.mode;
    const mode = (rawMode === "strict" || rawMode === "balanced" || rawMode === "broad")
      ? rawMode
      : (rawMode !== undefined && rawMode !== null ? "balanced" : undefined);

    // Forward directly to GCP Cloud Run microservice if configured
    const cloudRunUrl = process.env.CLOUDRUN_MATCHING_URL;
    if (cloudRunUrl) {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (process.env.INTERNAL_SERVICE_KEY) {
          headers["x-internal-secret"] = process.env.INTERNAL_SERVICE_KEY;
        }

        const cloudRes = await fetch(`${cloudRunUrl}/api/jobs/matched`, {
          method: "POST",
          headers,
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
      { error: "Failed to match jobs by preferences" },
      { status: 500 }
    );
  }
}
