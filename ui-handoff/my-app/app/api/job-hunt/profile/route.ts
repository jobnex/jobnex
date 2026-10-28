import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { previewResumeImport, confirmResumeImport, cancelResumeImport } from "@/lib/resume-imports";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  try {
    const raw = await request.text();
    if (raw.length > 220000) return NextResponse.json({success:false,error:"Request too large."},{status:413});
    const body = JSON.parse(raw);
    if (body.operation === "confirm") {
      if (typeof body.importId !== 'string' || typeof body.markdown !== 'string') throw new Error("Invalid confirmation.");
      const result = await confirmResumeImport(user.id,body.importId,body.revision,body.markdown,typeof body.autofill==='boolean'?body.autofill:undefined);
      revalidatePath('/job-hunt/manage');revalidatePath('/job-hunt');
      return NextResponse.json(result);
    }
    if (body.operation === "cancel") {
      if (typeof body.importId !== 'string') throw new Error("Invalid import.");
      return NextResponse.json(await cancelResumeImport(user.id,body.importId));
    }
    if (body.operation && body.operation !== 'preview') throw new Error("Unknown import operation.");
    if (typeof body.objectKey !== 'string' || typeof body.fileName !== 'string') throw new Error("Select a PDF to validate.");
    const result = await previewResumeImport(user.id,body.objectKey,body.fileName);
    return NextResponse.json(result,{status:result.accepted?200:422});
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '42P01') {
      console.error('Resume import schema is unavailable. Apply strict-resume-imports.sql before enabling uploads.');
      return NextResponse.json({success:false,error:'Resume uploads are temporarily unavailable. Your current resume has not changed.'},{status:503});
    }
    const message=error instanceof Error ? error.message : 'Resume validation failed. Please retry.';
    return NextResponse.json({success:false,error:message},{status:400});
  }
}
