/* Run hourly: node --env-file=.env.local scripts/cleanup-resume-imports.cjs --apply
 * Dry-run by default. Deletes only expired staged/retired exact keys, never prefixes.
 */
const {Pool}=require('pg');
const {S3Client,ListObjectsV2Command,DeleteObjectCommand}=require('@aws-sdk/client-s3');

async function cleanup({pool,r2,bucket,apply=false,now=Date.now()}) {
  const keys=new Set();
  for(const prefix of ['resume_imports/','user_pref_resumes/']){
    let token;
    do {
      const page=await r2.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix,ContinuationToken:token}));
      for(const item of page.Contents||[])if(item.Key&&item.LastModified&&new Date(item.LastModified).getTime()<now-24*3600000)keys.add(item.Key);
      token=page.IsTruncated?page.NextContinuationToken:undefined;
    }while(token);
  }
  const retired=await pool.query(`SELECT baseline_key AS object_key FROM resume_imports WHERE status='confirmed' AND confirmed_at<now()-interval '24 hours' AND baseline_key IS NOT NULL AND baseline_cleaned_at IS NULL
    UNION SELECT object_key FROM resume_imports WHERE cleaned_at IS NULL AND
      ((status<>'confirmed' AND expires_at<now()) OR (status='confirmed' AND confirmed_at<now()-interval '24 hours'))`);
  for(const row of retired.rows)keys.add(row.object_key);
  let deleted=0;
  for(const key of keys){
    const parts=key.split('/');
    if(!['resume_imports','user_pref_resumes'].includes(parts[0])||parts.length<3||key.includes('..')||key.endsWith('/.keep')||key.endsWith('/'))continue;
    const userId=parts[1];
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[userId]);
      const active=await client.query('SELECT id FROM user_pref_resumes WHERE user_id=$1 AND file_key=$2',[userId,key]);
      if(active.rows.length){await client.query('COMMIT');continue;}
      // Do not delete a fresh revalidation of an older staged object.
      const fresh=await client.query(`SELECT id FROM resume_imports WHERE user_id=$1 AND object_key=$2 AND status IN ('accepted','parsing') AND expires_at>now()`,[userId,key]);
      if(fresh.rows.length){await client.query('COMMIT');continue;}
      if(apply){
        await client.query(`UPDATE resume_imports SET status='expired' WHERE user_id=$1 AND object_key=$2 AND status<>'confirmed'`,[userId,key]);
        await r2.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
        await client.query(`UPDATE resume_imports SET cleaned_at=now() WHERE user_id=$1 AND object_key=$2`,[userId,key]);
        await client.query(`UPDATE resume_imports SET baseline_cleaned_at=now() WHERE user_id=$1 AND baseline_key=$2`,[userId,key]);
        deleted++;
      }
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  }
  return {candidates:keys.size,deleted};
}
module.exports={cleanup};
if(require.main===module){
  const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  const jurisdiction=process.env.R2_JURISDICTION??'us';
  const r2=new S3Client({region:'auto',endpoint:process.env.R2_ENDPOINT||`https://${process.env.R2_ACCOUNT_ID}${jurisdiction?'.'+jurisdiction:''}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
  cleanup({pool,r2,bucket:process.env.R2_BUCKET_NAME,apply:process.argv.includes('--apply')})
    .then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Import cleanup failed; retry required.');process.exitCode=1;}).finally(()=>pool.end());
}
