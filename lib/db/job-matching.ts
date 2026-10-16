import { db, pool } from "@/lib/db";
import { jobs, countries, userJobPreferences, userJobResumes } from "@/lib/db/schema";
import { eq, and, desc, isNotNull, or, inArray, sql, SQL, count } from "drizzle-orm";
import { mapDbRowToJob, mapUIJobTypeToDB, DEFAULT_PAGE_SIZE } from "@/lib/job-utils";
import { Job, JobsResponse } from "@/types";

export type MatchingMode = "strict" | "balanced" | "broad";
export type PostedWithin = "24h" | "7d" | "all";
export type CuratedSort = "newest" | "match";

export interface JobMatchingParams {
  userId?: string | null;
  page?: number;
  limit?: number;
  keyword?: string;
  tab?: "jobs" | "requested";
  domains?: string[];
  skills?: string[];
  country?: string;
  cities?: string[];
  seniority?: string;
  jobTypes?: string[];
  mode?: MatchingMode;
  postedWithin?: PostedWithin;
  sort?: CuratedSort;
}

export interface MatchedJobsResult extends JobsResponse {
  requestedJobIds: string[];
  requestedCount: number;
  jobsCount: number;
  executionTimeMs: number;
}

// In-memory country cache to avoid repeated queries to countries table
const COUNTRY_CACHE = new Map<string, string>();

function escapeRegex(str: string): string {
  return str.replace(/[\\^$.|?*+()[\]{}]/g, "\\$&");
}

const CANONICAL_ROLE_PATTERNS: Array<{ match: RegExp; pattern: string }> = [
  {
    match: /^(swe|sde|software dev|software developer|software engineer|software development engineer)$/i,
    pattern: "(?<![\\w])(SWE|SDE|Software\\s+Dev(?:elopment)?(?:\\s+Engineer)?|Software\\s+Developer|Software\\s+Engineer)(?![\\w])",
  },
  {
    match: /^(frontend|front end|front-end|frontend developer|front end developer|front-end developer|frontend engineer|front end engineer|front-end engineer|frontend dev|front end dev|front-end dev)$/i,
    pattern: "(?<![\\w])(Front[- ]?End|Frontend)(?![\\w])",
  },
  {
    match: /^(backend|back end|back-end|backend developer|back end developer|back-end developer|backend engineer|back end engineer|back-end engineer|backend dev|back end dev|back-end dev)$/i,
    pattern: "(?<![\\w])(Back[- ]?End|Backend)(?![\\w])",
  },
  {
    match: /^(fullstack|full stack|full-stack|fullstack developer|full stack developer|full-stack developer|fullstack engineer|full stack engineer|full-stack engineer|fullstack dev|full stack dev|full-stack dev)$/i,
    pattern: "(?<![\\w])(Full[- ]?Stack|Fullstack)(?![\\w])",
  },
  {
    match: /^(devops|devops engineer|devops developer|sre|sre engineer|site reliability engineer|site reliability)$/i,
    pattern: "(?<![\\w])(DevOps(?:\\s+Engineer)?|SRE(?:\\s+Engineer)?|Site\\s+Reliability(?:\\s+Engineer)?)(?![\\w])",
  },
  {
    match: /^(ai engineer|ai developer|ml engineer|machine learning engineer)$/i,
    pattern: "(?<![\\w])((AI|ML|Machine\\s+Learning|Artificial\\s+Intelligence)\\s+(?:\\w+\\s+)?(?:Engineer(?:ing)?|Developer))(?![\\w])",
  },
  {
    match: /^(ml|machine learning|machine learning engineer|ml engineer|ai engineer|ai developer|artificial intelligence)$/i,
    pattern: "(?<![\\w])(ML(?:\\s+Engineer)?|Machine\\s+Learning(?:\\s+Engineer)?|AI(?:\\s+Engineer)?|Artificial\\s+Intelligence)(?![\\w])",
  },
  {
    match: /^(data engineer|data engineering)$/i,
    pattern: "(?<![\\w])(Data\\s+Engineer(?:ing)?)(?![\\w])",
  },
  {
    match: /^(data scientist|data science)$/i,
    pattern: "(?<![\\w])(Data\\s+Scientist|Data\\s+Science)(?![\\w])",
  },
  {
    match: /^(data analyst|data analytics)$/i,
    pattern: "(?<![\\w])(Data\\s+Analyst|Data\\s+Analytics)(?![\\w])",
  },
  {
    match: /^(cloud engineer|cloud architect)$/i,
    pattern: "(?<![\\w])(Cloud\\s+(?:Engineer|Architect))(?![\\w])",
  },
];

