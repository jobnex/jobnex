import assert from "node:assert/strict";
import { Pool, type PoolClient } from "pg";

// Executes the actual Drizzle SQL against PostgreSQL CTE fixtures, without writing tables.
async function main() {
  const realPool = new Pool({ connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } });
  let client: PoolClient | undefined;
  try {
    client = await realPool.connect();
    await client.query("SET default_transaction_read_only=on");
    await client.query("SET statement_timeout=30000");
    const countries = await client!.query("select id,code from countries where code in ('US','us','IN','in')");
    const us = countries.rows.find((r) => r.code.toLowerCase() === "us")?.id;
    const india = "00000000-0000-4000-8000-000000000088";
    assert.ok(us, "US country control must exist");
    const now = Date.now();
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const fixture = (n: number, title: string, hours: number, extra = {}) => ({
      id: id(n), job_role_title: title, company_name: "Fixture", employment_type: "full_time",
      location: "New York City, United States", country_id: us,
      job_description: "Build services", salary_min: null, salary_max: null, currency: "USD",
      published_at: new Date(now - hours * 3600000).toISOString(), created_at: new Date(now).toISOString(),
      work_model: "on_site", visa_sponsorship: false, experience_required: 4,
      job_source: "fixture", external_apply_url: "https://example.com", status: "published", ...extra,
    });
    const fixtures = [
      fixture(1, "Backend Developer", 1),
      fixture(2, "Backend Developer Python", 3, { job_description: "Python SQL AWS" }),
      fixture(3, "Backend Developer", 25),
      fixture(4, "SQL Analyst", 0.5),
      fixture(5, "Senior Backend Developer", 0.5),
      fixture(6, "Backend Developer", -1),
      fixture(7, "Backend Developer", 0.5, { status: "draft" }),
      fixture(8, "Backend Developer", 0.5, { country_id: india, location: "India" }),
      fixture(9, "Backend Developer", 0.5, { location: "Austin, United States" }),
      fixture(10, "Backend Developer", 0.5, { employment_type: "internship" }),
      fixture(11, "Backend Developer", 0.5, { published_at: null }),
      fixture(12, "Backend Developer", 1, { work_model: "remote", location: "Remote, United States" }),
      fixture(13, "Backend Developer", 168.01),
      fixture(14, "Backend Developer", 23.99),
      fixture(15, "AI Sales Specialist", 0.5),
      fixture(16, "Backend Developer", 0.5, { created_at: new Date(now - 30 * 3600000).toISOString() }),
      fixture(17, "Junior Backend Developer", 0.5),
      fixture(18, "Backend Engineering Manager", 0.5),
    ];
    const preferences = { domains: ["Backend Developer"], skills: ["Python", "SQL", "AWS"],
      seniority: "Mid-level", country: "us", cities: ["New York, NY"], jobTypes: ["Full-time"] };
    let fixtureMode = true;
    const queries: string[] = [];
    // Drizzle calls query(config, values); preserve its row mode and type parsers.
    (globalThis as any).__dbPool = {
      query: (config: any, values: any[] = []) => {
        const text = typeof config === "string" ? config : config.text;
        if (fixtureMode && text.includes('from "user_job_preferences"')) {
          return Promise.resolve({ rows: [[preferences]] });
        }
        if (fixtureMode && text.includes('from "user_job_resumes"')) {
          return Promise.resolve({ rows: [[id(3)]] });
        }
        if (fixtureMode && text.includes('from "jobs"')) {
          const fields = `id uuid, job_role_title text, company_name text, employment_type text,
            location text, country_id uuid, job_description text, salary_min integer, salary_max integer,
            currency text, published_at timestamptz, created_at timestamptz, work_model text,
            visa_sponsorship boolean, experience_required integer, job_source text, external_apply_url text, status text`;
          const cte = `WITH jobs AS (SELECT * FROM jsonb_to_recordset($${values.length + 1}::jsonb) AS x(${fields})) `;
          queries.push(text);
          return client!.query({ ...config, text: cte + text }, [...values, JSON.stringify(fixtures)]);
        }
        return client!.query(config, values);
      },
    };
    process.env.DATABASE_URL ||= "postgres://unused";
    const { getMatchedJobs } = await import("../lib/db/job-matching");
    const options = { ...preferences, mode: "strict" as const, limit: 2 };
    const first = await getMatchedJobs(options);
    assert.deepEqual(first.jobs.map((r) => r.id), [id(12), id(1)]);
    assert.equal(first.total, 4);
    assert.equal(first.totalPages, 2);
    const second = await getMatchedJobs({ ...options, page: 2 });
    assert.deepEqual(second.jobs.map((r) => r.id), [id(2), id(14)]);
    assert.equal(new Set([...first.jobs, ...second.jobs].map((r) => r.id)).size, 4);
    const best = await getMatchedJobs({ ...options, sort: "match" });
    assert.equal(best.jobs[0].id, id(2), "description skill overlap must improve best-match ranking");
    const week = await getMatchedJobs({ ...options, postedWithin: "7d", limit: 50 });
    assert.equal(week.total, 6);
    const all = await getMatchedJobs({ ...options, postedWithin: "all", limit: 50 });
    assert.equal(all.total, 7);
    const requested = await getMatchedJobs({ userId: id(99), tab: "requested" });
    assert.deepEqual(requested.jobs.map((r) => r.id), [id(3)], "requested history must retain older jobs");
    const skillsOnly = await getMatchedJobs({ skills: ["SQL"], mode: "strict" });
    assert.ok(skillsOnly.jobs.some((r) => r.id === id(4)), "skills-only preferences remain supported");
    const ai = await getMatchedJobs({ domains: ["AI Engineer"], skills: ["SQL"] });
    assert.equal(ai.total, 0, "AI sales and skill-only titles are not AI engineer roles");
    const keyword = await getMatchedJobs({ ...options, keyword: "Python" });
    assert.equal(keyword.total, 1);
    const outOfRange = await getMatchedJobs({ ...options, page: 99 });
    assert.equal(outOfRange.page, 99);
    assert.equal(outOfRange.jobs.length, 0);
    assert.ok(queries.every((q) => q.includes("where")), "fixtures must exercise actual filters");
    console.log("CURATED SQL REGRESSIONS PASSED: freshness, future/null/draft rejection, roles, skills, seniority, country, city, type, sort, search, pagination, requested history");
    if (process.env.CURATED_LIVE_USER) {
      fixtureMode = false;
      const live = await getMatchedJobs({ userId: process.env.CURATED_LIVE_USER, limit: 24 });
      const times = live.jobs.map((r) => Date.parse(r.postedAt!));
      assert.ok(times.every((t) => t >= Date.now() - 24 * 3600000 - 60000 && t <= Date.now()));
      assert.ok(times.every((t, i) => i === 0 || times[i - 1] >= t));
      const page2 = await getMatchedJobs({ userId: process.env.CURATED_LIVE_USER, limit: 24, page: 2 });
      assert.equal(new Set([...live.jobs, ...page2.jobs].map((r) => r.id)).size, live.jobs.length + page2.jobs.length);
      const bestLive = await getMatchedJobs({ userId: process.env.CURATED_LIVE_USER, limit: 24, sort: "match" });
      console.log(JSON.stringify({ liveMatches24h: live.total, firstPage: live.jobs.length,
        secondPage: page2.jobs.length, bestMatchPage: bestLive.jobs.length,
        executionTimeMs: live.executionTimeMs, newest: live.jobs[0]?.postedAt,
        titles: live.jobs.slice(0, 5).map((r) => r.jobRoleTitle) }));
      console.log("CURATED LIVE READ-ONLY VERIFICATION PASSED");
    }
  } finally { client?.release(); await realPool.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
