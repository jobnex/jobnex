-- Shared read guard. SECURITY INVOKER (the default) retains existing table
-- permissions. No generation, request, wallet or saved-resume row is changed.
CREATE OR REPLACE FUNCTION public.resume_generation_is_publishable(generation_id uuid, owner_id text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.resume_generations g
        JOIN public.resume_generation_requests r ON r.id=g.id AND r.user_id=g.user_id
            AND r.job_id=g.job_id AND r.base_resume_id IS NOT DISTINCT FROM g.base_resume_id
        WHERE g.id=generation_id AND g.user_id=owner_id
            AND ((r.status='completed' AND r.credit_state='consumed' AND g.status IN ('completed','completed_with_estimates'))
                OR (r.status='needs_review' AND r.credit_state IN ('consumed','released') AND g.status='needs_review'))
            AND length(btrim(g.resume_markdown))>0
            AND g.audit_json->>'status'=g.status
            AND g.audit_json->>'resume_markdown'=g.resume_markdown
            AND g.audit_json->>'source_hash'=g.source_hash AND g.audit_json->>'job_hash'=g.job_hash
            AND jsonb_typeof(g.audit_json->'usage')='array' AND g.audit_json->'usage'<>'[]'::jsonb
            AND jsonb_typeof(g.audit_json->'compliance_ledger')='array'
            AND g.audit_json->'compliance_ledger'<>'[]'::jsonb
            AND NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(CASE
                    WHEN jsonb_typeof(g.audit_json->'compliance_ledger')='array'
                    THEN g.audit_json->'compliance_ledger' ELSE '[]'::jsonb END) AS c
                WHERE NOT COALESCE(
                    jsonb_typeof(c->'code')='string' AND length(c->>'code')>0
                    AND jsonb_typeof(c->'passed')='boolean'
                    AND c->>'severity' IN ('error','warning','info')
                    AND (c->'passed'='true'::jsonb OR c->>'severity'<>'error'
                        OR (g.status='needs_review' AND c->>'code' IN (
                            'length.word_count','length.fit_unavailable','experience.bullet_count',
                            'projects.bullet_count','projects.purpose_order','skills.category_count',
                            'experience.metric_count','projects.metric_count'))), false)
            )
    );
$$;

CREATE OR REPLACE FUNCTION public.resume_saved_markdown_is_publishable(owner_id text, selected_job uuid, markdown text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
    -- A later verified generation may legitimately have the same text as an
    -- older rejected attempt. Use the newest matching provenance, not any old failure.
    SELECT length(btrim(markdown))>0 AND COALESCE((
        SELECT public.resume_generation_is_publishable(g.id,owner_id)
        FROM public.resume_generations g WHERE g.user_id=owner_id AND g.job_id=selected_job
            AND (g.resume_markdown=markdown OR g.audit_json#>>'{manual_edit,markdown}'=markdown)
        ORDER BY g.version DESC LIMIT 1
    ),true);
$$;
