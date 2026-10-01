DO $test$
DECLARE
    j uuid; j2 uuid; b uuid := gen_random_uuid();
    a uuid := gen_random_uuid(); a2 uuid := gen_random_uuid();
    g uuid := gen_random_uuid(); g2 uuid := gen_random_uuid(); g3 uuid := gen_random_uuid();
    review_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid();
    u text := 'resume-storage-check-' || gen_random_uuid()::text;
    body text := '# Verified fixture';
    audit jsonb;
    rejected boolean;
BEGIN
    SELECT id INTO j FROM public.jobs ORDER BY id LIMIT 1;
    SELECT id INTO j2 FROM public.jobs WHERE id <> j ORDER BY id LIMIT 1;
    IF j IS NULL OR j2 IS NULL THEN RAISE EXCEPTION 'Need two job fixtures'; END IF;
    BEGIN
        INSERT INTO public.user_pref_resumes(id,user_id,title,content)
        VALUES(b,u,'storage-check','# Source fixture');
        INSERT INTO public.applications(id,user_id,job_id) VALUES(a,u,j),(a2,u,j2);
        audit := jsonb_build_object('status','completed','resume_markdown',body,
                                   'source_hash','source-fixture','job_hash','job-fixture');
        INSERT INTO public.resume_generations(id,user_id,job_id,base_resume_id,version,status,
            resume_markdown,audit_json,source_hash,job_hash)
        VALUES(g,u,j,b,99,'completed',body,audit,'source-fixture','job-fixture'),
              (g2,u,j,b,99,'completed',body,audit,'source-fixture','job-fixture'),
              (g3,u,j2,b,99,'completed',body,audit,'source-fixture','job-fixture');
        IF (SELECT version FROM public.resume_generations WHERE id=g) <> 1
        OR (SELECT version FROM public.resume_generations WHERE id=g2) <> 2
        OR (SELECT version FROM public.resume_generations WHERE id=g3) <> 1
        THEN RAISE EXCEPTION 'Version allocation failed'; END IF;
        INSERT INTO public.resume_generations(id,user_id,job_id,base_resume_id,version,status,
            resume_markdown,audit_json,source_hash,job_hash)
        VALUES(g,u,j,b,99,'completed',body,audit,'source-fixture','job-fixture')
        ON CONFLICT (id) DO NOTHING;
        IF (SELECT count(*) FROM public.resume_generations WHERE user_id=u) <> 3
        THEN RAISE EXCEPTION 'Idempotent retry duplicated generation'; END IF;
        INSERT INTO public.resume_generation_submissions(application_id,generation_id) VALUES(a,g);
        IF (SELECT generation_id FROM public.resume_generation_submissions WHERE application_id=a) <> g
        THEN RAISE EXCEPTION 'Selection failed'; END IF;
        rejected := false;
        BEGIN
            UPDATE public.resume_generations SET resume_markdown='changed' WHERE id=g;
        EXCEPTION WHEN raise_exception THEN rejected := true; END;
        IF NOT rejected THEN RAISE EXCEPTION 'Overwrite allowed'; END IF;
        rejected := false;
        BEGIN
            INSERT INTO public.resume_generations(id,user_id,job_id,base_resume_id,version,status,
                resume_markdown,audit_json,source_hash,job_hash)
            VALUES(other_id,u||'-other',j,b,1,'completed',body,audit,'source-fixture','job-fixture');
        EXCEPTION WHEN raise_exception THEN rejected := true; END;
        IF NOT rejected THEN RAISE EXCEPTION 'Cross-user base resume allowed'; END IF;
        rejected := false;
        BEGIN
            UPDATE public.resume_generation_submissions SET generation_id=g3 WHERE application_id=a;
        EXCEPTION WHEN raise_exception THEN rejected := true; END;
        IF NOT rejected THEN RAISE EXCEPTION 'Cross-role selection allowed'; END IF;
        audit := jsonb_set(audit,'{status}','"needs_review"');
        INSERT INTO public.resume_generations(id,user_id,job_id,version,status,
            resume_markdown,audit_json,source_hash,job_hash)
        VALUES(review_id,u,j,1,'needs_review',body,audit,'source-fixture','job-fixture');
        rejected := false;
        BEGIN
            UPDATE public.resume_generation_submissions SET generation_id=review_id WHERE application_id=a;
        EXCEPTION WHEN raise_exception THEN rejected := true; END;
        IF NOT rejected THEN RAISE EXCEPTION 'Unreviewed selection allowed'; END IF;
        rejected := false;
        BEGIN
            INSERT INTO public.resume_generations(id,user_id,job_id,version,status,
                resume_markdown,audit_json,source_hash,job_hash)
            VALUES(gen_random_uuid(),u,j,1,'completed','different',audit,'source-fixture','job-fixture');
        EXCEPTION WHEN raise_exception THEN rejected := true; END;
        IF NOT rejected THEN RAISE EXCEPTION 'Audit divergence allowed'; END IF;
        IF (SELECT generation_id FROM public.resume_generation_submissions WHERE application_id=a) <> g
        THEN RAISE EXCEPTION 'Existing selection changed by generation'; END IF;
        RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='fixture rollback';
    EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
    END;
    IF EXISTS(SELECT 1 FROM public.resume_generations WHERE user_id=u)
       OR EXISTS(SELECT 1 FROM public.applications WHERE id=a)
       OR EXISTS(SELECT 1 FROM public.user_pref_resumes WHERE id=b)
    THEN RAISE EXCEPTION 'Fixtures were not rolled back'; END IF;
END
$test$;
