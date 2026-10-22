import { createHash } from "node:crypto";
import { pool } from "@/lib/db";
import { canonicalJson, validateResumeDocument, type ResumeDocumentV1 } from "@/lib/resume-document";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const digestDocument = (d: unknown) => createHash("sha256").update(canonicalJson(d)).digest("hex");
export class PublicationError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}

// Vercel forwards the verified session, never caller-supplied user IDs or service secrets.
export async function forwardPublication(request: Request): Promise<Response | null> {
  const base = process.env.RESUME_PUBLICATION_SERVICE_URL?.replace(/\/$/, "");
  if (!base) return null;
  if (!base.startsWith("https://") || new URL(base).origin === new URL(request.url).origin) throw new Error("Invalid publication service URL");
  const url = new URL(request.url);
  const response = await fetch(`${base}${url.pathname}${url.search}`, { method: request.method,
    headers: { Cookie: request.headers.get("cookie") || "", "Content-Type": "application/json" },
    body: request.method === "GET" ? undefined : await request.text(), cache:"no-store", signal:AbortSignal.timeout(120_000) });
  return new Response(response.body,{status:response.status,headers:{"Content-Type":response.headers.get("content-type") || "application/json",
    "Cache-Control":"private, no-store",...(response.headers.get("content-disposition") ? {"Content-Disposition":response.headers.get("content-disposition")!}:{}),
    ...(response.headers.get("x-pdf-sha256") ? {"X-PDF-SHA256":response.headers.get("x-pdf-sha256")!}:{})}});
}

async function identity(base: string,audience=base) {
  const result = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}&format=full`,
    {headers:{"Metadata-Flavor":"Google"},cache:"no-store",signal:AbortSignal.timeout(5000)});
  if(!result.ok) throw new Error("Service identity unavailable"); return (await result.text()).trim();
}
export async function publicationBackend(userId:string,jobId:string,suffix:string,body?:unknown) {
  const base=process.env.RESUME_PDF_BACKEND_URL?.replace(/\/$/,""); const token=process.env.RESUME_PDF_BACKEND_TOKEN;
  if(!base?.startsWith("https://") || !token) throw new Error("Publication backend unavailable");
  return fetch(`${base}/api/v2/jobs/${jobId}/${suffix}`,{method:body===undefined?"GET":"POST",headers:{Authorization:`Bearer ${token}`,
    "X-Serverless-Authorization":`Bearer ${await identity(base,process.env.RESUME_PDF_BACKEND_AUDIENCE||base)}`,"X-User-Id":userId,"Content-Type":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(110_000)});
}
export async function latestDocument(userId:string,jobId:string,generationId?:string) {
  const result=await pool.query(`SELECT d.* FROM resume_document_versions d JOIN resume_generations g
    ON g.id=d.generation_id AND g.user_id=d.user_id AND g.job_id=d.job_id
    WHERE d.user_id=$1 AND d.job_id=$2 AND ($3::uuid IS NULL OR d.generation_id=$3)
      AND g.id=(SELECT id FROM resume_generations WHERE user_id=$1 AND job_id=$2 ORDER BY version DESC,created_at DESC LIMIT 1)
    ORDER BY d.revision DESC LIMIT 1`,[userId,jobId,generationId||null]);
  const row=result.rows[0];
  if(!row) throw new PublicationError("SOURCE_REVALIDATION_REQUIRED","Validate your source PDF and generate a new draft before downloading this resume.");
  validateResumeDocument(row.document_json);
  if(digestDocument(row.document_json)!==row.document_hash) throw new PublicationError("DOCUMENT_HASH_MISMATCH","Document proof is invalid. Generate a new draft.");
  return row;
}

export async function saveDocument(userId:string,jobId:string,generationId:string,expectedRevision:number,document:unknown) {
  validateResumeDocument(document);
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${userId}:${jobId}`]);
    const current=await client.query(`SELECT d.* FROM resume_document_versions d JOIN resume_generations g ON g.id=d.generation_id
      WHERE d.user_id=$1 AND d.job_id=$2 AND d.generation_id=$3
        AND g.id=(SELECT id FROM resume_generations WHERE user_id=$1 AND job_id=$2 ORDER BY version DESC,created_at DESC LIMIT 1)
      ORDER BY revision DESC LIMIT 1 FOR UPDATE OF d`,[userId,jobId,generationId]);
    const old=current.rows[0];
    if(!old || old.revision!==expectedRevision) throw new PublicationError("STALE_REVISION","This draft changed in another window. Reload the latest version.");
    if(document.id!==generationId || document.revision!==expectedRevision || canonicalJson(document.source)!==canonicalJson(old.document_json.source)) throw new PublicationError("SOURCE_PROTECTED","Source corrections require a validated source revision.");
    const revision=expectedRevision+1;
    const next:ResumeDocumentV1={...document,revision};
    // Every save produces a new revision. Validation runs on this exact immutable row.
    const audit={...old.audit_json,certificationChecks:{schema:true,source:false,factual:false},editValidation:{status:"pending"},issues:[]};
    const result=await client.query(`INSERT INTO resume_document_versions(user_id,job_id,generation_id,revision,source_import_id,document_json,document_hash,source_hash,audit_json)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[userId,jobId,generationId,revision,old.source_import_id,JSON.stringify(next),digestDocument(next),old.source_hash,JSON.stringify(audit)]);
    await client.query("COMMIT");
    return {id:result.rows[0].id,document:next,documentHash:digestDocument(next)};
  } catch(error) {await client.query("ROLLBACK");throw error;} finally {client.release();}
}
export async function validateSavedDocument(versionId:string) {
  const base=process.env.RESUME_WORKER_URL?.replace(/\/$/,"");
  if(!base?.startsWith("https://")) throw new Error("Document validator unavailable");
  const result=await fetch(`${base}/internal/validate-document`,{method:"POST",headers:{Authorization:`Bearer ${await identity(base,process.env.RESUME_WORKER_AUDIENCE||base)}`,"Content-Type":"application/json"},
    body:JSON.stringify({versionId}),signal:AbortSignal.timeout(30_000),cache:"no-store"});
  if(!result.ok) throw new Error("Document validation could not finish");
  return result.json();
}

export async function publicationMetadata(userId:string,generationId:string){
  const result=await pool.query(`SELECT d.revision,d.audit_json,c.id AS artifact_id,c.pdf_sha256 FROM resume_document_versions d
    LEFT JOIN LATERAL (SELECT id,pdf_sha256 FROM resume_publication_certifications c WHERE c.user_id=d.user_id AND c.generation_id=d.generation_id
      AND c.document_revision=d.revision AND public.resume_certification_current(d.user_id,d.job_id,c.id) ORDER BY created_at DESC LIMIT 1) c ON true
    WHERE d.user_id=$1 AND d.generation_id=$2 ORDER BY d.revision DESC LIMIT 1`,[userId,generationId]);
  const row=result.rows[0];
  return {documentRevision:row?.revision||null,publicationStatus:row?.artifact_id?"ready":"blocked",certifiedArtifactId:row?.artifact_id||null,pdfSha256:row?.pdf_sha256||null,
    issues:row?.audit_json?.issues||(!row?[{code:"SOURCE_REVALIDATION_REQUIRED",message:"Validate your source PDF and generate a new draft before downloading.",fieldId:null}]:[])};
}
