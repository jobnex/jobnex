import { NextResponse } from "next/server";
import { HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { resumeContentError } from "@/lib/resume-validation";
import { resumeReviewError } from "@/lib/resume-review";
import { getCurrentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { userJobResumes, resumeGenerations, jobs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { parseResumeMarkdown, resumePlainText } from "@/lib/resume-parser";
import { RESUME_TEMPLATES, getTemplateById } from "@/data/resume-templates";
import { generateResumeUploadUrl, generateResumeDownloadUrl, r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


interface ExportRequestBody {
  jobId: string;
  markdown: string;
  templateId?: string;
  expectedGenerationId?: string | null;
}

export async function POST(request: Request) {
  if(process.env.RESUME_CERTIFIED_PUBLICATION_STRICT === "true") return Response.json({publicationStatus:"blocked",code:"USE_CERTIFIED_PUBLICATION",issues:[{code:"USE_CERTIFIED_PUBLICATION",message:"Open the certified resume preview before downloading or saving.",fieldId:null}]},{status:409});
  let uncommittedKey: string | undefined;
  try {
    const user = await getCurrentUser().catch(() => null);
    if (!user || !user.id || !UUID_REGEX.test(user.id)) {
      return NextResponse.json({ error: "Unauthorized. Please sign in to export your resume." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Partial<ExportRequestBody>;
    const { jobId, markdown, templateId, expectedGenerationId } = body;

    if (!jobId || !UUID_REGEX.test(jobId)) {
      return NextResponse.json({ error: "A valid jobId is required." }, { status: 400 });
    }

    if (!markdown || typeof markdown !== "string" || markdown.trim().length === 0) {
      return NextResponse.json({ error: "Resume markdown content cannot be empty." }, { status: 400 });
    }

    // 1. Verify job existence and user ownership
    const [jobRecord] = await db
      .select({ id: jobs.id, title: jobs.jobRoleTitle, company: jobs.companyName })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!jobRecord) {
      return NextResponse.json({ error: "Job record not found." }, { status: 404 });
    }

    const contentError = resumeContentError(markdown);
    if (contentError) return NextResponse.json({ error: contentError, code: "INVALID_RESUME" }, { status: 422 });
    const [latestGen] = await db.select().from(resumeGenerations)
      .where(and(eq(resumeGenerations.userId, user.id), eq(resumeGenerations.jobId, jobId)))
      .orderBy(desc(resumeGenerations.createdAt)).limit(1);
    const reviewError = resumeReviewError(latestGen, expectedGenerationId, markdown);
    if (reviewError) return NextResponse.json({ error: reviewError,
      code: latestGen?.id !== expectedGenerationId ? "STALE_GENERATION" : "REVIEW_REQUIRED" }, { status: 409 });
    if (templateId && !RESUME_TEMPLATES.some(item => item.id === templateId)) {
      return NextResponse.json({ error: "Unsupported resume template." }, { status: 400 });
    }

    // 3. Resolve template and theme
    const tmpl = getTemplateById(templateId || "mit-capd");
    const resolvedTheme = tmpl.themeId;
    const resolvedTemplateId = tmpl.id;

    // 4. Parse markdown to structured Typst model
    const parsedResume = parseResumeMarkdown(markdown);
    for (const section of Object.values(parsedResume.additionalSections || {})) section.lines = section.lines.map(resumePlainText);

    // 5. Generate Cloudflare R2 Presigned PUT Upload URL
    const { uploadUrl, objectKey } = await generateResumeUploadUrl(user.id, jobId, 300);
    uncommittedKey = objectKey;

// 6. Call GCP Cloud Run Typst PDF Compiler
    const compilerBaseUrl = (process.env.RESUME_COMPILER_URL || "").trim().replace(/\/$/, "");
    const compilerSecret = (process.env.RESUME_COMPILER_SECRET || "").trim();

    if (!compilerBaseUrl) {
      console.warn("RESUME_COMPILER_URL is not configured in environment variables.");
      return NextResponse.json(
        {
          error: "Cloud Run PDF compiler service URL is not configured (RESUME_COMPILER_URL). Please configure environment variables.",
          code: "COMPILER_URL_MISSING",
        },
        { status: 503 }
      );
    }

    if (!compilerSecret) {
      console.warn("RESUME_COMPILER_SECRET is not configured. Typst compiler requires bearer secret.");
      return NextResponse.json(
        {
          error: "Cloud Run PDF compiler service bearer secret is not configured (RESUME_COMPILER_SECRET). Please configure environment variables.",
          code: "COMPILER_SECRET_MISSING",
        },
        { status: 503 }
      );
    }


    if (Object.keys(parsedResume.additionalSections || {}).length || parsedResume.personalInfo.extraContacts?.length) {
      const health = await fetch(`${compilerBaseUrl}/health`, { signal: AbortSignal.timeout(10000), cache: "no-store" });
      const capabilities = await health.json();
      if (capabilities.resumeContractVersion !== 2) return NextResponse.json({
        error: "PDF service needs the content-preservation update before exporting this resume.", code: "COMPILER_UPDATE_REQUIRED",
      }, { status: 503 });
    }
    const compilerPayload = {
      resume: { ...parsedResume, rawMarkdown: undefined },
      theme: resolvedTheme,
      templateId: resolvedTemplateId,
      uploadUrl,
    };

    let compilerResponse: Response;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 90000);

      compilerResponse = await fetch(`${compilerBaseUrl}/api/v1/ui-export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${compilerSecret}`,
        },
        body: JSON.stringify(compilerPayload),
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeoutId);
    } catch (fetchErr: unknown) {
      if (timeoutId) clearTimeout(timeoutId);
      console.error("Failed to reach resume-pdf-compiler service:", fetchErr);
      return NextResponse.json(
        {
          error: "Unable to reach the PDF compilation microservice. The service may be cold-starting or unreachable. Please try again.",
          code: "COMPILER_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    if (timeoutId) clearTimeout(timeoutId);
    if (!compilerResponse.ok) {
      const errText = await compilerResponse.text().catch(() => "Unknown compiler error");
      console.error("Resume compiler error response:", compilerResponse.status, errText);
      return NextResponse.json(
        {
          error: `PDF compilation failed: ${errText || compilerResponse.statusText}`,
          code: "COMPILATION_FAILED",
        },
        { status: compilerResponse.status === 400 ? 400 : 502 }
      );
    }

    const compilerResult = (await compilerResponse.json().catch(() => ({}))) as {
      uploaded?: boolean;
      fileSize?: number;
    };

    if (!compilerResult.uploaded) {
      return NextResponse.json(
        {
          error: "The PDF was compiled but could not be stored in Cloudflare R2.",
          code: "STORAGE_UPLOAD_FAILED",
        },
        { status: 502 }
      );
    }

    const head = await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey }));
    const firstBytes = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey, Range: "bytes=0-4" }));
    if (!head.ContentLength || head.ContentType !== "application/pdf" ||
        Buffer.from(await firstBytes.Body!.transformToByteArray()).toString() !== "%PDF-") throw new Error("Invalid uploaded PDF");
    compilerResult.fileSize = head.ContentLength;
    // 7. Update database: save object key and exported timestamp in user_job_resumes
    const now = new Date();
    const previousKey = await db.transaction(async tx => {
      const [currentGen] = await tx.select().from(resumeGenerations)
        .where(and(eq(resumeGenerations.userId, user.id), eq(resumeGenerations.jobId, jobId)))
        .orderBy(desc(resumeGenerations.createdAt)).limit(1);
      if (resumeReviewError(currentGen, expectedGenerationId, markdown)) throw new Error("Draft changed during compilation");
      const [saved] = await tx.select().from(userJobResumes)
        .where(and(eq(userJobResumes.userId, user.id), eq(userJobResumes.jobId, jobId))).limit(1);
      const values = { markdown, templateId: resolvedTemplateId, theme: resolvedTheme, status: "ready",
        r2ObjectKey: objectKey, fileSize: head.ContentLength, exportedAt: now, updatedAt: now };
      await tx.insert(userJobResumes).values({ userId: user.id, jobId, ...values })
        .onConflictDoUpdate({ target: [userJobResumes.userId, userJobResumes.jobId], set: values });
      return saved?.r2ObjectKey;
    }, { isolationLevel: "serializable" });
    uncommittedKey = undefined;
    // Delete only the replaced object; a prefix prune can delete another export.
    if (previousKey && previousKey !== objectKey) {
      await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: previousKey })).catch(() => undefined);
    }

    // 8. Generate a short-lived download URL from R2
    const downloadFileName = `${(jobRecord.company || "Company").replace(/\s+/g, "_")}_${(jobRecord.title || "Resume").replace(/\s+/g, "_")}`;
    const downloadUrl = await generateResumeDownloadUrl(objectKey, downloadFileName, 900);

    return NextResponse.json({
      success: true,
      downloadUrl,
      objectKey,
      fileSize: compilerResult.fileSize,
      exportedAt: now.toISOString(),
    });
  } catch (error: unknown) {
    console.error("Unhandled error in POST /api/resume/export:", error);
    return NextResponse.json({ error: "Unable to export this version. Reload the latest draft and retry." }, { status: 503 });
  } finally {
    if (uncommittedKey) await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: uncommittedKey })).catch(() => undefined);
  }
}

