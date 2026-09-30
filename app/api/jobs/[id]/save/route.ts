import { NextResponse, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { savedJobs } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const jobId = resolvedParams.id;
    const userId = user.id;

    await db
      .insert(savedJobs)
      .values({
        userId,
        jobId,
      })
      .onConflictDoNothing();

    return NextResponse.json({ message: "Job saved successfully", isSaved: true });
  } catch (error) {
    console.error("Error saving job:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const jobId = resolvedParams.id;
    const userId = user.id;

    await db.delete(savedJobs)
      .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)));

    return NextResponse.json({ message: "Job removed from saved", isSaved: false });
  } catch (error) {
    console.error("Error unsaving job:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