function resolveTagPattern(tag: string): string {
  const clean = tag.replace(/^[\[\(\{]+|[\]\)\}]+$/g, "").trim();
  if (!clean) return "";

  for (const entry of CANONICAL_ROLE_PATTERNS) {
    if (entry.match.test(clean)) {
      return entry.pattern;
    }
  }

  // Single letter tag like 'C'
  if (clean.length === 1 && /^[A-Za-z]$/.test(clean)) {
    return `(?<![\\w&]|[A-Za-z]/)(${clean})(?![\\w&+#]|-\\d|\\.\\s|\\s*&\\s*[A-Za-z])`;
  }

  return `(?<![\\w])(${escapeRegex(clean)})(?![\\w])`;
}

function buildTokenPairPattern(tag: string): string | null {
  const clean = tag.replace(/^[\[\(\{]+|[\]\)\}]+$/g, "").trim();
  if (!clean || !/[\s,/-]/.test(clean)) return null;

  const stopWords = new Set(["and", "or", "of", "in", "the", "for", "to", "with", "a", "an"]);
  const tokens = clean
    .split(/[\s,/-]+/)
    .map((w) => w.trim().replace(/^[\[\(\{]+|[\]\)\}]+$/g, ""))
    .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()))
    .slice(0, 4);

  if (tokens.length < 2) return null;

  const pairs: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < tokens.length; j++) {
      if (i !== j) {
        pairs.push(
          `(?<![\\w])(${escapeRegex(tokens[i])}(\\s+\\w+)?\\s+${escapeRegex(tokens[j])})(?![\\w])`
        );
      }
    }
  }

  return pairs.length > 0 ? pairs.join("|") : null;
}

const CITY_PATTERNS: Record<string, string> = {
  nyc: "(?<![\\w])(New York|NYC)(?![\\w])",
  "new york": "(?<![\\w])(New York|NYC)(?![\\w])",
  "new york city": "(?<![\\w])(New York|NYC)(?![\\w])",
  sf: "(?<![\\w])(San Francisco|SF|Bay Area|Silicon Valley|San Jose|Oakland)(?![\\w])",
  "san francisco": "(?<![\\w])(San Francisco|SF|Bay Area|Silicon Valley|San Jose|Oakland)(?![\\w])",
  "bay area": "(?<![\\w])(San Francisco|SF|Bay Area|Silicon Valley|San Jose|Oakland)(?![\\w])",
  "silicon valley": "(?<![\\w])(San Francisco|SF|Bay Area|Silicon Valley|San Jose|Oakland)(?![\\w])",
  la: "(?<![\\w])(Los Angeles|LA)(?![\\w])",
  "los angeles": "(?<![\\w])(Los Angeles|LA)(?![\\w])",
  dc: "(?<![\\w])(Washington|DC)(?![\\w])",
  washington: "(?<![\\w])(Washington|DC)(?![\\w])",
  "washington dc": "(?<![\\w])(Washington|DC)(?![\\w])",
  seattle: "(?<![\\w])(Seattle)(?![\\w])",
  austin: "(?<![\\w])(Austin)(?![\\w])",
  boston: "(?<![\\w])(Boston|Cambridge)(?![\\w])",
  chicago: "(?<![\\w])(Chicago)(?![\\w])",
  london: "(?<![\\w])(London)(?![\\w])",
  bengaluru: "(?<![\\w])(Bengaluru|Bangalore)(?![\\w])",
};

async function resolveCountryId(countryInput?: string | null): Promise<string | null> {
  if (!countryInput || !countryInput.trim()) return null;
  const key = countryInput.trim().toLowerCase();

  if (COUNTRY_CACHE.has(key)) {
    return COUNTRY_CACHE.get(key) || null;
  }

  try {
    const allCountries = await db.select({ id: countries.id, code: countries.code, name: countries.name }).from(countries);
    for (const c of allCountries) {
      if (c.code) COUNTRY_CACHE.set(c.code.toLowerCase(), c.id);
      if (c.name) COUNTRY_CACHE.set(c.name.toLowerCase(), c.id);
    }
    return COUNTRY_CACHE.get(key) || null;
  } catch (error) {
    console.error("Error resolving country ID cache:", error);
    return null;
  }
}

