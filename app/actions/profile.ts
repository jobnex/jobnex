"use server";

import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

export type UpdateProfileInput = {
  fullName?: string | null;
  phoneNumber?: string | null;
  countryCode?: string | null;
  location?: string | null;
  country?: string | null;
};

export async function getProfile() {
  try {
    const user = await getCurrentUser();
    if (!user) return { data: null };

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id))
      .limit(1);

    return { data: profile || null };
  } catch (error) {
    console.error("Error fetching profile:", error);
    return { data: null };
  }
}

export async function updateProfile(data: UpdateProfileInput) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const profileData = {
      fullName: data.fullName ?? null,
      phoneNumber: data.phoneNumber ?? null,
      countryCode: data.countryCode ?? null,
      location: data.location ?? null,
      country: data.country ?? null,
      updatedAt: new Date(),
    };

    const [updatedProfile] = await db
      .insert(userProfiles)
      .values({
        userId: user.id,
        ...profileData
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: profileData,
      })
      .returning();

    // Revalidate the profile page and layout to ensure fresh data
    revalidatePath("/profile");
    revalidatePath("/(main)/profile", "page");

    return { success: true, data: updatedProfile };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update profile";
    console.error("Failed to update profile:", error);
    return { success: false, error: message };
  }
}
