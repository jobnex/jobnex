import { pool } from "@/lib/db";
import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getPresignedDownloadUrl } from "@/app/actions/storage";
import { extractResumeProfileFromR2 } from "@/lib/profile-service";
import { resumeContentError } from "@/lib/resume-validation";
import { RESUME_VALIDATOR_VERSION, sourceDigest, UNSUPPORTED_LAYOUT } from "@/lib/resume-admission";
import { createHash, randomUUID } from "node:crypto";
import { parseResumeMarkdown } from "@/lib/resume-parser";
import { documentToEditor, validateResumeDocument, type ResumeDocumentV1 } from "@/lib/resume-document";

const UUID = /^[0-9a-f-]{36}$/i;
type ImportRow = { id: string; user_id: string; object_key: string; file_name: string; file_size: number; baseline_key: string | null;
  baseline_content_sha256: string | null;
  status: string; revision: number; file_sha256: string; validator_version: string; parsed_data: Record<string, unknown>; markdown: string; expires_at: Date };

export async function previewResumeImport(userId: string, objectKey: string, fileName: string) {
  if (!(objectKey.startsWith(`resume_imports/${userId}/`) || objectKey.startsWith(`user_pref_resumes/${userId}/`)) || objectKey.includes("..")) throw new Error("Invalid resume file ownership.");
  if (!fileName.toLowerCase().endsWith(".pdf")) throw new Error("Upload a PDF. Export Word files to PDF first.");
  const baseline = await pool.query(`SELECT r.file_key,r.content FROM user_pref_resumes r JOIN user_job_preferences p
    ON p.user_id=r.user_id AND p.active_resume_id=r.id WHERE r.user_id=$1`, [userId]);
  const inserted = await pool.query(`INSERT INTO resume_imports(user_id,object_key,file_name,status,baseline_key,baseline_content_sha256)
    VALUES($1,$2,$3,'parsing',$4,$5) RETURNING id,revision`,
    [userId,objectKey,fileName,baseline.rows[0]?.file_key ?? null,baseline.rows[0] ? sourceDigest(baseline.rows[0].content || '') : null]);
  const {id,revision} = inserted.rows[0];
  try {
    const signed = await getPresignedDownloadUrl(objectKey);
    if (!signed.success || !signed.downloadUrl) throw new Error("The uploaded PDF could not be read. Please retry.");
    const result = await extractResumeProfileFromR2({userId,objectKey,fileName,downloadUrl:signed.downloadUrl});
    if (!result.success || result.validatorVersion !== RESUME_VALIDATOR_VERSION) throw new Error(result.error || "The profile service needs the layout validation update before uploads can continue.");
    if (!result.accepted) {
      await pool.query(`UPDATE resume_imports SET status='rejected',reason_code=$3 WHERE id=$1 AND revision=$2 AND status='parsing'`,[id,revision,result.reasonCode]);
      return {success:false,accepted:false,reasonCode:result.reasonCode,message:UNSUPPORTED_LAYOUT,detail:result.detail,importId:id};
    }
    if (!result.markdown || !result.fileSha256 || !result.resume_details) throw new Error("Incomplete validation response.");
    const changed = await pool.query(`UPDATE resume_imports SET status='accepted',validator_version=$3,file_sha256=$4,
      markdown=$5,parsed_data=$6,reason_code='ACCEPTED' WHERE id=$1 AND revision=$2 AND status='parsing' RETURNING id`,
      [id,revision,result.validatorVersion,result.fileSha256,result.markdown,JSON.stringify({...result.resume_details,resumeDocument:result.resumeDocument,inferredPreferences:result.preferences||{}})]);
    if (!changed.rows.length) throw new Error("This upload changed. Please retry the latest PDF.");
    return {success:true,accepted:true,importId:id,revision,markdown:result.markdown,resume_details:result.resume_details,
      message:result.message,previewUrl:signed.downloadUrl};
  } catch (error) {
    await pool.query(`UPDATE resume_imports SET status='rejected',reason_code='VALIDATION_UNAVAILABLE' WHERE id=$1 AND revision=$2 AND status='parsing'`,[id,revision]);
    throw error;
  }
}

