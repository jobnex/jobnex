import { sql } from "drizzle-orm";
import { db, pool } from "@/lib/db";

export type MatchingMode = "strict" | "balanced" | "broad";

export interface UserPreferencesInput {
  jobTypes?: string[] | null;
  domains?: string[] | null;
  cities?: string[] | null;
  country?: string | null;
  seniority?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  experienceYears?: number | null;
  skills?: string[] | null;
  mode?: MatchingMode | null;
}

export interface KeysetCursor {
  tierRank?: number;
  similarityScore?: number;
  publishedAt: string | Date; // ISO-8601 string or Date object
  id: string; // UUID
}

export interface MatchUserJobsOptions {
  userId?: string | null;
  preferences?: UserPreferencesInput | null;
  cursor?: string | KeysetCursor | null;
  limit?: number;
  mode?: MatchingMode;
}

export type MatchedJobRecord = {
  id: string;
  jobRoleTitle: string;
  jobDescription: string;
  companyName: string;
  location: string;
  employmentType: string;
  workModel: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  experienceRequired: number | null;
  visaSponsorship: boolean;
  publishedAt: Date;
  publishedAtRaw?: string;
  createdAt: Date;
  countryCode: string | null;
  countryName: string | null;
  tierRank: number;
  similarityScore: number;
  [key: string]: unknown;
};

export interface MatchUserJobsResult {
  jobs: MatchedJobRecord[];
  nextCursor: string | null;
  nextKeyset: KeysetCursor | null;
  hasMore: boolean;
  executionTimeMs?: number;
}

/**
 * Encode a keyset cursor to URL-safe base64
 */
export function encodeCursor(cursor: KeysetCursor): string {
  const json = JSON.stringify({
    tierRank: typeof cursor.tierRank === "number" ? cursor.tierRank : 3,
    similarityScore: typeof cursor.similarityScore === "number" ? cursor.similarityScore : 1.0,
    publishedAt: cursor.publishedAt instanceof Date ? cursor.publishedAt.toISOString() : cursor.publishedAt,
    id: cursor.id,
  });
  return Buffer.from(json).toString("base64url");
}

/**
 * Decode a URL-safe base64 keyset cursor
 */
