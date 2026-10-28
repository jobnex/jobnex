-- Preserve generated content and original audit evidence. Permit only the
-- separately labelled working copy used by authenticated Save/PDF routes.
CREATE OR REPLACE FUNCTION public.guard_resume_generation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- ON DELETE SET NULL must change only the foreign key, even for rows
        -- whose base was previously deleted. It must not permit other rewrites.
        IF OLD.base_resume_id IS NOT NULL AND NEW.base_resume_id IS NULL
            AND (to_jsonb(NEW) - 'base_resume_id') IS NOT DISTINCT FROM
                (to_jsonb(OLD) - 'base_resume_id') THEN
            RETURN NEW;
        END IF;
        IF (to_jsonb(NEW) - 'audit_json') IS NOT DISTINCT FROM
               (to_jsonb(OLD) - 'audit_json')
            AND (NEW.audit_json - 'manual_edit') IS NOT DISTINCT FROM
                (OLD.audit_json - 'manual_edit')
            AND jsonb_typeof(NEW.audit_json->'manual_edit') = 'object'
            AND ((NEW.audit_json->'manual_edit') - ARRAY['markdown','templateId','savedAt']) = '{}'::jsonb
            AND jsonb_typeof(NEW.audit_json#>'{manual_edit,markdown}') = 'string'
            AND length(btrim(NEW.audit_json#>>'{manual_edit,markdown}')) BETWEEN 1 AND 200000
            AND jsonb_typeof(NEW.audit_json#>'{manual_edit,templateId}') = 'string'
            AND length(btrim(NEW.audit_json#>>'{manual_edit,templateId}')) BETWEEN 1 AND 80
            AND jsonb_typeof(NEW.audit_json#>'{manual_edit,savedAt}') = 'string'
            AND length(btrim(NEW.audit_json#>>'{manual_edit,savedAt}')) BETWEEN 1 AND 80 THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Resume generations cannot be overwritten; create a new generation';
    END IF;
    IF NEW.base_resume_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.user_pref_resumes
        WHERE id = NEW.base_resume_id AND user_id = NEW.user_id
    ) THEN
        RAISE EXCEPTION 'Base resume does not belong to this user';
    END IF;
    IF NEW.audit_json->>'status' IS DISTINCT FROM NEW.status
        OR NEW.audit_json->>'resume_markdown' IS DISTINCT FROM NEW.resume_markdown
        OR NEW.audit_json->>'source_hash' IS DISTINCT FROM NEW.source_hash
        OR NEW.audit_json->>'job_hash' IS DISTINCT FROM NEW.job_hash THEN
        RAISE EXCEPTION 'Resume generation and audit must agree';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id || ':' || NEW.job_id::text, 0));
    SELECT COALESCE(MAX(version), 0) + 1 INTO NEW.version
    FROM public.resume_generations WHERE user_id = NEW.user_id AND job_id = NEW.job_id;
    RETURN NEW;
END;
$$;
