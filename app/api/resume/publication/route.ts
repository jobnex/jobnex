import { getCurrentUser } from "@/lib/auth/server";
import { RESUME_TEMPLATES } from "@/data/resume-templates";
import { forwardPublication,latestDocument,publicationBackend,PublicationError,saveDocument,validateSavedDocument,UUID } from "@/lib/resume-publication-server";

export const dynamic="force-dynamic";
export const maxDuration=120;
const failure=(error:unknown)=>error instanceof PublicationError ? Response.json({publicationStatus:"blocked",issues:[{code:error.code,message:error.message,fieldId:null}]},{status:error.status})
  : Response.json({publicationStatus:"blocked",issues:[{code:"VALIDATION_UNAVAILABLE",message:"Resume checks could not finish. Your draft is saved; retry preview shortly.",fieldId:null}]},{status:503});

export async function GET(request:Request) {
  try {
    const user=await getCurrentUser(); if(!user) return Response.json({error:"Sign in first"},{status:401});
    const forwarded=await forwardPublication(request);if(forwarded)return forwarded;
    const params=new URL(request.url).searchParams;
    const jobId=params.get("jobId")||"",generationId=params.get("generationId")||undefined;
    const templateId=params.get("templateId")||"mit-capd";
    if(!UUID.test(jobId)||(generationId&&!UUID.test(generationId))||!RESUME_TEMPLATES.some(t=>t.id===templateId))return Response.json({error:"Invalid request"},{status:400});
    const row=await latestDocument(user.id,jobId,generationId);
    const response=await publicationBackend(user.id,jobId,`publication?generationId=${row.generation_id}&documentRevision=${row.revision}&templateId=${templateId}`);
    const status=await response.json();
    return Response.json({...status,document:row.document_json,generationId:row.generation_id,documentRevision:row.revision,documentHash:row.document_hash},{status:response.status,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return failure(error);}
}
export async function POST(request:Request) {
  try {
    const user=await getCurrentUser();if(!user)return Response.json({error:"Sign in first"},{status:401});
    const forwarded=await forwardPublication(request);if(forwarded)return forwarded;
    if(Number(request.headers.get("content-length")||0)>1_000_000)return Response.json({error:"Document too large"},{status:413});
    const body=await request.json();
    const {jobId,generationId,documentRevision,documentHash,templateId="mit-capd",action="preview"}=body;
    if(!UUID.test(jobId)||!UUID.test(generationId)||!Number.isInteger(documentRevision)||!RESUME_TEMPLATES.some(t=>t.id===templateId)||!["save","preview"].includes(action))return Response.json({error:"Invalid request"},{status:400});
    if(action==="save"){
      const saved=await saveDocument(user.id,jobId,generationId,documentRevision,body.document);
      let validation;
      try{validation=await validateSavedDocument(saved.id);}catch{validation={issues:[{code:"VALIDATION_UNAVAILABLE",message:"Draft saved. Required checks could not finish; retry preview.",fieldId:null}]};}
      return Response.json({document:saved.document,documentRevision:saved.document.revision,documentHash:saved.documentHash,publicationStatus:"blocked",artifactId:null,issues:validation.issues||[]});
    }
    const row=await latestDocument(user.id,jobId,generationId);
    if(row.revision!==documentRevision||row.document_hash!==documentHash)throw new PublicationError("STALE_REVISION","This draft changed. Reload the latest version.");
    if(row.audit_json.editValidation){
      const validation=await validateSavedDocument(row.id);
      if(validation.validated!==true)return Response.json({documentRevision,documentHash,publicationStatus:"blocked",issues:validation.issues||[],artifactId:null,pdfSha256:null},{headers:{"Cache-Control":"private, no-store"}});
    }
    const response=await publicationBackend(user.id,jobId,"preview",{generationId,documentRevision,documentHash,templateId});
    return new Response(response.body,{status:response.status,headers:{"Content-Type":"application/json","Cache-Control":"private, no-store"}});
  }catch(error){return failure(error);}
}
