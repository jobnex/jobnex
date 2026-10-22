import { getCurrentUser } from "@/lib/auth/server";
import { forwardPublication,publicationBackend,UUID } from "@/lib/resume-publication-server";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{artifactId:string}>}){
  const user=await getCurrentUser();if(!user)return Response.json({error:"Sign in first"},{status:401});
  try {
    const forwarded=await forwardPublication(request);if(forwarded)return forwarded;
    const {artifactId}=await params;const query=new URL(request.url).searchParams;const jobId=query.get("jobId")||"";
    if(!UUID.test(jobId)||!UUID.test(artifactId))return Response.json({error:"Invalid artifact"},{status:400});
    const response=await publicationBackend(user.id,jobId,`artifacts/${artifactId}/pdf${query.get("download")==="1"?"?download=1":""}`);
    return new Response(response.body,{status:response.status,headers:{"Content-Type":response.headers.get("content-type")||"application/json","Cache-Control":"private, no-store",
      "Content-Disposition":query.get("download")==="1"?'attachment; filename="resume.pdf"':"inline",
      "X-PDF-SHA256":response.headers.get("x-pdf-sha256")||"","X-Content-Type-Options":"nosniff"}});
  }catch{return Response.json({error:"Certified PDF unavailable. Refresh preview and retry.",code:"VALIDATION_UNAVAILABLE"},{status:503});}
}
