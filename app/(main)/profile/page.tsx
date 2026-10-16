import { getCurrentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";
import MobileProfileView from "./MobileProfileView";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth");
  }

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id))
    .limit(1);

  return (
    <>
      {/* Big Screen Mode: completely unchanged desktop experience */}
      <div className="hidden md:block container max-w-[800px] mx-auto px-4 sm:px-[1.75rem] py-8 sm:py-12">
        <ProfileForm initialData={profile || {}} email={user.email || ""} />
      </div>

      {/* Mobile View: Dedicated mobile profile hub page */}
      <div className="block md:hidden">
        <MobileProfileView initialData={profile || {}} email={user.email || ""} />
      </div>
    </>
  );
}
