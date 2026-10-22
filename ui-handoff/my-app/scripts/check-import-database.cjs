const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const {PGlite}=require(path.join(root,'scratch/postgres-test/node_modules/@electric-sql/pglite'));
const {pgcrypto}=require(path.join(root,'scratch/postgres-test/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.cjs'));
const {load}=require('./load-ts.cjs');
const {sourceDigest}=load('lib/resume-admission.ts');
const crypto=require('node:crypto');
const id='22222222-2222-4222-8222-222222222222',base='33333333-3333-4333-8333-333333333333';
const user='11111111-1111-4111-8111-111111111111';
(async()=>{
  const db=new PGlite({extensions:{pgcrypto}});
  try{
    await db.exec(`CREATE TABLE user_pref_resumes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text,file_key text,content text);
      CREATE TABLE user_job_preferences(user_id text,active_resume_id uuid);
      CREATE TABLE resume_generation_requests(id uuid DEFAULT gen_random_uuid(),user_id text,base_resume_id uuid,source_text text);`);
    const migration=fs.readFileSync(path.join(root,'drizzle/strict-resume-imports.sql'),'utf8');
    await db.exec(migration);await db.exec(migration); // rerunning deployment is safe
    const source='# Example Candidate\nExperience';
    await db.query('INSERT INTO user_pref_resumes VALUES($1,$2,$3,$4)',[base,user,'file.pdf',source]);
    await db.query('INSERT INTO user_job_preferences VALUES($1,$2)',[user,base]);
    const insert=()=>db.query('INSERT INTO resume_generation_requests(user_id,base_resume_id,source_text) VALUES($1,$2,$3) RETURNING source_import_id',[user,base,source]);
    await assert.rejects(insert());
    await db.query(`INSERT INTO resume_imports(id,user_id,object_key,file_name,status,validator_version,content_sha256)
      VALUES($1,$2,'file.pdf','file.pdf','accepted','single-column-v1',$3)`,[id,user,sourceDigest(source)]);
    await assert.rejects(insert());
    await db.query("UPDATE resume_imports SET status='confirmed' WHERE id=$1",[id]);
    assert.equal((await insert()).rows[0].source_import_id,id);
    assert.equal((await db.query('SELECT resume_source_is_admitted($1,$2,$3) AS allowed',[user,source,id])).rows[0].allowed,true);
    for(const [other,content] of [['other',source],[user,source+' changed']]){
      assert.equal((await db.query('SELECT resume_source_is_admitted($1,$2,$3) AS allowed',[other,content,id])).rows[0].allowed,false);
    }
    await db.query("UPDATE resume_imports SET validator_version='old' WHERE id=$1",[id]);
    await assert.rejects(insert());
    await db.query("UPDATE resume_imports SET validator_version='single-column-v1' WHERE id=$1",[id]);
    await db.query('UPDATE user_pref_resumes SET content=$1 WHERE id=$2',[source+' edited',base]);
    await assert.rejects(insert());
    // Saved request admission survives later active-base replacement.
    assert.equal((await db.query('SELECT resume_source_is_admitted($1,$2,$3) AS allowed',[user,source,id])).rows[0].allowed,true);
    await db.exec(`ALTER TABLE user_pref_resumes ADD COLUMN title text, ADD COLUMN file_name text, ADD COLUMN file_url text,
      ADD COLUMN file_size integer,ADD COLUMN is_primary boolean,ADD COLUMN parsed_data jsonb,ADD COLUMN updated_at timestamptz;
      CREATE UNIQUE INDEX base_user ON user_pref_resumes(user_id);
      ALTER TABLE user_job_preferences ADD COLUMN preferences jsonb DEFAULT '{}',ADD COLUMN resume_details jsonb,
      ADD COLUMN resume_details_created_at timestamptz,ADD COLUMN resume_details_updated_at timestamptz,ADD COLUMN updated_at timestamptz;
      CREATE UNIQUE INDEX pref_user ON user_job_preferences(user_id);
      ALTER TABLE resume_generation_requests ADD COLUMN status text;`);
    let failPublication=false;
    const execute=(sql,args)=>{
      if(failPublication&&sql.includes("UPDATE resume_imports SET status='confirmed'"))throw Error('simulated publication failure');
      return db.query(sql,args);
    };
    const apiPool={query:execute,connect:async()=>({query:execute,release:()=>{}})};
    const bytes=Buffer.from('%PDF-local-test');const fileHash=crypto.createHash('sha256').update(bytes).digest('hex');
    const candidate='44444444-4444-4444-8444-444444444444';
    const key=`resume_imports/${user}/new.pdf`;
    const markdown=fs.readFileSync(path.join(__dirname,'fixtures/resume-regression.md'),'utf8').trim();
    await db.query(`INSERT INTO resume_imports(id,user_id,object_key,file_name,baseline_key,status,validator_version,file_sha256,baseline_content_sha256)
      VALUES($1,$2,$3,'new.pdf','file.pdf','accepted','single-column-v1',$4,$5)`,[candidate,user,key,fileHash,sourceDigest(source+' edited')]);
    class Command{constructor(input){this.input=input;}}
    const api=load('lib/resume-imports.ts',{'@/lib/db':{pool:apiPool},'@/lib/storage/r2':{
      r2Client:{send:async()=>({ContentLength:bytes.length,Body:{transformToByteArray:async()=>bytes}})},R2_BUCKET_NAME:'test'},
      '@aws-sdk/client-s3':{GetObjectCommand:Command,PutObjectCommand:Command,DeleteObjectCommand:Command},'@/app/actions/storage':{},'@/lib/profile-service':{}});
    const activated=await api.confirmResumeImport(user,candidate,1,markdown);assert.equal(activated.success,true);
    assert.notEqual(activated.objectKey,key);
    assert.equal((await db.query('SELECT file_key FROM user_pref_resumes WHERE user_id=$1',[user])).rows[0].file_key,activated.objectKey);
    assert.equal((await db.query('SELECT resume_source_is_admitted($1,$2,$3) AS allowed',[user,markdown,candidate])).rows[0].allowed,true);
    const stale='55555555-5555-4555-8555-555555555555';
    await db.query(`INSERT INTO resume_imports(id,user_id,object_key,file_name,baseline_key,status,validator_version,file_sha256)
      VALUES($1,$2,$3,'other.pdf','file.pdf','accepted','single-column-v1',$4)`,[stale,user,key+'other',fileHash]);
    await assert.rejects(api.confirmResumeImport(user,stale,1,markdown),/another tab/);
    assert.equal((await db.query('SELECT file_key FROM user_pref_resumes WHERE user_id=$1',[user])).rows[0].file_key,activated.objectKey);
    await assert.rejects(api.confirmResumeImport('other',candidate,1,markdown));
    const failed='66666666-6666-4666-8666-666666666666';
    await db.query(`INSERT INTO resume_imports(id,user_id,object_key,file_name,baseline_key,status,validator_version,file_sha256,baseline_content_sha256)
      VALUES($1,$2,$3,'rollback.pdf',$4,'accepted','single-column-v1',$5,$6)`,[failed,user,key+'rollback',activated.objectKey,fileHash,sourceDigest(markdown)]);
    failPublication=true;
    await assert.rejects(api.confirmResumeImport(user,failed,1,markdown.replace('Example Candidate','Rolled Back Candidate')),/publication failure/);
    failPublication=false;
    const retained=(await db.query('SELECT file_key,content FROM user_pref_resumes WHERE user_id=$1',[user])).rows[0];
    assert.equal(retained.file_key,activated.objectKey);assert.equal(retained.content,markdown);
    assert.equal((await db.query('SELECT status FROM resume_imports WHERE id=$1',[failed])).rows[0].status,'accepted');
    console.log('IMPORT_DATABASE_PASSED');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exit(1);});
