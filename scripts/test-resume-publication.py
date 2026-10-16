"""Real PostgreSQL read-policy tests on synthetic TEMP data; always rollback."""
from pathlib import Path
from uuid import uuid4
import json
import os
import psycopg
from psycopg.types.json import Jsonb

root=Path(__file__).resolve().parents[1]
sql=(root/'services/resume-tailor/migrations/20261016_resume_publication_guard.sql').read_text()
for name in ['resume_generation_is_publishable','resume_saved_markdown_is_publishable','resume_generations','resume_generation_requests']:
    sql=sql.replace('public.'+name, 'pg_temp.'+name)
count=0
with psycopg.connect(os.environ['DATABASE_URL'],connect_timeout=15) as db:
    db.execute("SET statement_timeout='10s'")
    db.execute('CREATE TEMP TABLE resume_generations (LIKE public.resume_generations INCLUDING DEFAULTS) ON COMMIT DROP')
    db.execute('CREATE TEMP TABLE resume_generation_requests (LIKE public.resume_generation_requests INCLUDING DEFAULTS) ON COMMIT DROP')
    db.execute(sql)
    identity,job,base=uuid4(),uuid4(),uuid4()
    audit={'status':'completed','resume_markdown':'Original generated text','source_hash':'source','job_hash':'job',
           'usage':[{'stage':'mock'}],'compliance_ledger':[{'code':'claim.evidence','passed':True,'severity':'error'}]}
    db.execute('''INSERT INTO pg_temp.resume_generations
        (id,user_id,job_id,base_resume_id,version,status,resume_markdown,audit_json,source_hash,job_hash)
        VALUES(%s,'synthetic-owner',%s,%s,1,'completed','Original generated text',%s,'source','job')''',(identity,job,base,Jsonb(audit)))
    db.execute('''INSERT INTO pg_temp.resume_generation_requests
        (id,user_id,job_id,base_resume_id,idempotency_key,source_text,job_description,include_summary,status,credit_state,credit_cost)
        VALUES(%s,'synthetic-owner',%s,%s,%s,'source','job',true,'completed','consumed',1)''',(identity,job,base,uuid4()))
    def check(expected, owner='synthetic-owner'):
        global count
        assert db.execute('SELECT pg_temp.resume_generation_is_publishable(%s,%s)',(identity,owner)).fetchone()[0] is expected
        count+=1
    check(True); check(False,'other-owner')
    for state,credit in [('failed','released'),('queued','held'),('running','held'),('completed','released')]:
        with db.transaction(force_rollback=True):
            db.execute('UPDATE pg_temp.resume_generation_requests SET status=%s,credit_state=%s',(state,credit))
            check(False)
    for bad in [None,{},[],[None],[{}],[{'code':'claim.evidence','passed':False,'severity':'error'}],
                [{'code':'claim.evidence','passed':'true','severity':'error'}]]:
        with db.transaction(force_rollback=True):
            db.execute("UPDATE pg_temp.resume_generations SET audit_json=jsonb_set(audit_json,'{compliance_ledger}',%s)",(Jsonb(bad),))
            check(False)
    for field,value in [('status','failed'),('resume_markdown','wrong'),('source_hash','wrong'),('job_hash','wrong'),('usage',[])]:
        with db.transaction(force_rollback=True):
            db.execute('UPDATE pg_temp.resume_generations SET audit_json=jsonb_set(audit_json,%s,%s)',([field],Jsonb(value)))
            check(False)
    for code,allowed in [('length.word_count',True),('length.fit_unavailable',True),('claim.evidence',False),('render.role_entities',False)]:
        with db.transaction(force_rollback=True):
            db.execute("UPDATE pg_temp.resume_generation_requests SET status='needs_review'")
            db.execute("UPDATE pg_temp.resume_generations SET status='needs_review',audit_json=audit_json || %s",
                       (Jsonb({**audit,'status':'needs_review','compliance_ledger':[{'code':code,'passed':False,'severity':'error'}]}),))
            check(allowed)
    with db.transaction(force_rollback=True):
        db.execute('UPDATE pg_temp.resume_generation_requests SET job_id=%s',(uuid4(),)); check(False)
    with db.transaction(force_rollback=True):
        db.execute('UPDATE pg_temp.resume_generation_requests SET base_resume_id=%s',(uuid4(),)); check(False)
    def saved(markdown):
        return db.execute('SELECT pg_temp.resume_saved_markdown_is_publishable(%s,%s,%s)',('synthetic-owner',job,markdown)).fetchone()[0]
    assert saved('Original generated text') is True; count+=1
    with db.transaction(force_rollback=True):
        db.execute("UPDATE pg_temp.resume_generation_requests SET status='failed',credit_state='released'")
        assert saved('Original generated text') is False; count+=1
        assert saved('Explicitly edited working copy') is True; count+=1
        assert saved('') is False; count+=1
        newer=uuid4()
        db.execute('''INSERT INTO pg_temp.resume_generations
            (id,user_id,job_id,base_resume_id,version,status,resume_markdown,audit_json,source_hash,job_hash)
            VALUES(%s,'synthetic-owner',%s,%s,2,'completed','Original generated text',%s,'source','job')''',(newer,job,base,Jsonb(audit)))
        db.execute('''INSERT INTO pg_temp.resume_generation_requests
            (id,user_id,job_id,base_resume_id,idempotency_key,source_text,job_description,include_summary,status,credit_state,credit_cost)
            VALUES(%s,'synthetic-owner',%s,%s,%s,'source','job',true,'completed','consumed',1)''',(newer,job,base,uuid4()))
        assert saved('Original generated text') is True; count+=1
        db.execute("UPDATE pg_temp.resume_generation_requests SET status='failed',credit_state='released' WHERE id=%s",(newer,))
        assert saved('Original generated text') is False; count+=1
    db.rollback()
print(json.dumps({'publication_checks':count,'customer_rows_changed':0,'public_functions_changed':0}))
