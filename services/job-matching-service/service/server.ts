import express, { Request, Response } from "express";
import cors from "cors";
import { config } from "dotenv";
import { Pool } from "pg";
import { PREFERENCE_MATCHING_SQL } from "./query";

config();

const app = express();
app.use(cors());
app.use(express.json());

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

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.all("/api/jobs/matched", async (req: Request, res: Response) => {
  try {
    const isGet = req.method === "GET";
    const params = isGet ? req.query : req.body;

    const userId = (params.userId as string) || null;
    const cursor = (params.cursor as string) || null;
    const limit = params.limit ? parseInt(params.limit as string, 10) : 24;
    const mode = (params.mode as string) || "balanced";

    let cursorPublishedAt: string | null = null;
    let cursorId: string | null = null;
    let cursorTierRank: number | null = null;
    let cursorSimilarityScore: number | null = null;

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
        if (decoded?.id && decoded?.publishedAt) {
          cursorPublishedAt = decoded.publishedAt;
          cursorId = decoded.id;
          cursorTierRank = decoded.tierRank ?? null;
          cursorSimilarityScore = decoded.similarityScore ?? null;
        }
      } catch (err) {
        console.warn("Invalid cursor passed:", cursor);
      }
    }

    const prefPayload: Record<string, unknown> = {
      ...(typeof params.preferences === "object" ? params.preferences : {}),
      mode,
    };

    if (params.domains) {
      prefPayload.domains = typeof params.domains === "string" ? params.domains.split(",") : params.domains;
    }
    if (params.skills) {
      prefPayload.skills = typeof params.skills === "string" ? params.skills.split(",") : params.skills;
    }
    if (params.country) prefPayload.country = params.country;
    if (params.cities) {
      prefPayload.cities = typeof params.cities === "string" ? params.cities.split(",") : params.cities;
    }
    if (params.seniority) prefPayload.seniority = params.seniority;
    if (params.jobTypes) {
      prefPayload.jobTypes = typeof params.jobTypes === "string" ? params.jobTypes.split(",") : params.jobTypes;
    }
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
    res.status(500).json({ error: "Failed to match jobs", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Cloud Run Matching Service running on port ${PORT}`);
});