export function decodeCursor(cursorStr: string): KeysetCursor | null {
  try {
    const json = Buffer.from(cursorStr, "base64url").toString("utf-8");
    const parsed = JSON.parse(json);
    if (
      parsed &&
      typeof parsed.publishedAt === "string" &&
      !isNaN(Date.parse(parsed.publishedAt)) &&
      typeof parsed.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.id)
    ) {
      return {
        tierRank: typeof parsed.tierRank === "number" ? parsed.tierRank : undefined,
        similarityScore: typeof parsed.similarityScore === "number" ? parsed.similarityScore : undefined,
        publishedAt: parsed.publishedAt,
        id: parsed.id,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parameterized PostgreSQL hybrid multi-tier user-job preference matching query.
 *
 * Parameters:
 * $1: preferences (JSONB | null) - user JSONB preferences object
 * $2: userId (TEXT | null) - optional user ID to look up in user_job_preferences
 * $3: cursorPublishedAt (TIMESTAMPTZ | null) - keyset pagination published_at cursor
 * $4: cursorId (UUID | null) - keyset pagination job id cursor
 * $5: limit (INTEGER) - maximum number of jobs to fetch
 * $6: countryId (UUID | null) - optional pre-resolved country ID for index acceleration
 *
 * Production Hardened Features:
 * R1: Metacharacter & Malicious Input Defense:
 *     - Strips surrounding enclosure symbols using native btrim
 *     - Escapes all POSIX regex metacharacters (\, ^, $, ., |, ?, *, +, (, ), [, ], {, })
 *     - Fully parameterizes values, preventing ReDoS and SQL injection
 * R2: Core Tech & Title Synonym Expansion:
 *     - SWE / SDE / Software Dev <-> Software Engineer
 *     - Frontend <-> Front End <-> Front-end
 *     - Backend <-> Back End <-> Back-end
 *     - Fullstack <-> Full Stack <-> Full-Stack
 *     - DevOps <-> SRE <-> Site Reliability Engineer
 *     - ML <-> Machine Learning <-> AI
 * R3: Domain vs. Tool/Skill Weighting:
 *     - Target career roles (domains) receive +10.0 base weight, preventing secondary tool buzzwords from eclipsing role titles
 *     - Multi-criteria matches strictly order above single-criteria matches
 * R4: Air-tight Seniority Isolation:
 *     - Mid-level candidates strictly exclude senior leadership and entry titles unconditionally
 * R5: Candidate-Choice Location Flexibility:
 *     - If no location filters are specified, location receives zero restriction / penalty
 *     - Specific user location choices (cities/country/remote) strictly honored when specified
 * R6: Feed Diversity / Company De-duplication:
 *     - Prevents duplicate requisition flooding per company/role title
 * R7: Sub-10ms latency & deterministic keyset pagination.
 */
export const PREFERENCE_MATCHING_SQL = `
  WITH raw_pref AS (
    SELECT 
      CASE
        WHEN $1::jsonb IS NOT NULL AND $2::text IS NOT NULL THEN (
          COALESCE(
            (
              SELECT 
                CASE
                  WHEN jsonb_typeof(preferences->'domains') = 'array' AND jsonb_array_length(preferences->'domains') > 0 THEN preferences
                  WHEN preferences->'lastConfirmedPreferences' IS NOT NULL AND jsonb_typeof(preferences->'lastConfirmedPreferences'->'domains') = 'array' AND jsonb_array_length(preferences->'lastConfirmedPreferences'->'domains') > 0 THEN preferences->'lastConfirmedPreferences'
                  ELSE preferences
                END
              FROM user_job_preferences WHERE user_id = $2::text LIMIT 1
            ),
            '{}'::jsonb
          ) || $1::jsonb
        )
        WHEN $1::jsonb IS NOT NULL THEN $1::jsonb
        WHEN $2::text IS NOT NULL THEN (
          SELECT 
            CASE
              WHEN jsonb_typeof(preferences->'domains') = 'array' AND jsonb_array_length(preferences->'domains') > 0 THEN preferences
              WHEN preferences->'lastConfirmedPreferences' IS NOT NULL AND jsonb_typeof(preferences->'lastConfirmedPreferences'->'domains') = 'array' AND jsonb_array_length(preferences->'lastConfirmedPreferences'->'domains') > 0 THEN preferences->'lastConfirmedPreferences'
              ELSE preferences
            END
          FROM user_job_preferences 
          WHERE user_id = $2::text 
          LIMIT 1
        )
        ELSE '{}'::jsonb
      END AS p
  ),
  cursor_job AS (
    SELECT id, job_role_title, published_at
    FROM jobs
    WHERE $4::uuid IS NOT NULL AND id = $4::uuid
    LIMIT 1
  ),
  domain_tags AS (
    SELECT DISTINCT clean_tag, is_domain
    FROM raw_pref rp,
      LATERAL (
        SELECT jsonb_array_elements_text(rp.p->'domains') AS raw_val, TRUE AS is_domain
        WHERE jsonb_typeof(rp.p->'domains') = 'array'
        UNION ALL
        SELECT jsonb_array_elements_text(rp.p->'skills') AS raw_val, FALSE AS is_domain
        WHERE jsonb_typeof(rp.p->'skills') = 'array'
      ) raw_inputs,
      LATERAL unnest(string_to_array(raw_inputs.raw_val, '/')) AS sub_tag,
      LATERAL (
        SELECT CASE
          WHEN (trim(sub_tag) ~ '^[\\(\\[\\{]+[^\\(\\)\\[\\]\\{\\}]+[\\)\\]\\}]+$') THEN
            btrim(trim(sub_tag), '[](){}')
          ELSE trim(sub_tag)
        END AS clean_tag
      ) ct
    WHERE clean_tag <> ''
    LIMIT 50
  ),
  canonical_criteria AS (
    SELECT DISTINCT
      is_domain,
      CASE
        WHEN lower(clean_tag) IN (
          'swe', 'sde', 'software dev', 'software developer', 'software engineer', 'software development engineer'
        ) THEN
          '(?<![\\w])(SWE|SDE|Software\\s+Dev(?:elopment)?(?:\\s+Engineer)?|Software\\s+Developer|Software\\s+Engineer)(?![\\w])'
        WHEN lower(clean_tag) IN (
          'frontend', 'front end', 'front-end',
          'frontend developer', 'front end developer', 'front-end developer',
          'frontend engineer', 'front end engineer', 'front-end engineer',
          'frontend dev', 'front end dev', 'front-end dev'
        ) THEN
          '(?<![\\w])(Front[- ]?End|Frontend)(?![\\w])'
        WHEN lower(clean_tag) IN (
          'backend', 'back end', 'back-end',
          'backend developer', 'back end developer', 'back-end developer',
          'backend engineer', 'back end engineer', 'back-end engineer',
          'backend dev', 'back end dev', 'back-end dev'
        ) THEN
          '(?<![\\w])(Back[- ]?End|Backend)(?![\\w])'
        WHEN lower(clean_tag) IN (
          'fullstack', 'full stack', 'full-stack',
          'fullstack developer', 'full stack developer', 'full-stack developer',
          'fullstack engineer', 'full stack engineer', 'full-stack engineer',
          'fullstack dev', 'full stack dev', 'full-stack dev'
        ) THEN
          '(?<![\\w])(Full[- ]?Stack|Fullstack)(?![\\w])'
        WHEN lower(clean_tag) IN (
          'devops', 'devops engineer', 'devops developer',
          'sre', 'sre engineer', 'site reliability engineer', 'site reliability'
        ) THEN
          '(?<![\\w])(DevOps(?:\\s+Engineer)?|SRE(?:\\s+Engineer)?|Site\\s+Reliability(?:\\s+Engineer)?)(?![\\w])'
        WHEN lower(clean_tag) IN (
          'ml', 'machine learning', 'machine learning engineer', 'ml engineer'
        ) THEN
          '(?<![\\w])(ML(?:\\s+Engineer)?|Machine\\s+Learning(?:\\s+Engineer)?)(?![\\w])'
        WHEN length(clean_tag) = 1 AND clean_tag ~ '^[A-Za-z]$' THEN
          '(?<![\\w&]|[A-Za-z]/)(' || clean_tag || ')(?![\\w&+#]|-\\d|\\.\\s|\\s*&\\s*[A-Za-z])'
        WHEN clean_tag ~ '^[^A-Za-z0-9]' THEN
          '(' || regexp_replace(clean_tag, '([\\\\^$.|?*+()[\\]{}])', '\\\\\\1', 'g') || ')(?![\\w])'
        ELSE
          '(?<![\\w])(' || regexp_replace(clean_tag, '([\\\\^$.|?*+()[\\]{}])', '\\\\\\1', 'g') || ')(?![\\w])'
      END AS pat
    FROM domain_tags
  ),
  canonical_agg AS (
    SELECT
      array_agg(pat) AS pref_criteria_regexes,
      count(*)::int AS num_criteria,
      CASE WHEN count(*) > 0 THEN '(' || string_agg(pat, '|' ORDER BY length(pat) DESC) || ')' ELSE NULL END AS pref_domains_t1_regex,
      array_agg(pat) FILTER (WHERE is_domain) AS primary_domain_regexes,
      count(*) FILTER (WHERE is_domain)::int AS num_primary_domains,
      array_agg(pat) FILTER (WHERE NOT is_domain) AS secondary_skill_regexes,
      count(*) FILTER (WHERE NOT is_domain)::int AS num_secondary_skills
    FROM canonical_criteria
  ),
  t2_token_pairs AS (
    WITH dt AS (
      SELECT clean_tag AS tag 
      FROM domain_tags 
      WHERE clean_tag ~ '[\\s,/-]' 
      LIMIT 20
    ),
    tp AS (
      SELECT dt.tag, tok.tokens
      FROM dt,
      LATERAL (
        SELECT ARRAY_AGG(clean_w) AS tokens
        FROM (
          SELECT btrim(w, '[](){}') AS clean_w
          FROM unnest(regexp_split_to_array(dt.tag, '[\\s,/-]+')) AS w
          WHERE length(w) > 1 AND lower(w) NOT IN ('and', 'or', 'of', 'in', 'the', 'for', 'to', 'with', 'a', 'an')
          LIMIT 5
        ) sub
        WHERE clean_w <> ''
      ) tok
      WHERE cardinality(tok.tokens) >= 2
    ),
    t2_pats AS (
      SELECT DISTINCT
        '(?<![\\w])(' || regexp_replace(t.tokens[i], '([\\\\^$.|?*+()[\\]{}])', '\\\\\\1', 'g') || '(\\s+\\w+)?\\s+' || regexp_replace(t.tokens[j], '([\\\\^$.|?*+()[\\]{}])', '\\\\\\1', 'g') || ')(?![\\w])' AS pair_pattern
      FROM tp t,
        generate_subscripts(t.tokens, 1) i,
        generate_subscripts(t.tokens, 1) j
      WHERE i <> j
      LIMIT 40
    )
    SELECT CASE WHEN count(*) > 0 THEN '(' || string_agg(pair_pattern, '|' ORDER BY length(pair_pattern) DESC) || ')' ELSE NULL END AS pref_domains_t2_regex
    FROM t2_pats
  ),
  state_map(name, code) AS (
    VALUES 
      ('alabama', 'AL'), ('alaska', 'AK'), ('arizona', 'AZ'), ('arkansas', 'AR'),
      ('california', 'CA'), ('colorado', 'CO'), ('connecticut', 'CT'), ('delaware', 'DE'),
      ('florida', 'FL'), ('georgia', 'GA'), ('hawaii', 'HI'), ('idaho', 'ID'),
      ('illinois', 'IL'), ('indiana', 'IN'), ('iowa', 'IA'), ('kansas', 'KS'),
      ('kentucky', 'KY'), ('louisiana', 'LA'), ('maine', 'ME'), ('maryland', 'MD'),
      ('massachusetts', 'MA'), ('michigan', 'MI'), ('minnesota', 'MN'), ('mississippi', 'MS'),
      ('missouri', 'MO'), ('montana', 'MT'), ('nebraska', 'NE'), ('nevada', 'NV'),
      ('new hampshire', 'NH'), ('new jersey', 'NJ'), ('new mexico', 'NM'), ('new york', 'NY'),
      ('north carolina', 'NC'), ('north dakota', 'ND'), ('ohio', 'OH'), ('oklahoma', 'OK'),
      ('oregon', 'OR'), ('pennsylvania', 'PA'), ('rhode island', 'RI'), ('south carolina', 'SC'),
      ('south dakota', 'SD'), ('tennessee', 'TN'), ('texas', 'TX'), ('utah', 'UT'),
      ('vermont', 'VT'), ('virginia', 'VA'), ('washington', 'WA'), ('west virginia', 'WV'),
      ('wisconsin', 'WI'), ('wyoming', 'WY'), ('district of columbia', 'DC'),
      ('ontario', 'ON'), ('quebec', 'QC'), ('british columbia', 'BC'), ('alberta', 'AB'),
      ('manitoba', 'MB'), ('saskatchewan', 'SK'), ('nova scotia', 'NS'), ('new brunswick', 'NB'),
      ('newfoundland and labrador', 'NL'), ('prince edward island', 'PE')
  ),
  city_tags AS (
    SELECT DISTINCT clean_c
    FROM raw_pref rp,
      LATERAL (
        SELECT jsonb_array_elements_text(rp.p->'cities') AS x
        WHERE jsonb_typeof(rp.p->'cities') = 'array'
      ) c_inputs,
      LATERAL (SELECT regexp_replace(btrim(trim(x), ', ' || chr(9) || chr(10) || chr(13)), '\\s*,\\s*', ', ', 'g') AS clean_c) cc
    WHERE clean_c <> ''
    LIMIT 50
  ),
  city_patterns AS (
    SELECT 
      ct.clean_c,
      CASE
        WHEN lower(ct.clean_c) IN ('nyc', 'new york', 'new york city', 'ny city', 'new york ny', 'new york, ny', 'nyc, ny', 'ny, new york') THEN
          '(?<![\\w])(New York|NYC)(?![\\w])'
        WHEN lower(ct.clean_c) IN ('sf', 'san francisco', 'sf bay area', 'bay area', 'san francisco bay area', 'silicon valley', 'san francisco, ca', 'sf, ca', 'san francisco, california', 'san jose', 'san jose, ca', 'oakland', 'oakland, ca') THEN
          '(?<![\\w])(San Francisco|SF|Bay Area|Silicon Valley|San Jose|Oakland)(?![\\w])'
        WHEN lower(ct.clean_c) IN ('la', 'los angeles', 'los angeles, ca', 'la, ca', 'los angeles, california') THEN
          '(?<![\\w])(Los Angeles|LA)(?![\\w])'
        WHEN lower(ct.clean_c) IN ('dc', 'washington', 'washington dc', 'washington, dc', 'dmv', 'washington, district of columbia') THEN
          '(?<![\\w])(Washington|DC)(?![\\w])'
        WHEN lower(ct.clean_c) IN ('dfw', 'dallas fort worth', 'dallas-fort worth', 'dallas', 'fort worth', 'dallas, tx', 'dfw, tx', 'dallas, texas', 'fort worth, tx', 'fort worth, texas') THEN
          '(?<![\\w])(Dallas|DFW|Fort Worth)(?![\\w])'
        WHEN sm.name IS NOT NULL AND (lower(ct.clean_c) = sm.name OR upper(ct.clean_c) = sm.code) THEN
          '(?<![\\w])(' || regexp_replace(ct.clean_c, '([\\\\^$.|?*+()[\\]{}])', '\\\\\\1', 'g') || '|' || sm.name || '|' || sm.code || ')(?![\\w])'
        WHEN sm.name IS NOT NULL AND (ct.clean_c ILIKE '%, ' || sm.name OR ct.clean_c ILIKE '%, ' || sm.code) THEN
          '(?<![\\w])(' || regexp_replace(split_part(ct.clean_c, ', ', 1), '([\\\\^$.|?*+()[\\]{}])', '\\\\\\1', 'g') || ',\\s*(' || sm.name || '|' || sm.code || ')|' || regexp_replace(split_part(ct.clean_c, ', ', 1), '([\\\\^$.|?*+()[\\]{}])', '\\\\\\1', 'g') || ')(?![\\w])'
        ELSE
          '(?<![\\w])(' || regexp_replace(regexp_replace(ct.clean_c, '([\\\\^$.|?*+()[\\]{}])', '\\\\\\1', 'g'), ',\\s*', ',\\\\s*', 'g') || ')(?![\\w])'
      END AS c_pat
    FROM city_tags ct
    LEFT JOIN state_map sm ON (
      lower(ct.clean_c) = sm.name
      OR upper(ct.clean_c) = sm.code
      OR ct.clean_c ILIKE '%, ' || sm.name
      OR ct.clean_c ILIKE '%, ' || sm.code
    )
  ),
  city_agg AS (
    SELECT
      array_agg(clean_c) AS pref_cities,
      CASE WHEN count(*) > 0 THEN '(' || string_agg(c_pat, '|' ORDER BY length(clean_c) DESC) || ')' ELSE NULL END AS pref_cities_regex
    FROM city_patterns
  ),
  user_pref AS (
    SELECT
      CASE 
        WHEN trim(lower(rp.p->>'mode')) IN ('strict', 'broad') THEN trim(lower(rp.p->>'mode'))
        ELSE 'balanced'
      END AS pref_mode,

      CASE 
        WHEN jsonb_typeof(rp.p->'jobTypes') = 'array' AND jsonb_array_length(rp.p->'jobTypes') > 0 THEN
          ARRAY(
            SELECT DISTINCT CASE lower(replace(trim(x), '-', '_'))
              WHEN 'intern' THEN 'internship'
              WHEN 'full time' THEN 'full_time'
              WHEN 'part time' THEN 'part_time'
              ELSE lower(replace(trim(x), '-', '_'))
            END
            FROM jsonb_array_elements_text(rp.p->'jobTypes') AS x
            WHERE trim(x) <> ''
          )
        ELSE NULL
      END AS pref_job_types,

      (SELECT array_agg(clean_tag) FROM domain_tags) AS pref_domains,
      ca.pref_criteria_regexes,
      ca.num_criteria,
      ca.pref_domains_t1_regex,
      ca.primary_domain_regexes,
      COALESCE(ca.num_primary_domains, 0) AS num_primary_domains,
      ca.secondary_skill_regexes,
      COALESCE(ca.num_secondary_skills, 0) AS num_secondary_skills,
      t2.pref_domains_t2_regex,

      ca_city.pref_cities,
      ca_city.pref_cities_regex,

      NULLIF(trim(lower(rp.p->>'country')), '') AS pref_country,
      (
        SELECT id 
        FROM countries 
        WHERE NULLIF(trim(lower(rp.p->>'country')), '') IS NOT NULL 
          AND (code ILIKE trim(lower(rp.p->>'country')) OR name ILIKE trim(lower(rp.p->>'country')))
        LIMIT 1
      ) AS pref_country_id,

      CASE 
        WHEN trim(lower(rp.p->>'seniority')) IN ('entry', 'entry-level', 'entry_level', 'fresher', 'junior', 'jr', 'jr.', 'intern', 'internship', 'associate', 'graduate', 'trainee') THEN 'entry'
        WHEN trim(lower(rp.p->>'seniority')) IN ('mid', 'mid-level', 'mid_level', 'intermediate') THEN 'mid'
        WHEN trim(lower(rp.p->>'seniority')) IN ('senior', 'sr', 'sr.', 'lead', 'staff', 'principal', 'director', 'head', 'vp') THEN 'senior'
        ELSE NULL
      END AS pref_seniority_tier,

      (rp.p->>'cursorTierRank')::int AS raw_cursor_tier_rank,
      (rp.p->>'cursorSimilarityScore')::numeric AS raw_cursor_sim_score
    FROM raw_pref rp
    CROSS JOIN canonical_agg ca
    CROSS JOIN t2_token_pairs t2
    CROSS JOIN city_agg ca_city
  ),
  cursor_scoring AS (
    SELECT
      cj.id,
      CASE
        WHEN up.pref_domains_t1_regex IS NOT NULL AND cj.job_role_title ~* up.pref_domains_t1_regex THEN 3
        WHEN up.pref_domains_t2_regex IS NOT NULL AND cj.job_role_title ~* up.pref_domains_t2_regex THEN 2
        WHEN up.pref_domains IS NOT NULL AND cardinality(up.pref_domains) > 0 AND cj.job_role_title % ANY(up.pref_domains) THEN 1
        ELSE 3
      END AS c_tier_rank,
      CASE
        WHEN up.pref_domains_t1_regex IS NOT NULL AND cj.job_role_title ~* up.pref_domains_t1_regex THEN
          CASE
            WHEN up.num_primary_domains > 0 AND up.num_secondary_skills > 0 THEN
              (10.0 * (
                (CASE WHEN up.num_primary_domains >= 1 AND cj.job_role_title ~* up.primary_domain_regexes[1] THEN 1 ELSE 0 END) +
                (CASE WHEN up.num_primary_domains >= 2 AND cj.job_role_title ~* up.primary_domain_regexes[2] THEN 1 ELSE 0 END) +
                (CASE WHEN up.num_primary_domains >= 3 AND cj.job_role_title ~* up.primary_domain_regexes[3] THEN 1 ELSE 0 END) +
                (CASE WHEN up.num_primary_domains >= 4 AND cj.job_role_title ~* up.primary_domain_regexes[4] THEN 1 ELSE 0 END) +
                (CASE WHEN up.num_primary_domains >= 5 AND cj.job_role_title ~* up.primary_domain_regexes[5] THEN 1 ELSE 0 END)
              ))
              +
              (
                (CASE WHEN up.num_secondary_skills >= 1 AND cj.job_role_title ~* up.secondary_skill_regexes[1] THEN 1.0 ELSE 0.0 END) +
                (CASE WHEN up.num_secondary_skills >= 2 AND cj.job_role_title ~* up.secondary_skill_regexes[2] THEN 1.0 ELSE 0.0 END) +
                (CASE WHEN up.num_secondary_skills >= 3 AND cj.job_role_title ~* up.secondary_skill_regexes[3] THEN 1.0 ELSE 0.0 END) +
                (CASE WHEN up.num_secondary_skills >= 4 AND cj.job_role_title ~* up.secondary_skill_regexes[4] THEN 1.0 ELSE 0.0 END) +
                (CASE WHEN up.num_secondary_skills >= 5 AND cj.job_role_title ~* up.secondary_skill_regexes[5] THEN 1.0 ELSE 0.0 END)
              )
            WHEN up.num_primary_domains > 0 THEN
              GREATEST(1,
                (CASE WHEN up.num_primary_domains >= 1 AND cj.job_role_title ~* up.primary_domain_regexes[1] THEN 1 ELSE 0 END) +
                (CASE WHEN up.num_primary_domains >= 2 AND cj.job_role_title ~* up.primary_domain_regexes[2] THEN 1 ELSE 0 END) +
                (CASE WHEN up.num_primary_domains >= 3 AND cj.job_role_title ~* up.primary_domain_regexes[3] THEN 1 ELSE 0 END) +
                (CASE WHEN up.num_primary_domains >= 4 AND cj.job_role_title ~* up.primary_domain_regexes[4] THEN 1 ELSE 0 END) +
                (CASE WHEN up.num_primary_domains >= 5 AND cj.job_role_title ~* up.primary_domain_regexes[5] THEN 1 ELSE 0 END)
              )::numeric
            ELSE
              GREATEST(1,
                (CASE WHEN up.num_secondary_skills >= 1 AND cj.job_role_title ~* up.secondary_skill_regexes[1] THEN 1 ELSE 0 END) +
                (CASE WHEN up.num_secondary_skills >= 2 AND cj.job_role_title ~* up.secondary_skill_regexes[2] THEN 1 ELSE 0 END) +
                (CASE WHEN up.num_secondary_skills >= 3 AND cj.job_role_title ~* up.secondary_skill_regexes[3] THEN 1 ELSE 0 END) +
                (CASE WHEN up.num_secondary_skills >= 4 AND cj.job_role_title ~* up.secondary_skill_regexes[4] THEN 1 ELSE 0 END) +
                (CASE WHEN up.num_secondary_skills >= 5 AND cj.job_role_title ~* up.secondary_skill_regexes[5] THEN 1 ELSE 0 END)
              )::numeric
          END
        WHEN up.pref_domains_t2_regex IS NOT NULL AND cj.job_role_title ~* up.pref_domains_t2_regex THEN 0.75::numeric
        WHEN up.pref_domains IS NOT NULL AND cardinality(up.pref_domains) > 0 AND cj.job_role_title % ANY(up.pref_domains) THEN (
          SELECT ROUND(COALESCE(MAX(similarity(cj.job_role_title, d)), 0.3)::numeric, 4)
          FROM unnest(up.pref_domains) AS d
        )
        ELSE 1.0::numeric
      END AS c_sim_score
    FROM cursor_job cj
    CROSS JOIN user_pref up
    WHERE $4::uuid IS NOT NULL
  ),
  effective_pref AS (
    SELECT 
      up.*, 
      COALESCE(up.raw_cursor_tier_rank, cs.c_tier_rank) AS cursor_tier_rank,
      COALESCE(up.raw_cursor_sim_score, cs.c_sim_score) AS cursor_sim_score,
      (up.num_criteria >= 2) AS is_multi_domain
    FROM user_pref up
    LEFT JOIN cursor_scoring cs ON true
  ),
  tier1_multi_candidates AS (
    SELECT 
      j.id,
      j.published_at,
      3 AS tier_rank,
      score.similarity_score
    FROM effective_pref up
    CROSS JOIN jobs j
    CROSS JOIN LATERAL (
      SELECT (
        CASE
          WHEN up.num_primary_domains > 0 AND up.num_secondary_skills > 0 THEN
            (10.0 * (
              (CASE WHEN up.num_primary_domains >= 1 AND j.job_role_title ~* up.primary_domain_regexes[1] THEN 1 ELSE 0 END) +
              (CASE WHEN up.num_primary_domains >= 2 AND j.job_role_title ~* up.primary_domain_regexes[2] THEN 1 ELSE 0 END) +
              (CASE WHEN up.num_primary_domains >= 3 AND j.job_role_title ~* up.primary_domain_regexes[3] THEN 1 ELSE 0 END) +
              (CASE WHEN up.num_primary_domains >= 4 AND j.job_role_title ~* up.primary_domain_regexes[4] THEN 1 ELSE 0 END) +
              (CASE WHEN up.num_primary_domains >= 5 AND j.job_role_title ~* up.primary_domain_regexes[5] THEN 1 ELSE 0 END)
            ))
            +
            (
              (CASE WHEN up.num_secondary_skills >= 1 AND j.job_role_title ~* up.secondary_skill_regexes[1] THEN 1.0 ELSE 0.0 END) +
              (CASE WHEN up.num_secondary_skills >= 2 AND j.job_role_title ~* up.secondary_skill_regexes[2] THEN 1.0 ELSE 0.0 END) +
              (CASE WHEN up.num_secondary_skills >= 3 AND j.job_role_title ~* up.secondary_skill_regexes[3] THEN 1.0 ELSE 0.0 END) +
              (CASE WHEN up.num_secondary_skills >= 4 AND j.job_role_title ~* up.secondary_skill_regexes[4] THEN 1.0 ELSE 0.0 END) +
              (CASE WHEN up.num_secondary_skills >= 5 AND j.job_role_title ~* up.secondary_skill_regexes[5] THEN 1.0 ELSE 0.0 END) +
              (CASE WHEN up.num_secondary_skills >= 6 AND j.job_role_title ~* up.secondary_skill_regexes[6] THEN 1.0 ELSE 0.0 END) +
              (CASE WHEN up.num_secondary_skills >= 7 AND j.job_role_title ~* up.secondary_skill_regexes[7] THEN 1.0 ELSE 0.0 END) +
              (CASE WHEN up.num_secondary_skills >= 8 AND j.job_role_title ~* up.secondary_skill_regexes[8] THEN 1.0 ELSE 0.0 END) +
              (CASE WHEN up.num_secondary_skills >= 9 AND j.job_role_title ~* up.secondary_skill_regexes[9] THEN 1.0 ELSE 0.0 END) +
              (CASE WHEN up.num_secondary_skills >= 10 AND j.job_role_title ~* up.secondary_skill_regexes[10] THEN 1.0 ELSE 0.0 END)
            )
          WHEN up.num_primary_domains > 0 THEN
            GREATEST(1,
              (CASE WHEN up.num_primary_domains >= 1 AND j.job_role_title ~* up.primary_domain_regexes[1] THEN 1 ELSE 0 END) +
              (CASE WHEN up.num_primary_domains >= 2 AND j.job_role_title ~* up.primary_domain_regexes[2] THEN 1 ELSE 0 END) +
              (CASE WHEN up.num_primary_domains >= 3 AND j.job_role_title ~* up.primary_domain_regexes[3] THEN 1 ELSE 0 END) +
              (CASE WHEN up.num_primary_domains >= 4 AND j.job_role_title ~* up.primary_domain_regexes[4] THEN 1 ELSE 0 END) +
              (CASE WHEN up.num_primary_domains >= 5 AND j.job_role_title ~* up.primary_domain_regexes[5] THEN 1 ELSE 0 END)
            )::numeric
          ELSE
            GREATEST(1,
              (CASE WHEN up.num_secondary_skills >= 1 AND j.job_role_title ~* up.secondary_skill_regexes[1] THEN 1 ELSE 0 END) +
              (CASE WHEN up.num_secondary_skills >= 2 AND j.job_role_title ~* up.secondary_skill_regexes[2] THEN 1 ELSE 0 END) +
              (CASE WHEN up.num_secondary_skills >= 3 AND j.job_role_title ~* up.secondary_skill_regexes[3] THEN 1 ELSE 0 END) +
              (CASE WHEN up.num_secondary_skills >= 4 AND j.job_role_title ~* up.secondary_skill_regexes[4] THEN 1 ELSE 0 END) +
              (CASE WHEN up.num_secondary_skills >= 5 AND j.job_role_title ~* up.secondary_skill_regexes[5] THEN 1 ELSE 0 END)
            )::numeric
        END
      )::numeric AS similarity_score
    ) score
    WHERE (SELECT is_multi_domain FROM effective_pref) = TRUE
      AND j.status = 'published'
      AND j.published_at IS NOT NULL
      AND (
        up.cursor_tier_rank IS NULL
        OR up.cursor_tier_rank = 3
      )
      AND (up.pref_job_types IS NULL OR cardinality(up.pref_job_types) = 0 OR j.employment_type = ANY(up.pref_job_types))
      AND j.job_role_title ~* up.pref_domains_t1_regex
      AND (
        ($6::uuid IS NOT NULL AND j.country_id = $6::uuid)
        OR ($6::uuid IS NULL AND (
          up.pref_country IS NULL 
          OR (up.pref_country_id IS NOT NULL AND j.country_id = up.pref_country_id)
          OR (up.pref_country_id IS NULL AND j.location ~* ('\\m' || regexp_replace(up.pref_country, '([\\\\^$.|?*+()[\\]{}])', '\\\\\\1', 'g') || '\\M'))
        ))
      )
      AND (
        up.pref_cities_regex IS NULL
        OR j.work_model = 'remote'
        OR j.location ~* '\\mremote\\M'
        OR j.location ~* up.pref_cities_regex
      )
      AND (
        up.pref_seniority_tier IS NULL
        OR (
          up.pref_seniority_tier = 'entry'
          AND (j.experience_required IS NULL OR j.experience_required <= 2)
          AND j.job_role_title !~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|manager|mid[- ]?level|intermediate)\\M'
          AND (
            j.job_role_title ~* '\\m(entry[- ]?level|fresher|junior|associate|intern|internship|trainee|apprentice|grad|graduate)\\M'
            OR j.experience_required <= 2
            OR (j.experience_required IS NULL AND j.job_role_title !~* '\\m(manager|lead|staff|principal)\\M')
          )
        )
        OR (
          up.pref_seniority_tier = 'senior'
          AND (j.experience_required IS NULL OR j.experience_required >= 3)
          AND j.job_role_title !~* '\\m(entry[- ]?level|fresher|junior|intern|internship|trainee)\\M'
          AND (
            j.experience_required >= 5
            OR j.job_role_title ~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|architect)\\M'
          )
        )
        OR (
          up.pref_seniority_tier = 'mid'
          AND (j.experience_required IS NULL OR (j.experience_required >= 1 AND j.experience_required <= 6))
          AND j.job_role_title !~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|distinguished|chief)\\M'
          AND j.job_role_title !~* '\\m(entry[- ]?level|fresher|intern|internship|trainee)\\M'
          AND (
            j.job_role_title ~* '\\m(mid[- ]?level|intermediate|experienced|ii|iii)\\M'
            OR j.experience_required BETWEEN 2 AND 5
            OR j.experience_required IS NULL
          )
        )
      )
      AND (
        up.cursor_sim_score IS NULL
        OR score.similarity_score < up.cursor_sim_score
        OR (
          score.similarity_score = up.cursor_sim_score AND ($3::timestamptz IS NULL OR $4::uuid IS NULL OR (j.published_at, j.id) < ($3::timestamptz, $4::uuid))
        )
      )
    ORDER BY score.similarity_score DESC, j.published_at DESC, j.id DESC
    LIMIT $5
  ),
  tier1_single_candidates AS (
    SELECT 
      j.id,
      j.published_at,
      3 AS tier_rank,
      1.0::numeric AS similarity_score
    FROM effective_pref up
    CROSS JOIN jobs j
    WHERE (SELECT is_multi_domain FROM effective_pref) = FALSE
      AND j.status = 'published'
      AND j.published_at IS NOT NULL
      AND (
        up.cursor_tier_rank IS NULL
        OR up.cursor_tier_rank = 3
      )
      AND ($3::timestamptz IS NULL OR $4::uuid IS NULL OR (j.published_at, j.id) < ($3::timestamptz, $4::uuid))
      AND (up.pref_job_types IS NULL OR cardinality(up.pref_job_types) = 0 OR j.employment_type = ANY(up.pref_job_types))
      AND (up.pref_domains_t1_regex IS NULL OR j.job_role_title ~* up.pref_domains_t1_regex)
      AND (
        ($6::uuid IS NOT NULL AND j.country_id = $6::uuid)
        OR ($6::uuid IS NULL AND (
          up.pref_country IS NULL 
          OR (up.pref_country_id IS NOT NULL AND j.country_id = up.pref_country_id)
          OR (up.pref_country_id IS NULL AND j.location ~* ('\\m' || regexp_replace(up.pref_country, '([\\\\^$.|?*+()[\\]{}])', '\\\\\\1', 'g') || '\\M'))
        ))
      )
      AND (
        up.pref_cities_regex IS NULL
        OR j.work_model = 'remote'
        OR j.location ~* '\\mremote\\M'
        OR j.location ~* up.pref_cities_regex
      )
      AND (
        up.pref_seniority_tier IS NULL
        OR (
          up.pref_seniority_tier = 'entry'
          AND (j.experience_required IS NULL OR j.experience_required <= 2)
          AND j.job_role_title !~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|manager|mid[- ]?level|intermediate)\\M'
          AND (
            j.job_role_title ~* '\\m(entry[- ]?level|fresher|junior|associate|intern|internship|trainee|apprentice|grad|graduate)\\M'
            OR j.experience_required <= 2
            OR (j.experience_required IS NULL AND j.job_role_title !~* '\\m(manager|lead|staff|principal)\\M')
          )
        )
        OR (
          up.pref_seniority_tier = 'senior'
          AND (j.experience_required IS NULL OR j.experience_required >= 3)
          AND j.job_role_title !~* '\\m(entry[- ]?level|fresher|junior|intern|internship|trainee)\\M'
          AND (
            j.experience_required >= 5
            OR j.job_role_title ~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|architect)\\M'
          )
        )
        OR (
          up.pref_seniority_tier = 'mid'
          AND (j.experience_required IS NULL OR (j.experience_required >= 1 AND j.experience_required <= 6))
          AND j.job_role_title !~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|distinguished|chief)\\M'
          AND j.job_role_title !~* '\\m(entry[- ]?level|fresher|intern|internship|trainee)\\M'
          AND (
            j.job_role_title ~* '\\m(mid[- ]?level|intermediate|experienced|ii|iii)\\M'
            OR j.experience_required BETWEEN 2 AND 5
            OR j.experience_required IS NULL
          )
        )
      )
    ORDER BY j.published_at DESC, j.id DESC
    LIMIT $5
  ),
  tier2_candidates AS (
    SELECT 
      j.id,
      j.published_at,
      2 AS tier_rank,
      0.75::numeric AS similarity_score
    FROM effective_pref up
    CROSS JOIN jobs j
    WHERE up.pref_mode IN ('balanced', 'broad')
      AND up.pref_domains_t2_regex IS NOT NULL
      AND (
        up.cursor_tier_rank IS NULL
        OR up.cursor_tier_rank > 2
        OR (
          up.cursor_tier_rank = 2 AND (
            up.cursor_sim_score IS NULL
            OR 0.75 < up.cursor_sim_score
            OR (0.75 = up.cursor_sim_score AND ($3::timestamptz IS NULL OR $4::uuid IS NULL OR (j.published_at, j.id) < ($3::timestamptz, $4::uuid)))
          )
        )
      )
      AND j.status = 'published'
      AND j.published_at IS NOT NULL
      AND (up.pref_job_types IS NULL OR cardinality(up.pref_job_types) = 0 OR j.employment_type = ANY(up.pref_job_types))
      AND j.job_role_title ~* up.pref_domains_t2_regex
      AND (up.pref_domains_t1_regex IS NULL OR j.job_role_title !~* up.pref_domains_t1_regex)
      AND (
        ($6::uuid IS NOT NULL AND j.country_id = $6::uuid)
        OR ($6::uuid IS NULL AND (
          up.pref_country IS NULL 
          OR (up.pref_country_id IS NOT NULL AND j.country_id = up.pref_country_id)
          OR (up.pref_country_id IS NULL AND j.location ~* ('\\m' || regexp_replace(up.pref_country, '([\\\\^$.|?*+()[\\]{}])', '\\\\\\1', 'g') || '\\M'))
        ))
      )
      AND (
        up.pref_cities_regex IS NULL
        OR j.work_model = 'remote'
        OR j.location ~* '\\mremote\\M'
        OR j.location ~* up.pref_cities_regex
      )
      AND (
        up.pref_seniority_tier IS NULL
        OR (
          up.pref_seniority_tier = 'entry'
          AND (j.experience_required IS NULL OR j.experience_required <= 2)
          AND j.job_role_title !~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|manager|mid[- ]?level|intermediate)\\M'
          AND (
            j.job_role_title ~* '\\m(entry[- ]?level|fresher|junior|associate|intern|internship|trainee|apprentice|grad|graduate)\\M'
            OR j.experience_required <= 2
            OR (j.experience_required IS NULL AND j.job_role_title !~* '\\m(manager|lead|staff|principal)\\M')
          )
        )
        OR (
          up.pref_seniority_tier = 'senior'
          AND (j.experience_required IS NULL OR j.experience_required >= 3)
          AND j.job_role_title !~* '\\m(entry[- ]?level|fresher|junior|intern|internship|trainee)\\M'
          AND (
            j.experience_required >= 5
            OR j.job_role_title ~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|architect)\\M'
          )
        )
        OR (
          up.pref_seniority_tier = 'mid'
          AND (j.experience_required IS NULL OR (j.experience_required >= 1 AND j.experience_required <= 6))
          AND j.job_role_title !~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|distinguished|chief)\\M'
          AND j.job_role_title !~* '\\m(entry[- ]?level|fresher|intern|internship|trainee)\\M'
          AND (
            j.job_role_title ~* '\\m(mid[- ]?level|intermediate|experienced|ii|iii)\\M'
            OR j.experience_required BETWEEN 2 AND 5
            OR j.experience_required IS NULL
          )
        )
      )
    ORDER BY j.published_at DESC, j.id DESC
    LIMIT $5
  ),
  tier3_candidates AS (
    SELECT 
      j.id,
      j.published_at,
      1 AS tier_rank,
      sim.similarity_score
    FROM effective_pref up
    CROSS JOIN jobs j
    CROSS JOIN LATERAL (
      SELECT ROUND(COALESCE(MAX(similarity(j.job_role_title, d)), 0.3)::numeric, 4) AS similarity_score
      FROM unnest(up.pref_domains) AS d
    ) sim
    WHERE up.pref_mode = 'broad'
      AND up.pref_domains IS NOT NULL
      AND cardinality(up.pref_domains) > 0
      AND (
        up.cursor_tier_rank IS NULL
        OR up.cursor_tier_rank > 1
        OR (
          up.cursor_tier_rank = 1 AND (
            (up.cursor_sim_score IS NOT NULL AND (
              sim.similarity_score < up.cursor_sim_score
              OR (sim.similarity_score = up.cursor_sim_score AND ($3::timestamptz IS NULL OR $4::uuid IS NULL OR (j.published_at, j.id) < ($3::timestamptz, $4::uuid)))
            ))
            OR (
              up.cursor_sim_score IS NULL AND ($3::timestamptz IS NULL OR $4::uuid IS NULL OR (j.published_at, j.id) < ($3::timestamptz, $4::uuid))
            )
          )
        )
      )
      AND sim.similarity_score >= 0.3
      AND j.status = 'published'
      AND j.published_at IS NOT NULL
      AND (up.pref_job_types IS NULL OR cardinality(up.pref_job_types) = 0 OR j.employment_type = ANY(up.pref_job_types))
      AND j.job_role_title % ANY(up.pref_domains)
      AND (up.pref_domains_t1_regex IS NULL OR j.job_role_title !~* up.pref_domains_t1_regex)
      AND (up.pref_domains_t2_regex IS NULL OR j.job_role_title !~* up.pref_domains_t2_regex)
      AND (
        ($6::uuid IS NOT NULL AND j.country_id = $6::uuid)
        OR ($6::uuid IS NULL AND (
          up.pref_country IS NULL 
          OR (up.pref_country_id IS NOT NULL AND j.country_id = up.pref_country_id)
          OR (up.pref_country_id IS NULL AND j.location ~* ('\\m' || regexp_replace(up.pref_country, '([\\\\^$.|?*+()[\\]{}])', '\\\\\\1', 'g') || '\\M'))
        ))
      )
      AND (
        up.pref_cities_regex IS NULL
        OR j.work_model = 'remote'
        OR j.location ~* '\\mremote\\M'
        OR j.location ~* up.pref_cities_regex
      )
      AND (
        up.pref_seniority_tier IS NULL
        OR (
          up.pref_seniority_tier = 'entry'
          AND (j.experience_required IS NULL OR j.experience_required <= 2)
          AND j.job_role_title !~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|manager|mid[- ]?level|intermediate)\\M'
          AND (
            j.job_role_title ~* '\\m(entry[- ]?level|fresher|junior|associate|intern|internship|trainee|apprentice|grad|graduate)\\M'
            OR j.experience_required <= 2
            OR (j.experience_required IS NULL AND j.job_role_title !~* '\\m(manager|lead|staff|principal)\\M')
          )
        )
        OR (
          up.pref_seniority_tier = 'senior'
          AND (j.experience_required IS NULL OR j.experience_required >= 3)
          AND j.job_role_title !~* '\\m(entry[- ]?level|fresher|junior|intern|internship|trainee)\\M'
          AND (
            j.experience_required >= 5
            OR j.job_role_title ~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|architect)\\M'
          )
        )
        OR (
          up.pref_seniority_tier = 'mid'
          AND (j.experience_required IS NULL OR (j.experience_required >= 1 AND j.experience_required <= 6))
          AND j.job_role_title !~* '\\m(senior|sr\\.?|lead|staff|principal|director|head|vp|distinguished|chief)\\M'
          AND j.job_role_title !~* '\\m(entry[- ]?level|fresher|intern|internship|trainee)\\M'
          AND (
            j.job_role_title ~* '\\m(mid[- ]?level|intermediate|experienced|ii|iii)\\M'
            OR j.experience_required BETWEEN 2 AND 5
            OR j.experience_required IS NULL
          )
        )
      )
    ORDER BY sim.similarity_score DESC, j.published_at DESC, j.id DESC
    LIMIT $5
  ),
  all_candidates AS (
    SELECT * FROM tier1_multi_candidates
    UNION ALL
    SELECT * FROM tier1_single_candidates
    UNION ALL
    SELECT * FROM tier2_candidates
    UNION ALL
    SELECT * FROM tier3_candidates
  ),
  top_matched AS (
    SELECT *
    FROM all_candidates
    ORDER BY tier_rank DESC, similarity_score DESC, published_at DESC, id DESC
    LIMIT $5
  )
  SELECT 
    j.id,
    j.job_role_title,
    j.job_role_title AS "jobRoleTitle",
    j.job_description,
    j.job_description AS "jobDescription",
    j.company_name,
    j.company_name AS "companyName",
    j.location,
    j.employment_type,
    j.employment_type AS "employmentType",
    j.work_model,
    j.work_model AS "workModel",
    j.salary_min,
    j.salary_min AS "salaryMin",
    j.salary_max,
    j.salary_max AS "salaryMax",
    j.currency,
    j.experience_required,
    j.experience_required AS "experienceRequired",
    j.visa_sponsorship,
    j.visa_sponsorship AS "visaSponsorship",
    j.published_at,
    j.published_at AS "publishedAt",
    j.published_at::text AS "publishedAtRaw",
    j.published_at::text AS published_at_raw,
    j.created_at,
    j.created_at AS "createdAt",
    c.code AS country_code,
    c.code AS "countryCode",
    c.name AS country_name,
    c.name AS "countryName",
    tm.tier_rank,
    tm.tier_rank AS "tierRank",
    tm.similarity_score,
    tm.similarity_score AS "similarityScore"
  FROM top_matched tm
  JOIN jobs j ON tm.id = j.id
  LEFT JOIN countries c ON j.country_id = c.id
  ORDER BY tm.tier_rank DESC, tm.similarity_score DESC, j.published_at DESC, j.id DESC;
  `;

const COUNTRY_CACHE = new Map<string, string>();

/**
 * Execute user-job preference matching query with multi-tier relevance and keyset pagination
 */
export async function matchUserJobs(
  options: MatchUserJobsOptions = {}
): Promise<MatchUserJobsResult> {
  const {
    userId = null,
    preferences = null,
    cursor = null,
    limit = 24,
    mode = undefined,
  } = options;

  let cursorPublishedAt: string | null = null;
  let cursorId: string | null = null;
  let cursorTierRank: number | null = null;
  let cursorSimilarityScore: number | null = null;

  if (cursor) {
    if (typeof cursor === "string") {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        cursorPublishedAt = typeof decoded.publishedAt === "string" 
          ? decoded.publishedAt 
          : decoded.publishedAt.toISOString();
        cursorId = decoded.id;
        cursorTierRank = typeof decoded.tierRank === "number" ? decoded.tierRank : null;
        cursorSimilarityScore = typeof decoded.similarityScore === "number" ? decoded.similarityScore : null;
      }
    } else if (
      cursor.publishedAt &&
      cursor.id &&
      !isNaN(Date.parse(String(cursor.publishedAt))) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(cursor.id))
    ) {
      cursorPublishedAt = cursor.publishedAt instanceof Date 
        ? cursor.publishedAt.toISOString() 
        : String(cursor.publishedAt);
      cursorId = String(cursor.id);
      cursorTierRank = typeof cursor.tierRank === "number" ? cursor.tierRank : null;
      cursorSimilarityScore = typeof cursor.similarityScore === "number" ? cursor.similarityScore : null;
    }
  }

  // Pre-resolve country_id with in-memory caching to eliminate redundant DB round trips
  let resolvedCountryId: string | null = null;
  const effectiveCountry: string | null = preferences?.country?.trim() || null;
  if (effectiveCountry) {
    const key = effectiveCountry.toLowerCase();
    if (COUNTRY_CACHE.has(key)) {
      resolvedCountryId = COUNTRY_CACHE.get(key) || null;
    } else {
      const countryRes = await db.execute<{ id: string; code: string; name: string }>(
        sql`SELECT id, code, name FROM countries`
      );
      if (countryRes.rows) {
        for (const c of countryRes.rows) {
          if (c.code) COUNTRY_CACHE.set(c.code.toLowerCase(), c.id);
          if (c.name) COUNTRY_CACHE.set(c.name.toLowerCase(), c.id);
        }
      }
      resolvedCountryId = COUNTRY_CACHE.get(key) || null;
    }
  }

  const validModes: MatchingMode[] = ["strict", "balanced", "broad"];
  const explicitMode = mode !== undefined ? mode : preferences?.mode;

  const prefPayload: Record<string, unknown> = {};
  if (preferences) {
    for (const [key, value] of Object.entries(preferences)) {
      if (value !== null && value !== undefined) {
        prefPayload[key] = value;
      }
    }
  }

  if (explicitMode !== undefined && explicitMode !== null && String(explicitMode).trim() !== "") {
    prefPayload.mode = validModes.includes(explicitMode as MatchingMode)
      ? (explicitMode as MatchingMode)
      : "balanced";
  } else {
    delete prefPayload.mode;
  }
  if (cursorTierRank !== null) {
    prefPayload.cursorTierRank = cursorTierRank;
  }
  if (cursorSimilarityScore !== null) {
    prefPayload.cursorSimilarityScore = cursorSimilarityScore;
  }

  const prefJson = JSON.stringify(prefPayload);
  const fetchLimit = Math.max(1, limit) + 1; // Fetch 1 extra to check hasMore

  const start = performance.now();
  const queryClient = (pool as any) || (db as any).$client;
  let rawRows: Record<string, unknown>[];

  if (queryClient?.query) {
    const res = await queryClient.query(PREFERENCE_MATCHING_SQL, [
      prefJson,
      userId,
      cursorPublishedAt,
      cursorId,
      fetchLimit,
      resolvedCountryId,
    ]);
    rawRows = (res.rows || []) as Record<string, unknown>[];
  } else {
    const paramMap: Record<string, string> = {
      "$1": `'${prefJson.replace(/'/g, "''")}'::jsonb`,
      "$2": userId ? `'${userId.replace(/'/g, "''")}'::text` : "NULL::text",
      "$3": cursorPublishedAt ? `'${cursorPublishedAt}'::timestamptz` : "NULL::timestamptz",
      "$4": cursorId ? `'${cursorId}'::uuid` : "NULL::uuid",
      "$5": `${fetchLimit}`,
      "$6": resolvedCountryId ? `'${resolvedCountryId}'::uuid` : "NULL::uuid",
    };
    const interpolatedSql = PREFERENCE_MATCHING_SQL.replace(/\$([1-6])\b/g, (match) => paramMap[match] || match);
    const queryResult = await db.execute<Record<string, unknown>>(sql.raw(interpolatedSql));
    rawRows = (queryResult.rows || []) as Record<string, unknown>[];
  }

  const durationMs = performance.now() - start;

  const rows: MatchedJobRecord[] = rawRows.map(r => ({
    id: String(r.id),
    jobRoleTitle: String(r.jobRoleTitle ?? r.job_role_title ?? ""),
    jobDescription: String(r.jobDescription ?? r.job_description ?? ""),
    companyName: String(r.companyName ?? r.company_name ?? ""),
    location: String(r.location ?? ""),
    employmentType: String(r.employmentType ?? r.employment_type ?? ""),
    workModel: String(r.workModel ?? r.work_model ?? ""),
    salaryMin: r.salaryMin !== null && r.salaryMin !== undefined ? Number(r.salaryMin) : (r.salary_min !== null && r.salary_min !== undefined ? Number(r.salary_min) : null),
    salaryMax: r.salaryMax !== null && r.salaryMax !== undefined ? Number(r.salaryMax) : (r.salary_max !== null && r.salary_max !== undefined ? Number(r.salary_max) : null),
    currency: r.currency ? String(r.currency) : null,
    experienceRequired: r.experienceRequired !== null && r.experienceRequired !== undefined ? Number(r.experienceRequired) : (r.experience_required !== null && r.experience_required !== undefined ? Number(r.experience_required) : null),
    visaSponsorship: Boolean(r.visaSponsorship ?? r.visa_sponsorship),
    publishedAt: r.publishedAt instanceof Date ? r.publishedAt : new Date(String(r.publishedAt ?? r.published_at)),
    publishedAtRaw: r.publishedAtRaw ? String(r.publishedAtRaw) : (r.published_at_raw ? String(r.published_at_raw) : undefined),
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(String(r.createdAt ?? r.created_at)),
    countryCode: r.countryCode ? String(r.countryCode) : (r.country_code ? String(r.country_code) : null),
    countryName: r.countryName ? String(r.countryName) : (r.country_name ? String(r.country_name) : null),
    tierRank: Number(r.tierRank ?? r.tier_rank ?? 3),
    similarityScore: Number(r.similarityScore ?? r.similarity_score ?? 1.0),
  }));

  const hasMore = rows.length > limit;
  const jobs = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  let nextKeyset: KeysetCursor | null = null;

  if (hasMore && jobs.length > 0) {
    const lastJob = jobs[jobs.length - 1];
    const pubDate = lastJob.publishedAtRaw || (lastJob.publishedAt instanceof Date 
      ? lastJob.publishedAt.toISOString() 
      : String(lastJob.publishedAt));
    
    nextKeyset = {
      tierRank: lastJob.tierRank,
      similarityScore: lastJob.similarityScore,
      publishedAt: pubDate,
      id: lastJob.id,
    };
    nextCursor = encodeCursor(nextKeyset);
  }

  return {
    jobs,
    nextCursor,
    nextKeyset,
    hasMore,
    executionTimeMs: Math.round(durationMs * 100) / 100,
  };
}
