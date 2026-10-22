"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Download, X, Edit3, FileText, Check, 
  AlertTriangle, Loader2, Lock, ChevronDown 
} from "lucide-react";
import { ResumeSheet } from "@/components/ResumeSheet";
import { useResumeStore } from "@/store/useResumeStore";
import { 
  ResumeTemplate, 
  getTemplateById 
} from "@/data/resume-templates";
import { markTailoredResumeReady } from "@/app/actions/tailored-resume";
import { toast } from "sonner";
import { resumeContentError } from "@/lib/resume-validation";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/utils/scrollLock";
import { CertifiedResumeModal } from "./CertifiedResumeModal";

export interface ResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId?: string;
  expectedGenerationId?: string | null;
  readOnly?: boolean;
  initialMode?: "view" | "edit";
  initialMarkdown?: string;
  templateId?: string;
  reviewReason?: string | null;
  status?: "queued" | "running" | "completed" | "needs_review" | "failed";
  onSave?: (
    markdown: string,
    templateId?: string,
    expectedGenerationId?: string | null
  ) => Promise<{ success: boolean; error?: string; code?: string } | boolean | void> | void;
  onMarkReady?: () => Promise<void> | void;
}

export function ResumeModal(props:ResumeModalProps){
  return process.env.NEXT_PUBLIC_RESUME_CERTIFIED_PUBLICATION === "true" ? (props.isOpen?<CertifiedResumeModal key={`${props.jobId}-${props.expectedGenerationId}-${props.templateId}`} {...props}/>:null) : <LegacyResumeModal {...props}/>;
}

