import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getMatchedJobs, JobMatchingParams, MatchingMode } from "@/lib/db/job-matching";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeStringList(param: string | null, maxItems = 25, maxLen = 100): string[] | undefined {
  if (!param) return undefined;
  const items = param
    .split(",")
    .map((s) => s.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
  return items.length > 0 ? items : undefined;
}

function sanitizeText(param: string | null, maxLen = 100): string | undefined {
  if (!param) return undefined;
  const clean = param.trim().slice(0, maxLen);
  return clean.length > 0 ? clean : undefined;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = await getCurrentUser().catch(() => null);

    // OWASP API1:2023 - Lock candidate ID strictly to verified session
    const authenticatedUserId = user?.id && UUID_REGEX.test(user.id) ? user.id : null;
    const userId = authenticatedUserId;
    if (!userId) {
      return NextResponse.json({ error: "Sign in to view your curated jobs" }, { status: 401 });
    }

    // OWASP API4:2023 - Resource Consumption Clamping
    const rawPage = parseInt(searchParams.get("page") || "1", 10);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

    const rawLimit = parseInt(searchParams.get("limit") || "24", 10);
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(1, rawLimit), 50) : 24;

    const rawKeyword = searchParams.get("keyword") || "";
    const keyword = rawKeyword.slice(0, 100);

    const rawTab = searchParams.get("tab");
    const tab: "jobs" | "requested" = rawTab === "requested" ? "requested" : "jobs";

    const rawMode = searchParams.get("mode");
    const mode: MatchingMode = rawMode === "strict" || rawMode === "broad" ? rawMode : "balanced";

    const rawPostedWithin = searchParams.get("postedWithin");
    const postedWithin = rawPostedWithin === "24h" ? "24h" : rawPostedWithin === "7d" ? "7d" : "all";

    const rawSort = searchParams.get("sort");
    const sort = rawSort === "newest" ? "newest" : "match";

    // Optional query overrides
    const country = sanitizeText(searchParams.get("country"), 60);
    const seniority = sanitizeText(searchParams.get("seniority"), 50);
    const domains = sanitizeStringList(searchParams.get("domains"));
    const skills = sanitizeStringList(searchParams.get("skills"));
    const cities = sanitizeStringList(searchParams.get("cities"));
    const jobTypes = sanitizeStringList(searchParams.get("jobTypes"));

    const matchingParams: JobMatchingParams = {
      userId,
      page,
      limit,
      keyword,
      tab,
      mode,
      postedWithin,
      sort,
      country,
      seniority,
      domains,
      skills,
      cities,
      jobTypes,
    };

    const result = await getMatchedJobs(matchingParams);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch matched jobs:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch matched jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser().catch(() => null);
    const body = await request.json().catch(() => ({}));

    // OWASP API1:2023 - Lock candidate ID strictly to verified session
    const authenticatedUserId = user?.id && UUID_REGEX.test(user.id) ? user.id : null;
    const userId = authenticatedUserId;
    if (!userId) {
      return NextResponse.json({ error: "Sign in to view your curated jobs" }, { status: 401 });
    }

    const rawPage = typeof body.page === "number" ? body.page : 1;
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

    const rawLimit = typeof body.limit === "number" ? body.limit : 24;
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(1, rawLimit), 50) : 24;

    const keyword = typeof body.keyword === "string" ? body.keyword.slice(0, 100) : "";
    const tab = body.tab === "requested" ? "requested" : "jobs";
    const mode: MatchingMode = body.mode === "strict" || body.mode === "broad" ? body.mode : "balanced";

    const postedWithin = body.postedWithin === "24h" ? "24h" : body.postedWithin === "7d" ? "7d" : "all";
    const sort = body.sort === "newest" ? "newest" : "match";

    const preferences = body.preferences || body;

    const matchingParams: JobMatchingParams = {
      userId,
      page,
      limit,
      keyword,
      tab,
      mode,
      postedWithin,
      sort,
      country: preferences.country ? sanitizeText(preferences.country, 60) : undefined,
      seniority: preferences.seniority ? sanitizeText(preferences.seniority, 50) : undefined,
      domains: Array.isArray(preferences.domains) ? preferences.domains.slice(0, 25).map(String) : undefined,
      skills: Array.isArray(preferences.skills) ? preferences.skills.slice(0, 25).map(String) : undefined,
      cities: Array.isArray(preferences.cities) ? preferences.cities.slice(0, 25).map(String) : undefined,
      jobTypes: Array.isArray(preferences.jobTypes) ? preferences.jobTypes.slice(0, 25).map(String) : undefined,
    };

    const result = await getMatchedJobs(matchingParams);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to match jobs by preferences:", error);
    const message = error instanceof Error ? error.message : "Failed to match jobs by preferences";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
