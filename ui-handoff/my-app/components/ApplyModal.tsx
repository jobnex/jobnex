"use client";

import { useJobStore } from "@/store/useJobStore";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useEffect } from "react";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/utils/scrollLock";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  urgency: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export function ApplyModal() {
  const isModalOpen = useJobStore((s) => s.isModalOpen);
  const closeModal = useJobStore((s) => s.closeModal);
  const selectedJob = useJobStore((s) => s.selectedJob);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  // Escape key accessibility
  useEscapeKey(closeModal, isModalOpen);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      lockBodyScroll();
      return () => {
        unlockBodyScroll();
      };
    }
  }, [isModalOpen]);

  // Reset form when modal opens with a new job
  useEffect(() => {
    if (isModalOpen) {
      reset();
    }
  }, [isModalOpen, reset]);

  if (!isModalOpen || !selectedJob) return null;

  const onSubmit = async () => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 800));
    
    toast.success("Resume request submitted successfully!", {
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
    
    closeModal();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-[6px] flex items-center justify-center z-[1000] p-3 sm:p-6">
      <div 
        className="bg-bg-card border-[1.5px] border-border-color rounded-lg w-full max-w-[520px] p-5 sm:p-8 shadow-bottom-lg relative max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={closeModal}
          className="absolute top-[1.25rem] right-[1.25rem] w-8 h-8 rounded-xs border border-border-subtle bg-bg-tag text-text-primary text-[1.25rem] flex items-center justify-center font-bold cursor-pointer transition-all duration-150 hover:bg-[#FF3B5C] hover:text-white hover:border-[#FF3B5C]"
          aria-label="Close dialog"
        >
          &times;
        </button>

        <div className="mb-[1.5rem]">
          <span className="inline-block bg-brand-lime text-[#111827] px-[0.65rem] py-[0.2rem] rounded-xs border-[1.5px] border-border-color font-heading text-[0.85rem] font-semibold mb-[0.5rem]">
            Candidate Resume Request
          </span>
          <h3 className="text-[1.65rem] font-heading font-semibold mb-[0.25rem]">Request Resumes</h3>
          <p className="text-[0.95rem] text-text-muted font-semibold">{selectedJob.company} - {selectedJob.jobRoleTitle}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-[0.35rem]">
            <label className="font-bold text-[0.88rem] text-text-primary" htmlFor="name">
              Your Name / Organization
            </label>
            <input
              id="name"
              {...register("name")}
              className="p-[0.75rem_1rem] font-body text-[0.92rem] border border-border-input rounded-md bg-bg-input text-text-primary outline-none transition-all duration-150 focus:bg-white focus:border-[#111827] focus:shadow-[0_0_0_1px_#111827,0_2px_6px_rgba(17,24,39,0.05)] dark:focus:bg-[#1C1E24] dark:focus:border-brand-lime dark:focus:shadow-[0_0_0_1px_var(--color-brand-lime),0_2px_8px_rgba(0,0,0,0.3)]"
              placeholder="e.g. Alex Morgan / Acme Corp"
            />
            {errors.name && <span className="text-red-500 text-sm mt-1">{errors.name.message}</span>}
          </div>

          <div className="flex flex-col gap-[0.35rem]">
            <label className="font-bold text-[0.88rem] text-text-primary" htmlFor="email">
              Work Email
            </label>
            <input
              id="email"
              type="email"
              {...register("email")}
              className="p-[0.75rem_1rem] font-body text-[0.92rem] border border-border-input rounded-md bg-bg-input text-text-primary outline-none transition-all duration-150 focus:bg-white focus:border-[#111827] focus:shadow-[0_0_0_1px_#111827,0_2px_6px_rgba(17,24,39,0.05)] dark:focus:bg-[#1C1E24] dark:focus:border-brand-lime dark:focus:shadow-[0_0_0_1px_var(--color-brand-lime),0_2px_8px_rgba(0,0,0,0.3)]"
              placeholder="alex@company.com"
            />
            {errors.email && <span className="text-red-500 text-sm mt-1">{errors.email.message}</span>}
          </div>

          <div className="flex flex-col gap-[0.35rem]">
            <label className="font-bold text-[0.88rem] text-text-primary" htmlFor="urgency">
              Hiring Urgency / Target Start Date
            </label>
            <input
              id="urgency"
              {...register("urgency")}
              className="p-[0.75rem_1rem] font-body text-[0.92rem] border border-border-input rounded-md bg-bg-input text-text-primary outline-none transition-all duration-150 focus:bg-white focus:border-[#111827] focus:shadow-[0_0_0_1px_#111827,0_2px_6px_rgba(17,24,39,0.05)] dark:focus:bg-[#1C1E24] dark:focus:border-brand-lime dark:focus:shadow-[0_0_0_1px_var(--color-brand-lime),0_2px_8px_rgba(0,0,0,0.3)]"
              placeholder="e.g. Immediate / Next 30 days"
            />
          </div>

          <div className="flex flex-col gap-[0.35rem]">
            <label className="font-bold text-[0.88rem] text-text-primary" htmlFor="notes">
              Specific Requirements or Candidate Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              {...register("notes")}
              className="p-[0.75rem_1rem] font-body text-[0.92rem] border border-border-input rounded-md bg-bg-input text-text-primary outline-none transition-all duration-150 focus:bg-white focus:border-[#111827] focus:shadow-[0_0_0_1px_#111827,0_2px_6px_rgba(17,24,39,0.05)] dark:focus:bg-[#1C1E24] dark:focus:border-brand-lime dark:focus:shadow-[0_0_0_1px_var(--color-brand-lime),0_2px_8px_rgba(0,0,0,0.3)] resize-y"
              placeholder="Describe the candidate skill set or senior level you require..."
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 py-[0.85rem] px-[1.5rem] text-[0.98rem] font-bold bg-brand-lime text-[#111827] border-[1.5px] border-border-color rounded-md shadow-[0_3px_0_0_var(--shadow-color)] cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1.5px] hover:shadow-[0_4px_0_0_var(--shadow-color)] hover:bg-white active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--shadow-color)] disabled:opacity-70 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Sending..." : "Send Resume Request"}
          </button>
        </form>
      </div>
    </div>
  );
}