function LegacyResumeModal({
  isOpen,
  onClose,
  jobId,
  expectedGenerationId,
  readOnly = false,
  initialMode = "view",
  initialMarkdown,
  templateId,
  reviewReason,
  status,
  onSave,
  onMarkReady,
}: ResumeModalProps) {

  const store = useResumeStore();

  const [mode, setMode] = useState<"view" | "visual-edit">(
    initialMode === "edit" ? "visual-edit" : "view"
  );
  
  // Working state during modal session
  const [currentTemplateId, setCurrentTemplateId] = useState<string>(
    templateId || store.selectedTemplateId
  );
  const [currentMarkdown, setCurrentMarkdown] = useState<string>(
    initialMarkdown || store.resumeMarkdown
  );
  const [savedBaselineMarkdown, setSavedBaselineMarkdown] = useState<string>(
    initialMarkdown || store.resumeMarkdown
  );
  const [zoom, setZoom] = useState<number>(1);
  const [fitZoom, setFitZoom] = useState<number>(1);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [, setIsOverflowing] = useState<boolean>(false);
  const [pageCount, setPageCount] = useState<number>(1);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isApprovingDraft, setIsApprovingDraft] = useState(false);
  const [isReadyMarked, setIsReadyMarked] = useState(false);
  const [isNoticeDialogOpen, setIsNoticeDialogOpen] = useState(false);

  // Active template derived from modal's working templateId
  const activeTemplate: ResumeTemplate = getTemplateById(currentTemplateId);

  // Dynamic Auto-fit Zoom calculation for crisp mobile view without horizontal overflow
  useEffect(() => {
    if (!isOpen) return;

    const calculateFitZoom = () => {
      if (typeof window === "undefined") return;
      let fit = 1;
      if (window.innerWidth < 640) {
        // Mobile: 32px padding, scaling so document fits comfortably without horizontal scroll
        const availableWidth = window.innerWidth - 32;
        fit = Math.min(0.48, Math.max(0.35, Math.round((availableWidth / 794) * 100) / 100));
      } else if (window.innerWidth < 1024) {
        fit = 0.85;
      } else {
        fit = 1;
      }
      setFitZoom(fit);
      setZoom(fit);
    };

    calculateFitZoom();
    window.addEventListener("resize", calculateFitZoom);
    return () => window.removeEventListener("resize", calculateFitZoom);
  }, [isOpen]);

  // Canvas-scoped Trackpad Pinch & Ctrl + Mouse Wheel listener (Non-passive to prevent full-webpage zoom)
  useEffect(() => {
    const container = workspaceRef.current;
    if (!container || !isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); // Stop native browser window/page zoom
        const zoomDelta = -e.deltaY * 0.003;
        setZoom((prev) => {
          const next = Math.round((prev + zoomDelta) * 100) / 100;
          return Math.min(2.0, Math.max(0.3, next));
        });
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [isOpen]);

  // Canvas-scoped Mobile 2-Finger Touch Pinch Zoom listener
  useEffect(() => {
    const container = workspaceRef.current;
    if (!container || !isOpen) return;

    let initialDist = 0;
    let startZoom = 1;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault(); // Stop native mobile page zoom
        const [t1, t2] = [e.touches[0], e.touches[1]];
        initialDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        startZoom = zoom;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDist > 0) {
        e.preventDefault(); // Stop mobile viewport scaling
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const ratio = currentDist / initialDist;
        const nextZoom = Math.min(2.0, Math.max(0.3, Math.round(startZoom * ratio * 100) / 100));
        setZoom(nextZoom);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialDist = 0;
      }
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isOpen, zoom]);

  // Reset state on modal open during render before paint
  if (!prevIsOpen && isOpen) {
    setPrevIsOpen(true);
    const activeTmpl = templateId || store.selectedTemplateId;
    const initialMd = initialMarkdown || store.resumeMarkdown;
    setCurrentTemplateId(activeTmpl);
    setCurrentMarkdown(initialMd);
    setSavedBaselineMarkdown(initialMd);
    setMode(readOnly ? "view" : initialMode === "edit" ? "visual-edit" : "view");
    setIsReadyMarked(false);
    setIsNoticeDialogOpen(false);

  } else if (prevIsOpen && !isOpen) {
    setPrevIsOpen(false);
  }

  // Manage body scroll locking
  useEffect(() => {
    if (isOpen) {
      lockBodyScroll();
      return () => {
        unlockBodyScroll();
      };
    }
  }, [isOpen]);

  // Handle escape key and keyboard zoom shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isNoticeDialogOpen) {
          setIsNoticeDialogOpen(false);
        } else {
          onClose();
        }
        return;
      }

      // Keyboard Canvas Zoom shortcuts: Ctrl/Cmd + (+/-), Ctrl/Cmd + 0 to reset
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom((prev) => Math.min(2.0, Math.round((prev + 0.1) * 10) / 10));
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        setZoom((prev) => Math.max(0.3, Math.round((prev - 0.1) * 10) / 10));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        setZoom(fitZoom);
      }
    };
    if (isOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isNoticeDialogOpen, fitZoom]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const error = resumeContentError(currentMarkdown);
    if (error) { toast.error(error); return; }
    if (readOnly) {
      toast.error("This is a historical draft and cannot be edited.");
      return;
    }
    try {
      if (onSave) {
        const result = await onSave(currentMarkdown, currentTemplateId, expectedGenerationId);
        if (result === false || (result && typeof result === "object" && !result.success)) {
          if (typeof result === "object" && result.code === "STALE_GENERATION") {
            toast.error(
              result.error || "A newer draft was generated in the background. Please refresh to load the latest version."
            );
            return;
          }
          toast.error((typeof result === "object" && result.error) || "Failed to save tailored resume.");
          return;
        }
        setIsReadyMarked(false);
        setSavedBaselineMarkdown(currentMarkdown);
        setMode("view");
        toast.success("Tailored resume saved successfully!");
        return;
      }

      const success = await store.saveResume(currentMarkdown, currentTemplateId);
      if (success) {
        setSavedBaselineMarkdown(currentMarkdown);
        setMode("view");
        toast.success("Resume saved successfully!", {
          description: `Active template: ${activeTemplate.name}. Saved locally.`,
        });
      } else {
        toast.error("Failed to save resume locally");
      }
    } catch {
      toast.error("Error saving resume");
    }
  };

  const handleCancel = () => {
    setCurrentMarkdown(savedBaselineMarkdown);
    setMode("view");
  };

  const handleApproveDraft = async () => {
    if (!jobId) return;
    if (currentMarkdown !== savedBaselineMarkdown) { toast.error("Save your corrections before approving this version."); return; }
    try {
      setIsApprovingDraft(true);
      if (onMarkReady) {
        await onMarkReady();
      } else {
        const res = await markTailoredResumeReady(jobId, expectedGenerationId);
        if (!res.success) {
          toast.error(res.error || "Failed to approve draft.");
          return;
        }
      }
      setIsReadyMarked(true);
      toast.success("Draft approved and marked as ready!");
    } catch {
      toast.error("Failed to approve draft.");
    } finally {
      setIsApprovingDraft(false);
    }
  };

  const handleDownloadPdf = async () => {
    const contentError = resumeContentError(currentMarkdown);
    if (contentError) { toast.error(contentError); return; }
    if ((status === "needs_review" || reviewReason) && !isReadyMarked) { toast.error("Review and approve this saved draft before exporting."); return; }
    // Every download goes through current generation and content validation.
    if (!jobId) {
      // Fallback for previews without an active jobId (e.g. Manage Job Hunt preview)
      window.print();
      return;
    }

    try {
      setIsDownloading(true);
      toast.info("Preparing your download...", { duration: 3000 });

      const res = await fetch("/api/resume/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          markdown: currentMarkdown,
          templateId: currentTemplateId,
          expectedGenerationId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === "STALE_GENERATION") {
          toast.error("A newer draft was generated in the background. Please reload the latest version before downloading.");
        } else {
          toast.error(data.error || "Failed to prepare PDF download.");
        }
        return;
      }

      if (data.downloadUrl) {
        toast.success("Download started!");

        const a = document.createElement("a");
        a.href = data.downloadUrl;
        a.download = `${(activeTemplate.name || "Resume").replace(/\s+/g, "_")}.pdf`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Unable to download resume. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const isDraftOrReview = (status === "needs_review" || Boolean(reviewReason)) && !isReadyMarked;
  const showNotice = mode === "view" && isDraftOrReview;

  return (
    <div className="fixed inset-0 z-[1050] font-body print:p-0">
      {/* Dark Blur Backdrop */}
      <div
        className="no-print absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto"
        onClick={() => {
          if (mode === "view") onClose();
        }}
      />

      {/* Top Floating Ribbon: Single-Row Architecture on All Views */}
      <header className="no-print absolute top-0 left-0 right-0 z-[110] h-13 sm:h-14 px-3 sm:px-6 bg-[#11131a]/95 backdrop-blur-md border-b border-[#2B3042]/80 flex items-center justify-between gap-2">
        {/* Left: Document Icon & Style Indicator (No preview text) */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink">
          <FileText className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-brand-lime dark:text-[#ACEE5F] shrink-0" strokeWidth={2.5} />
          
          {/* Static Style Indicator (Slim, low hierarchy, no glowing dot) */}
          <div className="flex items-center gap-1 h-7 px-2.5 rounded-[8px] bg-white/5 border border-white/10 text-gray-300 text-[0.72rem] sm:text-xs font-medium select-none truncate">
            <span className="text-gray-400 font-normal">Style:</span>
            <span className="text-white font-semibold truncate max-w-[110px] xs:max-w-[150px] sm:max-w-none">{activeTemplate.name}</span>
          </div>
        </div>

        {/* Right: Desktop Action Buttons (Hidden on mobile, mobile uses bottom-right FAB) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {readOnly ? (
            <div className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
              <Lock className="w-3.5 h-3.5" />
              <span className="text-[0.72rem] sm:text-xs">Historical Draft</span>
            </div>
          ) : mode === "visual-edit" ? (
            /* Desktop Edit Mode: Cancel (Left) then Save Changes (Right) */
            <div className="hidden sm:flex items-center gap-1.5 sm:gap-2 animate-in fade-in duration-200">
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center gap-1 h-8 px-2.5 sm:px-3 rounded-[8px] bg-white/10 hover:bg-white/15 text-white border border-white/15 font-heading text-xs font-semibold transition-all cursor-pointer active:scale-[0.98]"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2} />
                <span>Cancel</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={store.isSaving}
                className="inline-flex items-center gap-1.5 h-8 px-3 sm:px-3.5 rounded-[8px] bg-brand-lime text-[#111827] hover:bg-white hover:text-[#111827] font-heading text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-[0.98] disabled:opacity-60"
              >
                {store.isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" strokeWidth={2.8} />
                )}
                <span>{store.isSaving ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          ) : (
            /* Desktop View Mode: Edit then Download */
            <div className="hidden sm:flex items-center gap-1.5 sm:gap-2 animate-in fade-in duration-200">
              <button
                type="button"
                onClick={() => setMode("visual-edit")}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-[8px] bg-white/10 hover:bg-white/15 text-white border border-white/15 font-heading text-xs font-semibold transition-all cursor-pointer active:scale-[0.98]"
                title="Edit resume directly on paper"
              >
                <Edit3 className="w-3.5 h-3.5 text-brand-lime" strokeWidth={2.2} />
                <span>Edit</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                className="inline-flex items-center gap-1.5 h-8 px-3 sm:px-3.5 rounded-[8px] bg-brand-lime text-[#111827] hover:bg-white hover:text-[#111827] font-heading text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-[0.98] disabled:opacity-60"
                title="Download your resume as PDF"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Downloading...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" strokeWidth={2.5} />
                    <span>Download</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Close Button (Circular, transparent resting state, container visible only on hover, no red) */}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-transparent border border-transparent text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/15 flex items-center justify-center transition-all duration-150 cursor-pointer shrink-0 ml-1 active:scale-95"
            aria-label="Close Viewer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {/* Desktop Docked Draft Notice Banner (Hidden on mobile and in edit mode) */}
      {showNotice && (
        <div className="no-print absolute top-13 sm:top-14 left-0 right-0 z-[109] hidden sm:block bg-amber-500/15 backdrop-blur-md border-b border-amber-500/30 text-amber-200 animate-in fade-in duration-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-start gap-3 sm:gap-4 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs leading-snug">
                <strong className="text-amber-300">Draft Notice:</strong>{" "}
                {reviewReason || "This resume is currently saved as a draft."}
              </p>
            </div>

            <button
              type="button"
              onClick={handleApproveDraft}
              disabled={isApprovingDraft}
              className="inline-flex items-center gap-1.5 h-6.5 px-2.5 rounded-[6px] bg-[#111827] text-white hover:bg-black font-heading text-xs font-bold border border-white/20 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-60 shadow-xs shrink-0"
            >
              {isApprovingDraft ? (
                <Loader2 className="w-3 h-3 animate-spin text-white" />
              ) : (
                <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.8} />
              )}
              <span>Approve Draft</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Collapsible Draft Notice Pill (Only shown on mobile in view mode) */}
      {showNotice && (
        <div className="no-print absolute top-14 left-0 right-0 z-[109] sm:hidden flex justify-center pt-2 pointer-events-none">
          <button
            type="button"
            onClick={() => setIsNoticeDialogOpen(true)}
            className="pointer-events-auto inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold backdrop-blur-md shadow-md active:scale-95 transition-all cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Draft Notice</span>
            <ChevronDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          </button>
        </div>
      )}

      {/* Mobile Draft Notice Dialog Overlay Modal */}
      {isNoticeDialogOpen && (
        <div className="no-print fixed inset-0 z-[1200] flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setIsNoticeDialogOpen(false)}
          />

          <div className="relative w-full max-w-sm bg-[#161822] border border-[#2B3042] rounded-2xl p-5 shadow-2xl z-10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#2B3042]">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-heading font-bold text-sm text-white">Draft Review Notice</span>
              </div>
              <button
                type="button"
                onClick={() => setIsNoticeDialogOpen(false)}
                className="p-1 rounded-md text-gray-400 hover:text-white transition-colors"
                aria-label="Close Notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-gray-300 text-xs sm:text-sm leading-relaxed mb-5">
              {reviewReason || "This tailored resume is currently saved as a draft. You can review and edit before approving."}
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsNoticeDialogOpen(false)}
                className="h-9 px-3.5 rounded-[8px] bg-white/10 hover:bg-white/15 text-white font-heading text-xs font-semibold transition-all cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleApproveDraft();
                  setIsNoticeDialogOpen(false);
                }}
                disabled={isApprovingDraft}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[8px] bg-brand-lime text-[#111827] hover:bg-white font-heading text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-60 shadow-xs"
              >
                {isApprovingDraft ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" strokeWidth={2.8} />
                )}
                <span>Approve Draft</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Document Workspace */}
      <div 
        ref={workspaceRef}
        style={{ touchAction: "pan-x pan-y" }}
        className={`absolute inset-0 pb-24 overflow-auto custom-scrollbar flex justify-center z-[105] px-2 sm:px-4 print:p-0 print:m-0 print:static print:overflow-visible ${
          showNotice
            ? "pt-24 sm:pt-24"
            : "pt-16 sm:pt-20"
        }`}
      >
        {/* Constrained layout bounding box: eliminates 794px phantom overflow & centers perfectly on mobile */}
        <div
          className="relative flex flex-col items-center justify-start print-only-sheet transition-all duration-200"
          style={{
            width: `${Math.round(794 * zoom)}px`,
            minHeight: `${Math.round(pageCount * 1123 * zoom)}px`,
          }}
        >
          {mode === "visual-edit" && (
            <div className="no-print mb-3 px-3.5 py-1 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-semibold flex items-center gap-2">
              <Edit3 className="w-3.5 h-3.5" />
              <span>Click directly on any text or bullet point on the paper to edit</span>
            </div>
          )}

          <div
            style={{
              width: "210mm",
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
            }}
          >
            <ResumeSheet
              markdown={currentMarkdown}
              themeId={activeTemplate.themeId}
              zoom={1}
              isEditable={mode === "visual-edit"}
              onMarkdownChange={(newMd) => setCurrentMarkdown(newMd)}
              onOverflowChange={setIsOverflowing}
              onPageCountChange={setPageCount}
            />
          </div>
        </div>
      </div>

      {/* Floating Action Buttons (FAB): Icon-only circular buttons vertically stacked (Edit on top of Download) */}
      {!readOnly && (
        <aside 
          aria-label="Resume actions" 
          className="no-print fixed bottom-6 right-5 z-[120] sm:hidden flex flex-col items-center gap-3 animate-in fade-in duration-200"
        >
          {mode === "visual-edit" ? (
            /* Mobile Edit Mode FAB: Cancel on Top, Save Changes on Bottom */
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="w-12 h-12 rounded-full bg-[#1A1D27]/95 border border-white/20 text-white shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-md flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                title="Cancel Edits"
                aria-label="Cancel Edits"
              >
                <X className="w-5 h-5 text-red-400" strokeWidth={2.2} />
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={store.isSaving}
                className="w-12 h-12 rounded-full bg-brand-lime text-[#111827] shadow-[0_4px_20px_rgba(185,255,102,0.4)] flex items-center justify-center active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                title="Save Changes"
                aria-label="Save Changes"
              >
                {store.isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Check className="w-5 h-5" strokeWidth={3} />
                )}
              </button>
            </>
          ) : (
            /* Mobile View Mode FAB: Edit on Top, Download on Bottom */
            <>
              <button
                type="button"
                onClick={() => setMode("visual-edit")}
                className="w-12 h-12 rounded-full bg-[#1A1D27]/95 border border-white/20 text-white shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-md flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                title="Edit Resume"
                aria-label="Edit Resume"
              >
                <Edit3 className="w-5 h-5 text-brand-lime" strokeWidth={2.2} />
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                className="w-12 h-12 rounded-full bg-brand-lime text-[#111827] shadow-[0_4px_20px_rgba(185,255,102,0.4)] flex items-center justify-center active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                title="Download Resume"
                aria-label="Download Resume"
              >
                {isDownloading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" strokeWidth={2.5} />
                )}
              </button>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