/**
 * Clean Drizzle-native Job Matching Engine
 * Implements the full 3-tier algorithm, seniority isolation, location flexibility,
 * and page-numbered pagination inspired by the Job Board.
 */
export async function getMatchedJobs(params: JobMatchingParams): Promise<MatchedJobsResult> {
  const start = performance.now();
  const {
    userId,
    page: requestedPage = 1,
    limit: rawLimit = DEFAULT_PAGE_SIZE,
    keyword: rawKeyword = "",
    tab = "jobs",
    mode = "balanced",
  } = params;

  const page = Number.isInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
  const limit = Math.min(Math.max(1, rawLimit), 50);
  const offset = (page - 1) * limit;
  const keyword = rawKeyword.trim().toLowerCase();

  // 1. Fetch user's stored preferences if userId is provided
  let prefDomains: string[] = params.domains || [];
  let prefSkills: string[] = params.skills || [];
  let prefSeniority: string | null = params.seniority || null;
  let prefCountry: string | null = params.country || null;
  let prefCities: string[] = params.cities || [];
  let prefJobTypes: string[] = params.jobTypes || [];
  let requestedJobIds: string[] = [];
  const requestStates = new Map<string, string>();

  if (userId) {
    try {
      const [userPrefRow, userResumes, currentRequests] = await Promise.all([
        db
          .select({ preferences: userJobPreferences.preferences })
          .from(userJobPreferences)
          .where(eq(userJobPreferences.userId, userId))
          .limit(1),
        db
          .select({ jobId: userJobResumes.jobId })
          .from(userJobResumes)
          .where(eq(userJobResumes.userId, userId)),
        pool.query<{ job_id: string; status: string }>(`SELECT DISTINCT ON (job_id) job_id,status
          FROM resume_generation_requests WHERE user_id=$1
          ORDER BY job_id,created_at DESC,id DESC`, [userId]),
      ]);

      currentRequests.rows.forEach(row => requestStates.set(row.job_id, row.status));
      requestedJobIds = [...new Set([...userResumes.map((r) => r.jobId), ...requestStates.keys()])];

      const dbPrefs = (userPrefRow?.[0]?.preferences || {}) as Record<string, unknown>;
      const lastConfirmed = (dbPrefs.lastConfirmedPreferences || {}) as Record<string, unknown>;

      // If explicit override wasn't passed in params, use saved preferences
      if (prefDomains.length === 0) {
        prefDomains = Array.isArray(dbPrefs.domains) && dbPrefs.domains.length > 0
          ? (dbPrefs.domains as string[])
          : (Array.isArray(lastConfirmed.domains) ? (lastConfirmed.domains as string[]) : []);
      }
      if (prefSkills.length === 0) {
        prefSkills = Array.isArray(dbPrefs.skills) && dbPrefs.skills.length > 0
          ? (dbPrefs.skills as string[])
          : (Array.isArray(lastConfirmed.skills) ? (lastConfirmed.skills as string[]) : []);
      }
      if (!prefSeniority) {
        prefSeniority = (dbPrefs.seniority as string | undefined) || (lastConfirmed.seniority as string | undefined) || null;
      }
      if (!prefCountry) {
        prefCountry = (dbPrefs.country as string | undefined) || (lastConfirmed.country as string | undefined) || null;
      }
      if (prefCities.length === 0) {
        prefCities = Array.isArray(dbPrefs.cities) && dbPrefs.cities.length > 0
          ? (dbPrefs.cities as string[])
          : (Array.isArray(lastConfirmed.cities) ? (lastConfirmed.cities as string[]) : []);
      }
      if (prefJobTypes.length === 0) {
        prefJobTypes = Array.isArray(dbPrefs.jobTypes) && dbPrefs.jobTypes.length > 0
          ? (dbPrefs.jobTypes as string[])
          : (Array.isArray(lastConfirmed.jobTypes) ? (lastConfirmed.jobTypes as string[]) : []);
      }
    } catch (e) {
      console.error("Error reading candidate preferences:", e);
      throw new Error("Could not load your job preferences. Please retry.");
    }
  }

  // 3. Build 'Jobs' (Curated Matched) Query Conditions
  const whereClauses: SQL[] = [
    eq(jobs.status, "published"),
    isNotNull(jobs.publishedAt),
  ];

  // Share one rolling UTC window across the count and page queries.
  const postedWithin = params.postedWithin === "7d" || params.postedWithin === "all"
    ? params.postedWithin : "24h";
  const asOf = new Date();
  // Importers refresh published_at on existing rows. Keep the earliest known date.
  const firstSeen = sql<Date>`LEAST(${jobs.publishedAt}, ${jobs.createdAt})`.mapWith(jobs.publishedAt);
  whereClauses.push(sql`${jobs.publishedAt} <= ${asOf.toISOString()}::timestamptz`);
  whereClauses.push(sql`${firstSeen} <= ${asOf.toISOString()}::timestamptz`);
  if (postedWithin !== "all") {
    const hours = postedWithin === "7d" ? 168 : 24;
    const since = new Date(asOf.getTime() - hours * 60 * 60 * 1000);
    whereClauses.push(sql`${firstSeen} >= ${since.toISOString()}::timestamptz`);
  }

  // A. Search bar keyword match
  if (keyword) {
    whereClauses.push(
      or(
        sql`${jobs.jobRoleTitle} ILIKE ${'%' + keyword + '%'}`,
        sql`${jobs.companyName} ILIKE ${'%' + keyword + '%'}`
      )!
    );
  }

  // B. Location / Country / City filter
  const resolvedCountryId = await resolveCountryId(prefCountry);
  if (resolvedCountryId) {
    whereClauses.push(
      or(
        eq(jobs.countryId, resolvedCountryId),
        sql`${jobs.location} ~* ${'\\m' + escapeRegex(prefCountry!) + '\\M'}`
      )!
    );
  } else if (prefCountry && prefCountry.trim()) {
    whereClauses.push(
      sql`${jobs.location} ~* ${'\\m' + escapeRegex(prefCountry.trim()) + '\\M'}`
    );
  }

  if (prefCities.length > 0) {
    const cityRegexParts: string[] = [];
    for (const city of prefCities) {
      const cleanCity = city.split(",")[0].trim().toLowerCase();
      if (!cleanCity) continue;
      if (CITY_PATTERNS[cleanCity]) {
        cityRegexParts.push(CITY_PATTERNS[cleanCity]);
      } else {
        const simpleName = cleanCity.split(",")[0].trim();
        cityRegexParts.push(`(?<![\\w])(${escapeRegex(simpleName)})(?![\\w])`);
      }
    }

    if (cityRegexParts.length > 0) {
      const combinedCityRegex = cityRegexParts.join("|");
      whereClauses.push(
        or(
          eq(jobs.workModel, "remote"),
          sql`${jobs.location} ~* '\\mremote\\M'`,
          sql`${jobs.location} ~* ${combinedCityRegex}`
        )!
      );
    }
  }

  // C. Seniority Isolation
  if (prefSeniority) {
    const cleanSeniority = prefSeniority.trim().toLowerCase();
    if (["entry", "entry-level", "entry_level", "fresher", "junior", "jr", "intern", "associate", "graduate"].includes(cleanSeniority)) {
      whereClauses.push(
        and(
          or(sql`${jobs.experienceRequired} IS NULL`, sql`${jobs.experienceRequired} <= 2`)!,
          sql`NOT (${jobs.jobRoleTitle} ~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|manager|mid[- ]?level|intermediate)\\M')`,
          or(
            sql`${jobs.jobRoleTitle} ~* '\\m(entry[- ]?level|fresher|junior|associate|intern|internship|trainee|apprentice|grad|graduate)\\M'`,
            sql`${jobs.experienceRequired} <= 2`,
            and(sql`${jobs.experienceRequired} IS NULL`, sql`NOT (${jobs.jobRoleTitle} ~* '\\m(manager|lead|staff|principal)\\M')`)!
          )!
        )!
      );
    } else if (["senior", "sr", "lead", "staff", "principal", "director", "head", "vp"].includes(cleanSeniority)) {
      whereClauses.push(
        and(
          or(sql`${jobs.experienceRequired} IS NULL`, sql`${jobs.experienceRequired} >= 3`)!,
          sql`NOT (${jobs.jobRoleTitle} ~* '\\m(entry[- ]?level|fresher|junior|intern|internship|trainee)\\M')`,
          or(
            sql`${jobs.experienceRequired} >= 5`,
            sql`${jobs.jobRoleTitle} ~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|architect)\\M'`
          )!
        )!
      );
    } else if (["mid", "mid-level", "mid_level", "intermediate"].includes(cleanSeniority)) {
      whereClauses.push(
        and(
          or(sql`${jobs.experienceRequired} IS NULL`, sql`${jobs.experienceRequired} BETWEEN 1 AND 6`)!,
          sql`NOT (${jobs.jobRoleTitle} ~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|manager|distinguished|chief)\\M')`,
          sql`NOT (${jobs.jobRoleTitle} ~* '\\m(entry[- ]?level|fresher|junior|jr\\.?|intern|internship|trainee)\\M')`,
          or(
            sql`${jobs.jobRoleTitle} ~* '\\m(mid[- ]?level|intermediate|experienced|ii|iii)\\M'`,
            sql`${jobs.experienceRequired} BETWEEN 2 AND 5`,
            sql`${jobs.experienceRequired} IS NULL`
          )!
        )!
      );
    }
  }

  // D. Job Types Filter
  if (prefJobTypes.length > 0) {
    const dbJobTypes = prefJobTypes.map((t) => mapUIJobTypeToDB(t));
    whereClauses.push(inArray(jobs.employmentType, dbJobTypes));
  }

  // E. 3-Tier Multi-Role Matching Logic
  const primaryDomainPatterns = prefDomains.map(resolveTagPattern).filter(Boolean);
  const secondarySkillPatterns = prefSkills.map(resolveTagPattern).filter(Boolean);
  const tokenPairPatterns = prefDomains.map(buildTokenPairPattern).filter(Boolean) as string[];

  const hasCriteria = primaryDomainPatterns.length > 0 || secondarySkillPatterns.length > 0;

  let tierRankSql: SQL<number> = sql`1`;
  let similarityScoreSql: SQL<number> = sql`1.0`;

  if (hasCriteria) {
    // A skill in an unrelated title must not override the candidate's desired roles.
    const allTier1Patterns = primaryDomainPatterns.length > 0
      ? primaryDomainPatterns : secondarySkillPatterns;
    const t1Regex = allTier1Patterns.join("|");
    const t2Regex = tokenPairPatterns.length > 0 ? tokenPairPatterns.join("|") : null;

    // Build the Tier Match condition based on candidate mode (strict / balanced / broad)
    const tierConditions: SQL[] = [sql`${jobs.jobRoleTitle} ~* ${t1Regex}`];
    if (mode === "balanced" || mode === "broad") {
      if (t2Regex) {
        tierConditions.push(sql`${jobs.jobRoleTitle} ~* ${t2Regex}`);
      }
    }
    if (mode === "broad") {
      for (const d of prefDomains) {
        tierConditions.push(sql`${jobs.jobRoleTitle} % ${d}`);
      }
    }

    whereClauses.push(or(...tierConditions)!);

    // Compute Tier Rank (3 = Tier 1, 2 = Tier 2, 1 = Tier 3)
    if (t2Regex) {
      tierRankSql = sql<number>`CASE
        WHEN ${jobs.jobRoleTitle} ~* ${t1Regex} THEN 3
        WHEN ${jobs.jobRoleTitle} ~* ${t2Regex} THEN 2
        ELSE 1
      END`;
    } else {
      tierRankSql = sql<number>`CASE
        WHEN ${jobs.jobRoleTitle} ~* ${t1Regex} THEN 3
        ELSE 1
      END`;
    }

    // Role matches dominate; bounded skill overlap includes the actual description.
    const scoreClauses: SQL[] = [];
    for (const pat of primaryDomainPatterns) {
      scoreClauses.push(sql`CASE WHEN ${jobs.jobRoleTitle} ~* ${pat} THEN 10.0 ELSE 0.0 END`);
    }
    for (const pat of secondarySkillPatterns) {
      scoreClauses.push(sql`CASE WHEN (${jobs.jobRoleTitle} ~* ${pat} OR ${jobs.jobDescription} ~* ${pat}) THEN ${1 / secondarySkillPatterns.length} ELSE 0.0 END`);
    }

    if (scoreClauses.length > 0) {
      similarityScoreSql = sql<number>`(${sql.join(scoreClauses, sql` + `)})`;
    }
  }

  const whereClause = and(...whereClauses);

  // 2. Handle 'Requested' Tab Query
  if (tab === "requested") {
    // Keep owned history accessible when a listing closes.
    const requestedConditions: SQL[] = [];

    if (requestedJobIds.length > 0) {
      requestedConditions.push(inArray(jobs.id, requestedJobIds));
    } else {
      // User has no requested resumes yet
      return {
        jobs: [],
        total: 0,
        page: 1,
        limit,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
        requestedJobIds: [],
        requestedCount: 0,
        jobsCount: (await db.select({ value: count() }).from(jobs).where(whereClause))[0]?.value ?? 0,
        executionTimeMs: Math.round(performance.now() - start),
      };
    }

    if (keyword) {
      requestedConditions.push(
        or(
          sql`${jobs.jobRoleTitle} ILIKE ${'%' + keyword + '%'}`,
          sql`${jobs.companyName} ILIKE ${'%' + keyword + '%'}`
        )!
      );
    }

    const [reqCountRes, reqRows, matchCountRes] = await Promise.all([
      db
        .select({ value: count() })
        .from(jobs)
        .where(and(...requestedConditions)),
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
          publishedAt: jobs.publishedAt,
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
        .where(and(...requestedConditions))
        .orderBy(desc(jobs.publishedAt), desc(jobs.id))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(jobs).where(whereClause),
    ]);

    const totalReq = reqCountRes[0]?.value ?? 0;
    const totalReqPages = Math.max(1, Math.ceil(totalReq / limit));

    const mappedReqJobs: Job[] = reqRows.map(row => ({
      ...mapDbRowToJob(row), requestStatus: requestStates.get(row.id) || "completed",
      isRequested: !["failed", "cancelled"].includes(requestStates.get(row.id) || ""),
    }));

    return {
      jobs: mappedReqJobs,
      total: totalReq,
      page,
      limit,
      totalPages: totalReqPages,
      hasNextPage: page < totalReqPages,
      hasPrevPage: page > 1,
      requestedJobIds,
      requestedCount: requestedJobIds.length,
      jobsCount: matchCountRes[0]?.value ?? 0,
      executionTimeMs: Math.round(performance.now() - start),
    };
  }



  // 4. Concurrently query total count and page slice for maximum speed
  const [countResult, rows] = await Promise.all([
    db
      .select({ value: count() })
      .from(jobs)
      .where(whereClause),
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
        publishedAt: firstSeen,
        createdAt: jobs.createdAt,
        workModel: jobs.workModel,
        visaSponsorship: jobs.visaSponsorship,
        experienceRequired: jobs.experienceRequired,
        jobSource: jobs.jobSource,
        externalApplyUrl: jobs.externalApplyUrl,
        countryName: countries.name,
        tierRank: tierRankSql,
        similarityScore: similarityScoreSql,
      })
      .from(jobs)
      .leftJoin(countries, eq(jobs.countryId, countries.id))
      .where(whereClause)
      .orderBy(
        ...(params.sort === "match"
          ? [desc(tierRankSql), desc(similarityScoreSql), desc(firstSeen)]
          : [desc(firstSeen), desc(tierRankSql), desc(similarityScoreSql)]),
        desc(jobs.id)
      )
      .limit(limit)
      .offset(offset),
  ]);

  const total = countResult[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  // Keep the response page consistent with the offset actually queried.
  const actualPage = page;

  const requestedSet = new Set(requestedJobIds);

  const mappedJobs: (Job & { isRequested?: boolean })[] = rows.map((r) => ({
    ...mapDbRowToJob(r),
    isRequested: requestedSet.has(r.id) && !["failed", "cancelled"].includes(requestStates.get(r.id) || ""),
    requestStatus: requestStates.get(r.id),
    matchDetails: {
      role: Number(r.tierRank) === 3 ? "Title matches a selected role" : hasCriteria ? "Related title match" : "Matches selected filters; no role selected",
      matchedSkills: prefSkills.filter(skill => new RegExp(resolveTagPattern(skill), "i").test(r.jobRoleTitle + " " + (r.jobDescription || ""))).slice(0, 8),
      missingSkills: prefSkills.filter(skill => !new RegExp(resolveTagPattern(skill), "i").test(r.jobRoleTitle + " " + (r.jobDescription || ""))).slice(0, 8),
    },
  }));

  return {
    jobs: mappedJobs,
    total,
    page: actualPage,
    limit,
    totalPages,
    hasNextPage: actualPage < totalPages,
    hasPrevPage: actualPage > 1,
    requestedJobIds,
    requestedCount: requestedJobIds.length,
    jobsCount: total,
    executionTimeMs: Math.round(performance.now() - start),
  };
}
