import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getPresignedDownloadUrl } from "@/app/actions/storage";
import { extractResumeProfileFromR2 } from "@/lib/profile-service";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Authentication required." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request payload." },
        { status: 400 }
      );
    }

    const { objectKey, fileName } = body as { objectKey?: string; fileName?: string };

    if (!objectKey || typeof objectKey !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing required parameter 'objectKey'." },
        { status: 400 }
      );
    }

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing required parameter 'fileName'." },
        { status: 400 }
      );
    }

    // Security Guard: Prevent directory traversal & enforce multi-tenant isolation
    if (objectKey.includes("..")) {
      return NextResponse.json(
        { success: false, error: "Illegal path traversal in object key." },
        { status: 400 }
      );
    }

    const expectedPrefix = `user_pref_resumes/${user.id}/`;
    if (!objectKey.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to access this resume." },
        { status: 403 }
      );
    }

    // Generate a secure, time-limited presigned GET URL from R2 for the microservice
    const downloadRes = await getPresignedDownloadUrl(objectKey);
    if (!downloadRes.success || !downloadRes.downloadUrl) {
      return NextResponse.json(
        {
          success: false,
          error: downloadRes.error || "Failed to generate presigned download URL for extraction.",
        },
        { status: 500 }
      );
    }

    // Call the Cloud Run profile service
    const extractionResult = await extractResumeProfileFromR2({
      userId: user.id,
      objectKey,
      fileName,
      downloadUrl: downloadRes.downloadUrl,
    });

    if (!extractionResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: extractionResult.error || "Failed to extract profile details from resume.",
        },
        { status: 502 }
      );
    }

    revalidatePath("/job-hunt/manage");
    revalidatePath("/job-hunt");

    return NextResponse.json({
      success: true,
      preferences: extractionResult.preferences,
      resume_details: extractionResult.resume_details,
      compiler_payload: extractionResult.compiler_payload,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[API /api/job-hunt/profile] Error processing extraction:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
