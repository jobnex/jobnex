"use client";

import { useState, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Bookmark,
  Bell,
  CreditCard,
  Settings,
  LifeBuoy,
  LogOut,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import ProfileForm, { ProfileInitialData } from "./ProfileForm";

interface MobileProfileViewProps {
  initialData: ProfileInitialData;
  email: string;
}

export default function MobileProfileView({
  initialData,
  email,
}: MobileProfileViewProps) {
  const router = useRouter();

  // Active view: "hub" (default mobile profile page) | "details" (profile editing section)
  const [view, setView] = useState<"hub" | "details">("hub");

  // Sign out confirmation modal
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOutModalRef = useRef<HTMLDivElement>(null);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Modal dismissal hooks
  useClickOutside(signOutModalRef, () => setIsSignOutConfirmOpen(false), isSignOutConfirmOpen);
  useEscapeKey(() => setIsSignOutConfirmOpen(false), isSignOutConfirmOpen);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      toast.success("Signed out successfully");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Failed to sign out. Please try again.");
      setIsSigningOut(false);
      setIsSignOutConfirmOpen(false);
    }
  };

  const displayName = initialData.fullName || (email ? email.split("@")[0] : "User");
  const avatarInitial = displayName.charAt(0).toUpperCase();

  // Subview: Profile Details / Edit Form
  if (view === "details") {
    return (
      <div className="px-4 py-6 max-w-lg mx-auto pb-32 animate-in fade-in duration-200">
        <div className="flex items-center gap-3 mb-6 pb-3 border-b border-border-subtle">
          <button
            type="button"
            onClick={() => setView("hub")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EDF0F3] dark:bg-[#202330] text-xs sm:text-sm font-semibold text-text-primary dark:text-white cursor-pointer active:scale-95 transition-all"
            aria-label="Back to Profile"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <h1 className="font-heading font-bold text-lg text-text-primary dark:text-white">
            Profile Details
          </h1>
        </div>

        <ProfileForm initialData={initialData} email={email} />
      </div>
    );
  }

  // Primary Mobile View: Profile Hub Page
  return (
    <div className="px-4 py-6 max-w-lg mx-auto pb-32 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="mb-4">
        <h1 className="font-heading font-bold text-2xl text-text-primary dark:text-white">
          Profile
        </h1>
      </div>

      {/* Profile Details Button Card (Leads to Profile Details Section) */}
      <button
        type="button"
        onClick={() => setView("details")}
        className="w-full bg-white dark:bg-[#181A24] rounded-2xl p-4 sm:p-5 shadow-xs mb-5 flex items-center justify-between text-left cursor-pointer active:scale-[0.99] transition-all group"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Avatar Icon */}
          <div className="w-14 h-14 rounded-full bg-[#DFE4EC] text-[#1E293B] dark:bg-[#222534] dark:text-[#E2E8F0] flex items-center justify-center font-heading font-bold text-xl shrink-0 shadow-inner">
            {avatarInitial}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading font-bold text-base sm:text-lg text-text-primary dark:text-white truncate">
              {displayName}
            </h2>
            <p className="text-xs sm:text-sm text-text-muted dark:text-[#A1A1AA] truncate mt-0.5">
              {email}
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-text-muted group-hover:translate-x-0.5 transition-transform shrink-0" strokeWidth={2.2} />
      </button>

      {/* Options List */}
      <div className="mb-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted dark:text-[#8E92A4] px-1 mb-2">
          Options
        </div>

        <div className="bg-white dark:bg-[#181A24] rounded-2xl shadow-xs divide-y divide-gray-100 dark:divide-white/[0.06] overflow-hidden">
          {/* 1. Saved Option */}
          <Link
            href="/saved-jobs"
            className="w-full flex items-center justify-between px-4 py-4 hover:bg-[#EDF0F3]/60 dark:hover:bg-[#202330]/60 transition-colors cursor-pointer text-left group active:bg-[#EDF0F3] dark:active:bg-[#202330]"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Bookmark className="w-5 h-5 text-gray-700 dark:text-gray-300 shrink-0" strokeWidth={2.2} />
              <span className="font-semibold text-sm sm:text-base text-text-primary dark:text-white">
                Saved
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted group-hover:translate-x-0.5 transition-transform shrink-0" strokeWidth={2.2} />
          </Link>

          {/* 2. Notifications Option (No actions) */}
          <div
            className="w-full flex items-center justify-between px-4 py-4 text-left select-none opacity-90"
            aria-label="Notifications"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Bell className="w-5 h-5 text-gray-700 dark:text-gray-300 shrink-0" strokeWidth={2.2} />
              <span className="font-semibold text-sm sm:text-base text-text-primary dark:text-white">
                Notifications
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted/40 shrink-0" strokeWidth={2.2} />
          </div>

          {/* 3. Manage Plans Option */}
          <Link
            href="/pricing"
            className="w-full flex items-center justify-between px-4 py-4 hover:bg-[#EDF0F3]/60 dark:hover:bg-[#202330]/60 transition-colors cursor-pointer text-left group active:bg-[#EDF0F3] dark:active:bg-[#202330]"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <CreditCard className="w-5 h-5 text-gray-700 dark:text-gray-300 shrink-0" strokeWidth={2.2} />
              <span className="font-semibold text-sm sm:text-base text-text-primary dark:text-white">
                Manage plans
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted group-hover:translate-x-0.5 transition-transform shrink-0" strokeWidth={2.2} />
          </Link>

          {/* 4. Settings Option (No actions) */}
          <div
            className="w-full flex items-center justify-between px-4 py-4 text-left select-none opacity-90"
            aria-label="Settings"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Settings className="w-5 h-5 text-gray-700 dark:text-gray-300 shrink-0" strokeWidth={2.2} />
              <span className="font-semibold text-sm sm:text-base text-text-primary dark:text-white">
                Settings
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted/40 shrink-0" strokeWidth={2.2} />
          </div>

          {/* 5. Help Option (LifeBuoy emergency swimming tube icon, no actions) */}
          <div
            className="w-full flex items-center justify-between px-4 py-4 text-left select-none opacity-90"
            aria-label="Help"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <LifeBuoy className="w-5 h-5 text-gray-700 dark:text-gray-300 shrink-0" strokeWidth={2.2} />
              <span className="font-semibold text-sm sm:text-base text-text-primary dark:text-white">
                Help
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted/40 shrink-0" strokeWidth={2.2} />
          </div>
        </div>
      </div>

      {/* 6. Sign Out Option */}
      <div className="mt-4">
        <div className="bg-white dark:bg-[#181A24] rounded-2xl shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setIsSignOutConfirmOpen(true)}
            disabled={isSigningOut}
            className="w-full flex items-center justify-between px-4 py-4 hover:bg-red-50/70 dark:hover:bg-red-500/10 transition-colors cursor-pointer text-left group active:bg-red-100/60"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <LogOut className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" strokeWidth={2.2} />
              <span className="font-semibold text-sm sm:text-base text-red-600 dark:text-red-400">
                {isSigningOut ? "Signing out..." : "Sign Out"}
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-red-500/60 group-hover:translate-x-0.5 transition-transform shrink-0" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Sign Out Confirmation Modal */}
      {isSignOutConfirmOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150">
          <div
            ref={signOutModalRef}
            className="w-full max-w-sm bg-white dark:bg-[#161822] rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-5 duration-200"
          >
            <div className="flex flex-col items-center text-center mb-5 pt-2">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center mb-3">
                <LogOut className="w-6 h-6" strokeWidth={2.2} />
              </div>
              <h3 className="font-heading font-bold text-lg text-text-primary dark:text-white mb-1">
                Sign Out?
              </h3>
              <p className="text-xs text-text-muted dark:text-[#A1A1AA]">
                Are you sure you want to sign out of your account on this device?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsSignOutConfirmOpen(false)}
                className="py-2.5 rounded-xl bg-gray-100 dark:bg-[#202330] text-xs sm:text-sm font-semibold text-text-primary dark:text-white hover:bg-gray-200 dark:hover:bg-[#2B3042] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="py-2.5 rounded-xl bg-red-600 text-white font-semibold text-xs sm:text-sm hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSigningOut ? "Signing out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
