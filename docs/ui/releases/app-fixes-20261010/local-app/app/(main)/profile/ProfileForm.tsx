"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Mail, Phone, Edit3, X, LogOut } from "lucide-react";
import { getUserJobPreferences } from "@/app/actions/preferences";
import { updateProfile } from "@/app/actions/profile";
import { authClient } from "@/lib/auth/client";
import { smoothScrollTo } from "@/lib/utils/scroll";

const formSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  country: z.string().min(1, "Country is required"),
  location: z.string().optional().nullable(),
  countryCode: z.string().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

const INPUT_BASE_CLASSES = "text-[0.875rem] font-medium text-gray-700 dark:text-gray-300 bg-bg-input border-[1.5px] border-transparent rounded-[10px] focus:outline-none focus:border-black dark:focus:border-white transition-all duration-200 ease-out";

export type ProfileInitialData = {
  fullName?: string | null;
  country?: string | null;
  location?: string | null;
  countryCode?: string | null;
  phoneNumber?: string | null;
};

export default function ProfileForm({
  initialData,
  email,
}: {
  initialData: ProfileInitialData;
  email: string;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isFilling, setIsFilling] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    getValues,
    setValue,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: initialData.fullName || "",
      country: initialData.country || "",
      location: initialData.location || "",
      countryCode: initialData.countryCode || "",
      phoneNumber: initialData.phoneNumber || "",
    },
  });

  const fillFromResume = async () => {
    setIsFilling(true);
    try {
      const result = await getUserJobPreferences();
      if (!result.success) throw new Error(result.error || "Could not load resume details.");
      const personal = result.data?.resumeDetails?.personalDetails;
      if (!personal || ![personal.fullName, personal.location, personal.phoneNumber].some(Boolean)) {
        toast.info("No saved contact details found. Add them in Manage Job Hunt first."); return;
      }
      const candidates = { fullName: personal.fullName, location: personal.location, phoneNumber: personal.phoneNumber };
      for (const [key, value] of Object.entries(candidates)) {
        const field = key as "fullName" | "location" | "phoneNumber";
        if (typeof value === "string" && !getValues(field)?.trim()) setValue(field, value, { shouldDirty: true });
      }
      setIsEditing(true);
      toast.info("Review the filled details and choose your country before saving.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load resume details."); }
    finally { setIsFilling(false); }
  };

  const onSubmit = async (data: FormData) => {
    setIsSaving(true);
    try {
      const res = await updateProfile(data);

      if (!res.success) throw new Error(res.error || "Failed to update profile");

      toast.success("Profile updated successfully!", {
        style: {
          backgroundColor: "#111827",
          color: "#FFFFFF",
          border: "1.5px solid var(--color-brand-lime)",
          borderRadius: "var(--radius-md)",
          padding: "0.85rem 1.25rem",
          fontWeight: "700",
          fontSize: "0.92rem",
        },
      });
      setIsEditing(false);
      smoothScrollTo(0, 500);
    } catch {
      toast.error("An error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClick = () => {
    setIsEditing(true);
    // Wait for the next tick so the DOM has updated and layout is calculated
    setTimeout(() => {
      if (formRef.current) {
        // Calculate target position: element top + current scroll - sticky header offset (112px)
        const targetY = formRef.current.getBoundingClientRect().top + window.scrollY - 112;
        smoothScrollTo(targetY);
      }
    }, 10); // minimal delay just for DOM flush
  };

  const handleCancel = () => {
    reset(); // Revert to initial values
    setIsEditing(false);
    smoothScrollTo(0, 500); // Scroll to top smoothly
  };

  const labelClass = "text-sm font-bold flex gap-1 mb-2";

  return (
    <div className="flex flex-col items-center">
      {/* Profile Details (Always visible) */}
      <div className="flex flex-col items-center justify-center py-6 text-center w-full">
        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#DFE4EC] text-[#1E293B] dark:bg-[#222534] dark:text-[#E2E8F0] flex items-center justify-center mb-5">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-14 h-14 sm:w-16 sm:h-16 shrink-0"
            aria-hidden="true"
          >
            <circle cx="12" cy="7" r="4" />
            <path d="M4 20.5C4 16.91 7.13 14 11 14H13C16.87 14 20 16.91 20 20.5C20 21.05 19.55 21.5 19 21.5H5C4.45 21.5 4 21.05 4 20.5Z" />
          </svg>
        </div>
        
        <h2 className="text-2xl sm:text-3xl font-heading font-semibold mb-3 text-text-primary dark:text-white">
          {initialData.fullName || "Update your name"}
        </h2>
        
        <div className="flex items-center gap-1.5 text-text-muted dark:text-[#A1A1AA] mb-3 font-medium">
          <MapPin className="w-4 h-4" />
          <span>
            {[initialData.location, initialData.country].filter(Boolean).join(", ") || "Location not set"}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-text-muted dark:text-[#A1A1AA] mb-8 font-medium">
          <div className="flex items-center gap-1.5">
            <Mail className="w-4 h-4" />
            <span>{email}</span>
          </div>
          {initialData.phoneNumber && (
            <>
              <span className="hidden sm:inline-block text-border-subtle">•</span>
              <div className="flex items-center gap-1.5">
                <Phone className="w-4 h-4" />
                <span>
                  {initialData.countryCode ? `${initialData.countryCode} ` : ""}{initialData.phoneNumber}
                </span>
              </div>
            </>
          )}
        </div>
        
        {!isEditing && (
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button
              onClick={handleEditClick}
              className="inline-flex items-center gap-2 py-[0.7rem] px-[1.75rem] text-[0.95rem] font-bold bg-brand-dark text-white border-[1.5px] border-transparent rounded-md shadow-[0_3px_0_0_var(--shadow-color-dark)] cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1.5px] hover:shadow-[0_4px_0_0_var(--shadow-color-dark)] hover:bg-brand-lime hover:text-[#111827] active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--shadow-color-dark)] dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white"
              style={{ "--shadow-color-dark": "rgba(0,0,0,0.8)" } as React.CSSProperties}
            >
              <Edit3 className="w-4 h-4" strokeWidth={2.5} />
              Edit Profile
            </button>
            <button
              type="button"
              onClick={async () => {
                await authClient.signOut();
                router.push("/");
                router.refresh();
              }}
              className="inline-flex items-center gap-2 py-[0.7rem] px-[1.5rem] text-[0.95rem] font-bold text-red-600 dark:text-red-400 hover:bg-red-500/10 border border-red-500/20 rounded-md transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Edit Form */}
      <div ref={formRef} className="w-full scroll-mt-28">
        <div 
          className={`grid transition-[grid-template-rows,opacity,margin] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isEditing 
              ? 'grid-rows-[1fr] opacity-100 mt-4' 
              : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'
          }`}
        >
          <div className="overflow-hidden">
            <form onSubmit={handleSubmit(onSubmit)} className="bg-bg-card border-[1.5px] border-border-color rounded-lg p-[1.5rem] sm:p-[2.25rem] shadow-bottom-sm flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-border-subtle pb-4 mb-2">
              <h3 className="font-heading font-semibold text-lg text-text-primary dark:text-white">Edit Profile Details</h3>
              <button 
                type="button" 
                onClick={handleCancel}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-bg-tag text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>

            <div className="text-sm text-text-muted">
              <button type="button" disabled={isFilling || isSaving} onClick={() => void fillFromResume()} className="font-semibold underline disabled:opacity-50">{isFilling ? "Loading contact details…" : "Fill empty fields from my resume"}</button>
              <p className="mt-1">Only fills blank fields. Review these details before Save Changes.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={labelClass} htmlFor="fullName">
                  Full Name <span className="text-brand-red">*</span>
                </label>
                <input
                  id="fullName"
                  {...register("fullName")}
                  className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`}
                  placeholder="e.g. Alex Morgan"
                />
                {errors.fullName && <span className="text-red-500 text-sm mt-1">{errors.fullName.message}</span>}
              </div>

              <div>
                <label className={labelClass} htmlFor="phoneNumber">
                  Phone Number
                </label>
                <div className="flex gap-2">
                  <input
                    id="countryCode"
                    {...register("countryCode")}
                    className={`font-mono w-[80px] px-3 py-2.5 text-center ${INPUT_BASE_CLASSES}`}
                    placeholder="+1"
                  />
                  <input
                    id="phoneNumber"
                    {...register("phoneNumber")}
                    className={`font-mono tracking-tight flex-1 px-4 py-2.5 ${INPUT_BASE_CLASSES}`}
                    placeholder="e.g. 234 567 890"
                  />
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="country">
                  Country <span className="text-brand-red">*</span>
                </label>
                <input
                  id="country"
                  {...register("country")}
                  className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`}
                  placeholder="e.g. United States"
                />
                {errors.country && <span className="text-red-500 text-sm mt-1">{errors.country.message}</span>}
              </div>

              <div>
                <label className={labelClass} htmlFor="location">
                  City / Location
                </label>
                <input
                  id="location"
                  {...register("location")}
                  className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`}
                  placeholder="e.g. San Francisco, CA"
                />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border-subtle flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="py-[0.85rem] px-[1.5rem] text-[0.92rem] font-bold text-text-muted hover:text-text-primary dark:hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !isDirty}
                className="py-[0.85rem] px-[2rem] text-[0.98rem] font-bold bg-brand-lime text-[#111827] border-[1.5px] border-border-color rounded-md shadow-[0_3px_0_0_var(--shadow-color)] cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1.5px] hover:shadow-[0_4px_0_0_var(--shadow-color)] hover:bg-white active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--shadow-color)] disabled:opacity-70 disabled:hover:translate-y-0 disabled:shadow-none disabled:cursor-not-allowed"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
        </div>
      </div>
    </div>
  );
}
