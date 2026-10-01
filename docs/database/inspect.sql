-- Read-only inspection for trail_dev / production / neondb.
-- Confirm the selected connection before running. No personal row contents.
BEGIN READ ONLY;

SELECT current_database(), now() AS inspected_at;

SELECT table_schema, table_name,
       string_agg(column_name || ':' || data_type, ', ' ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_schema IN ('public', 'matching', 'role_grouping')
GROUP BY table_schema, table_name
ORDER BY table_schema, table_name;

SELECT count(*) AS jobs,
       count(*) FILTER (WHERE status = 'published') AS published,
       count(*) FILTER (WHERE btrim(job_description) = '') AS empty_descriptions,
       count(*) FILTER (WHERE external_apply_url IS NULL
         OR btrim(external_apply_url) = '' OR external_apply_url = 'https://google.com') AS missing_or_placeholder_apply_url,
       count(*) FILTER (WHERE visa_sponsorship_status = 'unknown') AS visa_unknown
FROM public.jobs;

SELECT count(*) AS duplicate_url_groups, coalesce(sum(n - 1), 0) AS extra_rows
FROM (
    SELECT external_apply_url, count(*) AS n
    FROM public.jobs
    WHERE external_apply_url IS NOT NULL AND btrim(external_apply_url) <> ''
      AND external_apply_url <> 'https://google.com'
    GROUP BY external_apply_url HAVING count(*) > 1
) AS duplicates;

SELECT status, credit_state, error_code, count(*) AS requests
FROM public.resume_generation_requests
GROUP BY status, credit_state, error_code;

SELECT count(*) AS generated_resumes FROM public.resume_generations;
SELECT status, count(*) AS rows FROM matching.results GROUP BY status;
SELECT count(*) AS skill_relationships FROM public.job_skills;

SELECT count(*) AS queue_rows,
       count(*) FILTER (WHERE due_at <= now() AND attempts < 5) AS ready,
       count(*) FILTER (WHERE attempts >= 5) AS retry_exhausted
FROM public.visa_processing_queue;

SELECT count(*) AS orphan_profiles
FROM public.user_profiles AS profile
WHERE NOT EXISTS (
    SELECT 1 FROM neon_auth."user" AS auth_user
    WHERE auth_user.id::text = profile.user_id
);

COMMIT;
