"""Exercise the actual PostgreSQL trigger on disposable synthetic TEMP rows.

Requires DATABASE_URL. No customer rows or persistent functions are changed;
the outer transaction always rolls back. Run with --deployed after migration
to require the installed function to match this migration's behavior as well.
"""
from pathlib import Path
import json
import os
import sys
from uuid import uuid4

import psycopg
from psycopg.types.json import Jsonb

migration = (Path(__file__).resolve().parents[1] / 'services/resume-tailor/migrations/20261016_resume_manual_edit_guard.sql').read_text()
checks = 0
with psycopg.connect(os.environ['DATABASE_URL'], connect_timeout=15) as db:
    db.execute("SET statement_timeout='15s'")
    deployed = db.execute("SELECT pg_get_functiondef('public.guard_resume_generation()'::regprocedure)").fetchone()[0]
    db.execute('CREATE TEMP TABLE generation_guard_probe (LIKE public.resume_generations INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP')
    probe_id = uuid4()
    db.execute('''INSERT INTO generation_guard_probe
        (id,user_id,job_id,base_resume_id,version,status,resume_markdown,audit_json,source_hash,job_hash)
        VALUES (%s,'synthetic-guard-test',%s,%s,1,'completed','Original generated text',%s,'source-test','job-test')''',
        (probe_id, uuid4(), uuid4(), Jsonb({'status':'completed','resume_markdown':'Original generated text',
                                          'source_hash':'source-test','job_hash':'job-test','evidence':['original']})))

    def install(definition):
        db.execute('DROP TRIGGER IF EXISTS probe_guard ON generation_guard_probe')
        db.execute(definition.replace('public.guard_resume_generation()', 'pg_temp.guard_resume_generation()', 1))
        db.execute('CREATE TRIGGER probe_guard BEFORE UPDATE ON generation_guard_probe FOR EACH ROW EXECUTE FUNCTION pg_temp.guard_resume_generation()')

    manual = {'markdown':'Edited working copy','templateId':'modern-ivy','savedAt':'2026-10-16T12:00:00Z'}

    def attempt(sql, params=(), allowed=False):
        global checks
        rejected = False
        try:
            with db.transaction(force_rollback=True):
                db.execute(sql, params)
        except psycopg.errors.RaiseException:
            rejected = True
        assert rejected != allowed, f'Guard result differs from expectation: {sql}'
        checks += 1

    edit_sql = "UPDATE generation_guard_probe SET audit_json=audit_json || jsonb_build_object('manual_edit',%s::jsonb)"
    if '--deployed' not in sys.argv:
        install(deployed)
        attempt(edit_sql, (Jsonb(manual),))  # Reproduce the deployed Save failure.

    def exercise(definition):
        install(definition)
        attempt(edit_sql, (Jsonb(manual),), allowed=True)
        for field, value in [('resume_markdown', 'Changed generation'), ('status','failed'),
                             ('source_hash','changed'), ('job_hash','changed'), ('user_id','another-user')]:
            attempt(f'UPDATE generation_guard_probe SET {field}=%s', (value,))
        attempt('UPDATE generation_guard_probe SET version=version+1')
        attempt('UPDATE generation_guard_probe SET job_id=%s', (uuid4(),))
        attempt('UPDATE generation_guard_probe SET created_at=now()+interval \'1 hour\'')
        attempt("UPDATE generation_guard_probe SET audit_json=audit_json || '{\"evidence\":[]}'::jsonb")
        for bad in [None, {}, {**manual,'markdown':''}, {**manual,'markdown':{}},
                    {**manual,'extra':'unsupported'}, {**manual,'templateId':''}, {**manual,'savedAt':None}]:
            attempt(edit_sql, (Jsonb(bad),))
        attempt('UPDATE generation_guard_probe SET base_resume_id=NULL', allowed=True)
        attempt("UPDATE generation_guard_probe SET base_resume_id=NULL,status='failed'")
        # Simulate an already-deleted base. It must not make the row mutable.
        with db.transaction(force_rollback=True):
            db.execute('UPDATE generation_guard_probe SET base_resume_id=NULL')
            attempt('UPDATE generation_guard_probe SET resume_markdown=%s', ('Changed generation',))
            attempt(edit_sql, (Jsonb(manual),), allowed=True)
        with db.transaction(force_rollback=True):
            db.execute(edit_sql, (Jsonb(manual),))
            attempt(edit_sql, (Jsonb({**manual, 'markdown':'Second edit'}),), allowed=True)
            attempt("UPDATE generation_guard_probe SET audit_json=audit_json-'manual_edit'")

    exercise(migration)
    if '--deployed' in sys.argv:
        exercise(deployed)
    db.rollback()
print(json.dumps({'postgres_guard_checks':checks, 'customer_rows_changed':0,
                  'persistent_functions_changed':0, 'deployed_guard_verified':'--deployed' in sys.argv}))
