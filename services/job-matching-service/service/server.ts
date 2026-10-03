import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { config } from "dotenv";
import { Pool } from "pg";
import { PREFERENCE_MATCHING_SQL } from "./query";

config();

const app = express();

// Security Hardening: Disable Express signature header
app.disable("x-powered-by");

// Security Hardening: Enforce strict payload limits to mitigate JSON-bomb DoS attacks
app.use(express.json({ limit: "100kb" }));

// Security Hardening: Standard OWASP HTTP response security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// Security Hardening: Configurable CORS allowlist
const corsOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(",").map(o => o.trim()) 
  : "*";

app.use(cors({
  origin: corsOrigins,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-internal-secret"],
}));

const PORT = process.env.PORT || 8080;
const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!connectionString) {
  console.warn("WARNING: DATABASE_URL or DIRECT_URL is not set.");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeArray(input: unknown, maxItems = 25, maxLen = 100): string[] | undefined {
  if (Array.isArray(input)) {
    const cleaned = input
      .map(item => String(item).trim().slice(0, maxLen))
      .filter(Boolean)
      .slice(0, maxItems);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (typeof input === "string") {
    const cleaned = input
      .split(",")
      .map(item => item.trim().slice(0, maxLen))
      .filter(Boolean)
      .slice(0, maxItems);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  return undefined;
}

function sanitizeText(input: unknown, maxLen = 100): string | undefined {
  if (typeof input === "string") {
    const clean = input.trim().slice(0, maxLen);
    return clean.length > 0 ? clean : undefined;
  }
  return undefined;
}

// Public Health Check Endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Security Hardening: Optional Service-to-Service Secret Authentication
const requireServiceAuth = (req: Request, res: Response, next: NextFunction) => {
  const internalSecret = process.env.INTERNAL_SERVICE_KEY;
  if (internalSecret) {
    const clientSecret = req.headers["x-internal-secret"] || 
      (req.headers["authorization"]?.startsWith("Bearer ") ? req.headers["authorization"].slice(7) : null);

    if (clientSecret !== internalSecret) {
      return res.status(401).json({ error: "Unauthorized: Invalid service authentication token" });
    }
  }
  next();
};

app.all("/api/jobs/matched", requireServiceAuth, async (req: Request, res: Response) => {
  try {
    const isGet = req.method === "GET";
    const params = isGet ? req.query : req.body;

    // OWASP API1: Validate and enforce UUID format for candidate ID
    const rawUserId = typeof params.userId === "string" ? params.userId.trim() : null;
    const userId = rawUserId && UUID_REGEX.test(rawUserId) ? rawUserId : null;

    // OWASP API4: Clamp pagination limits to [1, 50] to prevent resource exhaustion / DoS
    const rawLimit = params.limit ? parseInt(params.limit as string, 10) : 24;
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(1, rawLimit), 50) : 24;

    const rawMode = params.mode as string;
    const mode = (rawMode === "strict" || rawMode === "balanced" || rawMode === "broad")
      ? rawMode
      : "balanced";

    const cursor = typeof params.cursor === "string" && params.cursor.length <= 512 ? params.cursor : null;
    let cursorPublishedAt: string | null = null;
    let cursorId: string | null = null;
    let cursorTierRank: number | null = null;
    let cursorSimilarityScore: number | null = null;

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
        if (decoded?.id && decoded?.publishedAt && UUID_REGEX.test(decoded.id)) {
          cursorPublishedAt = String(decoded.publishedAt);
          cursorId = decoded.id;
          cursorTierRank = typeof decoded.tierRank === "number" ? decoded.tierRank : null;
          cursorSimilarityScore = typeof decoded.similarityScore === "number" ? decoded.similarityScore : null;
        }
      } catch {
        // Non-fatal if cursor is malformed; falls back to initial page
      }
    }

    const rawPref = typeof params.preferences === "object" && params.preferences !== null
      ? params.preferences
      : {};

    const prefPayload: Record<string, unknown> = { mode };

    const domains = sanitizeArray(params.domains ?? rawPref.domains);
    if (domains) prefPayload.domains = domains;

    const skills = sanitizeArray(params.skills ?? rawPref.skills);
    if (skills) prefPayload.skills = skills;

    const country = sanitizeText(params.country ?? rawPref.country, 60);
    if (country) prefPayload.country = country;

    const cities = sanitizeArray(params.cities ?? rawPref.cities);
    if (cities) prefPayload.cities = cities;

    const seniority = sanitizeText(params.seniority ?? rawPref.seniority, 50);
    if (seniority) prefPayload.seniority = seniority;

    const jobTypes = sanitizeArray(params.jobTypes ?? rawPref.jobTypes);
    if (jobTypes) prefPayload.jobTypes = jobTypes;

    if (cursorTierRank !== null) prefPayload.cursorTierRank = cursorTierRank;
    if (cursorSimilarityScore !== null) prefPayload.cursorSimilarityScore = cursorSimilarityScore;

    const prefJson = JSON.stringify(prefPayload);
    const fetchLimit = Math.max(1, limit) + 1;

    const start = performance.now();
    const result = await pool.query(PREFERENCE_MATCHING_SQL, [
      prefJson,
      userId,
      cursorPublishedAt,
      cursorId,
      fetchLimit,
      null, // resolvedCountryId
    ]);
    const durationMs = performance.now() - start;

    const rawRows = result.rows || [];
    const hasMore = rawRows.length > limit;
    const rows = hasMore ? rawRows.slice(0, limit) : rawRows;

    let nextCursor: string | null = null;
    let nextKeyset: any = null;

    if (hasMore && rows.length > 0) {
      const lastJob = rows[rows.length - 1];
      nextKeyset = {
        tierRank: Number(lastJob.tierRank ?? lastJob.tier_rank ?? 3),
        similarityScore: Number(lastJob.similarityScore ?? lastJob.similarity_score ?? 1.0),
        publishedAt: lastJob.publishedAtRaw || lastJob.published_at_raw || new Date(lastJob.published_at).toISOString(),
        id: lastJob.id,
      };
      nextCursor = Buffer.from(JSON.stringify(nextKeyset)).toString("base64url");
    }

    const mappedJobs = rows.map((r: any) => ({
      id: r.id,
      jobRoleTitle: r.jobRoleTitle || r.job_role_title,
      company: r.companyName || r.company_name || "Unknown Company",
      type: r.employmentType || r.employment_type || "Full-time",
      location: r.country_name ? `${r.location}, ${r.country_name}` : r.location,
      salary: r.salary_min && r.salary_max ? `$${r.salary_min} - $${r.salary_max}` : (r.salary_min ? `$${r.salary_min}+` : "Competitive"),
      jobDescription: r.jobDescription || r.job_description,
      categories: [],
      postedAt: r.published_at ? new Date(r.published_at).toISOString() : new Date().toISOString(),
      isRemote: (r.work_model || r.workModel) === "remote",
      isHybrid: (r.work_model || r.workModel) === "hybrid",
      workModel: r.work_model || r.workModel,
      visaSponsorship: r.visa_sponsorship ?? r.visaSponsorship,
      experienceRequired: r.experience_required ?? r.experienceRequired,
      similarityScore: Number(r.similarityScore ?? r.similarity_score ?? 1.0),
      tierRank: Number(r.tierRank ?? r.tier_rank ?? 3),
    }));

    res.json({
      jobs: mappedJobs,
      nextCursor,
      nextKeyset,
      hasMore,
      executionTimeMs: Math.round(durationMs * 100) / 100,
    });
  } catch (err: any) {
    console.error("Cloud Run Matching Service Error:", err);
    // OWASP API10: Mask database error details in production to prevent information disclosure
    res.status(500).json({ error: "Failed to match jobs" });
  }
});

app.listen(PORT, () => {
  console.log(`Cloud Run Matching Service running securely on port ${PORT}`);
});
