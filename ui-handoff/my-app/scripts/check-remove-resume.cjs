const assert=require('node:assert/strict');
const path=require('node:path');
const {PGlite}=require(path.resolve(__dirname,'../scratch/postgres-test/node_modules/@electric-sql/pglite'));
const {load}=require('./load-ts.cjs');
(async()=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE user_pref_resumes(user_id text,file_key text,file_name text);
      CREATE TABLE user_job_preferences(user_id text,active_resume_id text,resume_details jsonb,preferences jsonb,updated_at timestamptz);
      CREATE TABLE resume_generation_requests(id text,user_id text,status text);`);
    const api=load('lib/resume-imports.ts',{'@/lib/db':{pool:{connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}})}},
      '@/lib/storage/r2':{},'@/app/actions/storage':{},'@/lib/profile-service':{}});
    const seed=async()=>{
      await db.exec(`INSERT INTO user_pref_resumes VALUES('owner','old.pdf','old.pdf');
        INSERT INTO user_job_preferences VALUES('owner','base','{"text":"source"}','{"resumeUploaded":true}',now());`);
    };
    await seed();
    await db.exec(`INSERT INTO user_pref_resumes VALUES('other','other.pdf','other.pdf');
      INSERT INTO resume_generation_requests VALUES('job','owner','running');`);
    await assert.rejects(api.removeActiveResume('owner'),/generation to finish/);
    assert.equal((await db.query("SELECT * FROM user_pref_resumes WHERE user_id='owner'")).rows.length,1);
    await db.exec('DELETE FROM resume_generation_requests');
    // Actual PostgreSQL transaction, without the new migration/table.
    await api.removeActiveResume('owner');
    assert.equal((await db.query("SELECT * FROM user_pref_resumes WHERE user_id='owner'")).rows.length,0);
    let prefs=(await db.query("SELECT * FROM user_job_preferences WHERE user_id='owner'")).rows[0];
    assert.equal(prefs.active_resume_id,null);assert.deepEqual(prefs.resume_details,{});assert.equal(prefs.preferences.resumeUploaded,false);
    assert.equal((await db.query("SELECT * FROM user_pref_resumes WHERE user_id='other'")).rows.length,1);
    await db.exec(`DELETE FROM user_job_preferences WHERE user_id='owner';
      CREATE TABLE resume_imports(user_id text,object_key text,file_name text,status text,reason_code text);`);
    await seed();await api.removeActiveResume('owner');
    const retired=(await db.query('SELECT * FROM resume_imports')).rows;
    assert.equal(retired.length,1);assert.equal(retired[0].object_key,'old.pdf');assert.equal(retired[0].reason_code,'USER_REMOVED');
    await api.removeActiveResume('owner');
    assert.equal((await db.query('SELECT * FROM resume_imports')).rows.length,1);
    console.log('REMOVE_RESUME_PASSED');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exit(1);});