export async function confirmResumeImport(userId: string, importId: string, revision: number, markdown: string, autofill?:boolean) {
  if (!UUID.test(importId) || !Number.isInteger(revision)) throw new Error("Invalid import revision.");
  const invalid = resumeContentError(markdown,{allowUndatedExperience:true});
  if (invalid) throw new Error(invalid);
  if (/\b(?:20XX|19XX|First Last|Company Name\s*\d*|University Name)\b/i.test(markdown)) throw new Error("Replace template placeholders with your own details and actual dates before confirming.");
  markdown = markdown.replace(/\r\n?/g,"\n").trim();
  const client = await pool.connect();
  let oldKey: string | null = null;
  let permanentKey: string | null = null;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[userId]);
    const imports = await client.query(`SELECT * FROM resume_imports WHERE id=$1 AND user_id=$2 FOR UPDATE`,[importId,userId]);
    const candidate = imports.rows[0] as ImportRow | undefined;
    if (!candidate || candidate.status !== 'accepted' || candidate.revision !== revision || new Date(candidate.expires_at).getTime() <= Date.now() || candidate.validator_version !== RESUME_VALIDATOR_VERSION) throw new Error("This upload is expired or changed. Validate the PDF again.");
    const current = await client.query(`SELECT r.file_key,r.content,p.preferences FROM user_pref_resumes r JOIN user_job_preferences p
      ON p.user_id=r.user_id AND p.active_resume_id=r.id WHERE r.user_id=$1 FOR UPDATE OF r,p`,[userId]);
    oldKey = current.rows[0]?.file_key ?? null;
    const currentDigest=current.rows[0]?sourceDigest(current.rows[0].content || ''):null;
    if (oldKey !== candidate.baseline_key || currentDigest !== candidate.baseline_content_sha256) throw new Error("Your active resume changed in another tab. Validate the PDF again.");
    const busy = await client.query(`SELECT id FROM resume_generation_requests WHERE user_id=$1 AND status IN ('queued','running') LIMIT 1`,[userId]);
    if (busy.rows.length) throw new Error("Wait for current resume generation to finish before replacing your resume.");
    // Verify the exact bytes again: a reusable presigned PUT could overwrite a staged object.
    const object = await r2Client.send(new GetObjectCommand({Bucket:R2_BUCKET_NAME,Key:candidate.object_key}));
    if (!object.ContentLength || object.ContentLength > 10*1024*1024) throw new Error("Invalid PDF size.");
    const bytes = await object.Body!.transformToByteArray();
    if (bytes.length > 10*1024*1024 || createHash('sha256').update(bytes).digest('hex') !== candidate.file_sha256) throw new Error("The uploaded file changed. Validate the PDF again.");
    // Browser PUT URLs remain valid briefly. Store the verified bytes under a
    // fresh server-only key, so an old upload URL cannot overwrite the active PDF.
    permanentKey=`user_pref_resumes/${userId}/${randomUUID()}.pdf`;
    await r2Client.send(new PutObjectCommand({Bucket:R2_BUCKET_NAME,Key:permanentKey,Body:bytes,ContentType:'application/pdf'}));
    const digest = sourceDigest(markdown);
    let canonical:ResumeDocumentV1|undefined;
    const candidateDocument=candidate.parsed_data.resumeDocument;
    if (candidateDocument) {
      validateResumeDocument(candidateDocument);
      canonical=candidateDocument;
      if (markdown !== candidate.markdown.replace(/\r\n?/g,"\n").trim()) throw new Error("Source corrections require a new validated PDF upload.");
      canonical.source.revision = importId;
      canonical.id = `source-${importId}`;
      if (canonical.source.fileSha256 !== candidate.file_sha256) throw new Error("Source file proof changed. Validate the PDF again.");
    } else if (process.env.RESUME_CERTIFIED_PUBLICATION === "true") throw new Error("Validate the PDF with the current profile service before continuing.");
    const model=canonical ? documentToEditor(canonical) : parseResumeMarkdown(markdown);
    const dateFields=(duration:string)=>{
      const parts=duration.split(/\s+[–—-]\s+/,2);
      return {dates:duration,startDate:parts.length===2?parts[0]:'',endDate:parts.length===2?parts[1]:duration};
    };
    // Keep legacy editable fields consistent with reviewed Markdown. Raw PDF
    // extraction is provenance only and must not override the confirmed source.
    const details = {...candidate.parsed_data, resumeDocument:canonical, originalText:candidate.parsed_data.originalText||candidate.parsed_data.text, text:markdown,
      header:{name:model.personalInfo.name,title:model.personalInfo.title,email:model.personalInfo.email,phone:model.personalInfo.phone,
        location:model.personalInfo.location,links:[model.personalInfo.linkedin,model.personalInfo.github,...(model.personalInfo.extraContacts||[])].filter(Boolean)},
      personalDetails:{fullName:model.personalInfo.name,email:model.personalInfo.email,phoneNumber:model.personalInfo.phone,location:model.personalInfo.location},
      experience:model.experience.map(e=>({company:e.company,title:e.role,location:e.location,bullets:e.bullets,...dateFields(e.duration)})),
      experienceHistory:model.experience.map((e,i)=>({id:String(i+1),company:e.company,role:e.role,...dateFields(e.duration),jobDescription:e.bullets.map(b=>'- '+b).join('\n'),responsibilities:'',skills:[],domains:[]})),
      educationHistory:model.education.map((e,i)=>({id:String(i+1),college:e.institution,degree:e.degree,field:'',...dateFields(e.duration),details:e.details||'',grade:'',maxGrade:'',gradeType:'CGPA'})),
      summary:model.summary,skills:model.skills,projects:model.projects,additionalSections:model.additionalSections,
      compiler_payload:{markdown}, layoutValidation:{importId,
      validatorVersion:RESUME_VALIDATOR_VERSION,fileSha256:candidate.file_sha256,contentSha256:digest,confirmedAt:new Date().toISOString()}};
    const prefs = {resumeUploaded:true,resumeFileName:candidate.file_name,resumeFileKey:permanentKey,isConfirmed:false};
    const inferred=candidate.parsed_data.inferredPreferences as Record<string,unknown>||{};
    const inferredPrefs=Object.fromEntries(['country','cities','domains','seniority','experienceYears'].filter(k=>k in inferred).map(k=>[k,inferred[k]]));
    const labels=(value:unknown)=>Array.isArray(value)?value.filter((v):v is string=>typeof v==='string').map(v=>v.replace(/^[#*\s]+|[*\s]+$/g,'').trim()).filter(Boolean):[];
    // Matching preferences use the backend's canonical skills, not comma-split
    // resume prose (which breaks labels such as AWS (SageMaker, Bedrock)).
    inferredPrefs.skills=Array.from(new Set(labels(inferred.skills)));
    inferredPrefs.domains=Array.from(new Set(labels([
      ...labels(inferred.domains), model.personalInfo.title, ...model.experience.map(e=>e.role),
    ])));
    if(inferredPrefs.seniority==='Senior-level')inferredPrefs.seniority='Senior';
    Object.assign(details,{inferredPreferences:inferredPrefs});
    const base = await client.query(`INSERT INTO user_pref_resumes(user_id,title,file_name,file_key,file_url,file_size,is_primary,content,parsed_data)
      VALUES($1,$2,$2,$3,$3,$4,true,$5,$6) ON CONFLICT(user_id) DO UPDATE SET title=EXCLUDED.title,file_name=EXCLUDED.file_name,
      file_key=EXCLUDED.file_key,file_url=EXCLUDED.file_url,file_size=EXCLUDED.file_size,is_primary=true,content=EXCLUDED.content,parsed_data=EXCLUDED.parsed_data,updated_at=now() RETURNING id`,
      [userId,candidate.file_name,permanentKey,bytes.length,markdown,JSON.stringify(details)]);
    const shouldAutofill=autofill ?? (current.rows[0]?.preferences?.autofillFromResume !== false);
    await client.query(`INSERT INTO user_job_preferences(user_id,active_resume_id,preferences,resume_details,resume_details_created_at,resume_details_updated_at)
      VALUES($1,$2,$3,$4,now(),now()) ON CONFLICT(user_id) DO UPDATE SET active_resume_id=EXCLUDED.active_resume_id,
      preferences=user_job_preferences.preferences || EXCLUDED.preferences || jsonb_build_object(
        'manualEdits',COALESCE(NULLIF(user_job_preferences.preferences->'manualEdits','null'::jsonb),'{}'::jsonb) || EXCLUDED.preferences),
      resume_details=EXCLUDED.resume_details,resume_details_updated_at=now(),updated_at=now()`,
      [userId,base.rows[0].id,JSON.stringify({...shouldAutofill?inferredPrefs:{},...prefs}),JSON.stringify(details)]);
    await client.query(`UPDATE resume_imports SET status='confirmed',confirmed_at=now(),content_sha256=$3,markdown=$4,parsed_data=$5,file_size=$6,object_key=$7
      WHERE id=$1 AND user_id=$2`,[importId,userId,digest,markdown,JSON.stringify(details),bytes.length,permanentKey]);
    await client.query("COMMIT");
    // The cleanup job removes baseline_key after activation under the same user
    // lock. Deleting here after releasing the lock could race a reactivation.
    return {success:true,fileName:candidate.file_name,objectKey:permanentKey};
  } catch (error) {
    await client.query("ROLLBACK");
    // A failed COMMIT acknowledgement can have an unknown outcome. Never delete
    // here: the cleanup job checks active ownership before removing abandoned keys.
    throw error;
  }
  finally { client.release(); }
}

export async function cancelResumeImport(userId: string, importId: string) {
  if (!UUID.test(importId)) throw new Error("Invalid import.");
  await pool.query(`UPDATE resume_imports SET status='cancelled' WHERE id=$1 AND user_id=$2 AND status IN ('parsing','accepted','rejected')`,[importId,userId]);
  return {success:true};
}

export async function removeActiveResume(userId: string) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[userId]);
    const busy=await client.query(`SELECT id FROM resume_generation_requests WHERE user_id=$1 AND status IN ('queued','running') LIMIT 1`,[userId]);
    if(busy.rows.length)throw new Error('Wait for resume generation to finish before removing your resume.');
    const current=await client.query('SELECT file_key,file_name FROM user_pref_resumes WHERE user_id=$1 FOR UPDATE',[userId]);
    const file=current.rows[0];
    // Removal also works before the upload-policy migration. The cleanup job
    // discovers retired R2 files by prefix when no import ledger exists yet.
    const ledger=await client.query("SELECT to_regclass('public.resume_imports') IS NOT NULL AS available");
    if(file?.file_key && ledger.rows[0]?.available)await client.query(`INSERT INTO resume_imports(user_id,object_key,file_name,status,reason_code)
      VALUES($1,$2,$3,'cancelled','USER_REMOVED')`,[userId,file.file_key,file.file_name||'resume.pdf']);
    await client.query(`UPDATE user_job_preferences SET active_resume_id=NULL,resume_details='{}'::jsonb,
      preferences=preferences || '{"resumeUploaded":false,"resumeFileName":null,"resumeFileKey":null,"isConfirmed":false}'::jsonb,updated_at=now() WHERE user_id=$1`,[userId]);
    await client.query('DELETE FROM user_pref_resumes WHERE user_id=$1',[userId]);
    await client.query('COMMIT');
    return {success:true};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
