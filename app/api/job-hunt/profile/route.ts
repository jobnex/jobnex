import { getCurrentUser } from "@/lib/auth/server";
import { profileService } from "@/lib/profile-service";
import { getPresignedDownloadUrl } from "@/app/actions/storage";
import { z } from "zod";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  try {
    const input = z.object({ objectKey: z.string().max(1024), fileName: z.string().max(255) }).strict().parse(await request.json());
    if (!input.objectKey.startsWith(`user_pref_resumes/${user.id}/`)) return Response.json({ error: "Invalid resume owner" }, { status: 403 });
    const signed = await getPresignedDownloadUrl(input.objectKey);
    if (!signed.downloadUrl) throw new Error("Resume unavailable");
    return Response.json(await profileService(user.id, "/profile/resume-from-r2", { ...input, downloadUrl: signed.downloadUrl }));
  } catch {
    return Response.json({ error: "Could not extract resume details. Your uploaded file is retained; retry extraction." }, { status: 502 });
  }
}