export async function GET(request: Request) {
  if(process.env.RESUME_CERTIFIED_PUBLICATION_STRICT === "true") return Response.json({publicationStatus:"blocked",code:"USE_CERTIFIED_PUBLICATION",issues:[{code:"USE_CERTIFIED_PUBLICATION",message:"Open the certified resume preview before downloading or saving.",fieldId:null}]},{status:409});
  try {
    const user = await getCurrentUser().catch(() => null);
    if (!user || !user.id || !UUID_REGEX.test(user.id)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId || !UUID_REGEX.test(jobId)) {
      return NextResponse.json({ error: "A valid jobId parameter is required." }, { status: 400 });
    }

    const [record] = await db
      .select({
        r2ObjectKey: userJobResumes.r2ObjectKey,
        markdown: userJobResumes.markdown,
        updatedAt: userJobResumes.updatedAt,
        exportedAt: userJobResumes.exportedAt,
        templateId: userJobResumes.templateId,
      })
      .from(userJobResumes)
      .where(and(eq(userJobResumes.userId, user.id), eq(userJobResumes.jobId, jobId)))
      .limit(1);

    const [generation] = await db.select().from(resumeGenerations)
      .where(and(eq(resumeGenerations.userId, user.id), eq(resumeGenerations.jobId, jobId)))
      .orderBy(desc(resumeGenerations.createdAt)).limit(1);
    if (!record || !record.r2ObjectKey || !record.exportedAt || record.exportedAt < record.updatedAt ||
        resumeContentError(record.markdown) || resumeReviewError(generation, searchParams.get("expectedGenerationId"), record.markdown)) {
      return NextResponse.json({ success: true, hasExportedPdf: false });
    }

    const [jobRecord] = await db
      .select({ title: jobs.jobRoleTitle, company: jobs.companyName })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    const downloadFileName = `${(jobRecord?.company || "Company").replace(/\s+/g, "_")}_${(jobRecord?.title || "Resume").replace(/\s+/g, "_")}`;
    const downloadUrl = await generateResumeDownloadUrl(record.r2ObjectKey, downloadFileName, 900);

    return NextResponse.json({
      success: true,
      hasExportedPdf: true,
      downloadUrl,
      exportedAt: record.exportedAt?.toISOString(),
      templateId: record.templateId,
      markdown: record.markdown,
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/resume/export:", error);
    return NextResponse.json({ error: "Failed to fetch resume export link." }, { status: 500 });
  }
}

