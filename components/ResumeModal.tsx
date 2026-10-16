"use client";

import { useState, useEffect, useRef } from "react";
import {
  Download, X, Edit3, FileText, Check,
  ZoomIn, ZoomOut, AlertTriangle, Printer,
  Code2, Eye, Sparkles, ChevronDown, Loader2, Lock
} from "lucide-react";
import { ResumeSheet } from "@/components/ResumeSheet";
import { useResumeStore } from "@/store/useResumeStore";
import {
  RESUME_TEMPLATES,
  ResumeTemplate,
  getTemplateById
} from "@/data/resume-templates";
import { downloadMarkdownFile } from "@/lib/resumeApi";
import { toast } from "sonner";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/utils/scrollLock";

interface ResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId?: string;
  expectedGenerationId?: string | null;
  readOnly?: boolean;
  initialMode?: "view" | "edit";
  initialMarkdown?: string;
  templateId?: string;
  reviewReason?: string | null;
  onSave?: (
    markdown: string,
    templateId?: string,
    expectedGenerationId?: string | null
  ) => Promise<{ success: boolean; error?: string; code?: string } | boolean | void> | void;
}

export function ResumeModal({
  isOpen,
  onClose,
  jobId,
  expectedGenerationId,
  readOnly = false,
  initialMode = "view",
  initialMarkdown,
  templateId,
  reviewReason,
  onSave,
}: ResumeModalProps) {

  const store = useResumeStore();

  const [mode, setMode] = useState<"view" | "visual-edit" | "raw-edit">(
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
  const [pageCount, setPageCount] = useState<number>(1);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState<boolean>(false);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [isExporting, setIsExporting] = useState(false);
  const [exportedDownloadUrl, setExportedDownloadUrl] = useState<string | null>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  // Active template derived from modal's working templateId
  const activeTemplate: ResumeTemplate = getTemplateById(currentTemplateId);

  // Reset state on modal open during render before paint
  if (!prevIsOpen && isOpen) {
    setPrevIsOpen(true);
    const activeTmpl = templateId || store.selectedTemplateId;
    const initialMd = initialMarkdown || store.resumeMarkdown;
    setCurrentTemplateId(activeTmpl);
    setCurrentMarkdown(initialMd);
    setSavedBaselineMarkdown(initialMd);
    setMode(readOnly ? "view" : initialMode === "edit" ? "visual-edit" : "view");
    const initialZoom =
      typeof window !== "undefined" && window.innerWidth < 820
        ? Math.max(0.4, Math.min(1, Math.round(((window.innerWidth - 24) / 794) * 100) / 100))
        : 1;
    setZoom(initialZoom);
    setIsTemplateMenuOpen(false);
    setExportedDownloadUrl(null);

  } else if (prevIsOpen && !isOpen) {
    setPrevIsOpen(false);
  }


  // Invalidate compiled PDF link when working markdown or template changes
  useEffect(() => {
    setExportedDownloadUrl(null);
  }, [currentMarkdown, currentTemplateId]);

  // Manage body scroll locking
  useEffect(() => {
    if (isOpen) {
      lockBodyScroll();
      return () => {
        unlockBodyScroll();
      };
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isTemplateMenuOpen) {
          setIsTemplateMenuOpen(false);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isTemplateMenuOpen]);

  // Click outside to close template menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target as Node)) {
        setIsTemplateMenuOpen(false);
      }
    };
    if (isTemplateMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isTemplateMenuOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (readOnly) {
      toast.error("This is a historical draft and cannot be edited.");
      return;
    }
    try {
      if (onSave) {
        const result = await onSave(currentMarkdown, currentTemplateId, expectedGenerationId);
        if (result && typeof result === "object" && !result.success) {
          if (result.code === "STALE_GENERATION") {
            toast.error(
              result.error || "A newer draft was generated in the background. Please refresh to load the latest version."
            );
            return;
          }
          toast.error(result.error || "Failed to save tailored resume.");
          return;
        }
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
          description: `Active template: ${activeTemplate.name}. Compilation payload stored locally.`,
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

  const handleDownloadMd = () => {
    downloadMarkdownFile(currentMarkdown, `${activeTemplate.id}_resume.md`);
    toast.info("Downloaded resume as Markdown (.md)");
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      const response = await fetch(jobId ? "/api/resume/export" : "/api/resume/base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(jobId ? { jobId, ...(expectedGenerationId ? { expectedGenerationId } : {}) } : {}),
          markdown: currentMarkdown, templateId: currentTemplateId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "PDF export failed. Please retry.");
      }
      let url: string;
      let temporary = false;
      if (jobId) {
        const data = await response.json();
        if (!data.downloadUrl) throw new Error("The PDF download link is missing.");
        url = data.downloadUrl;
        setExportedDownloadUrl(url);
      } else {
        url = URL.createObjectURL(await response.blob());
        temporary = true;
      }
      const link = document.createElement("a");
      link.href = url; link.download = `${currentTemplateId}_resume.pdf`;
      link.target = "_blank"; link.rel = "noopener noreferrer";
      document.body.appendChild(link); link.click(); link.remove();
      if (temporary) setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success("PDF ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF export failed. Please retry.");
    } finally { setIsExporting(false); }
  };


  return (
    <div className="fixed inset-0 z-[1050] font-body print:p-0">
      {/* Print-specific style sheet for exact 210mm x 297mm ISO A4 vector PDF generation */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print,
          .no-print * {
            display: none !important;
          }
          .print-only-sheet {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            transform: none !important;
            box-shadow: none !important;
          }
          .resume-section-item {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .resume-section-header {
            break-after: avoid !important;
            page-break-after: avoid !important;
          }
        }
      `}</style>

      {/* Dark Blur Backdrop (Hidden on Print) */}
      <div
        className="no-print absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto"
        onClick={() => {
          if (mode === "view") onClose();
        }}
      />

      {/* Top Floating Bar: Fixed Height & Balanced Zones (Hidden on Print) */}
      <header className="no-print absolute top-0 left-0 right-0 z-[110] px-3 sm:px-6 py-2.5 md:py-0 md:h-16 bg-[#11131a]/95 backdrop-blur-md border-b border-white/10 flex items-center">
        <div className="w-full max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-4">
          {/* Zone 1: Document Metadata & Style (Title + Template + Page Count + Mobile Close) */}
          <div className="flex items-center justify-between md:justify-start gap-2 sm:gap-3 w-full md:w-auto shrink-0">
            <div className="flex items-center gap-2 text-white font-heading font-semibold text-sm sm:text-base md:text-[1.1rem] drop-shadow-md shrink-0">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-brand-lime dark:text-[#ACEE5F] shrink-0" strokeWidth={2.5} />
              <span className="whitespace-nowrap">Resume Preview</span>
            </div>

            {/* Template Selector Dropdown */}
            <div className="relative shrink-0" ref={templateMenuRef}>
              <button
                type="button"
                onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[0.72rem] sm:text-xs font-semibold backdrop-blur-sm transition-all cursor-pointer"
              >
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-brand-lime animate-pulse shrink-0" />
                <span className="truncate max-w-[100px] sm:max-w-none">{activeTemplate.name}</span>
                <span className="text-white/60 text-[0.65rem] sm:text-[0.7rem] uppercase font-mono hidden xs:inline">
                  Theme {activeTemplate.themeId}
                </span>
                <ChevronDown className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/70 transition-transform duration-200 shrink-0 ${isTemplateMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {isTemplateMenuOpen && (
                <div className="absolute left-0 top-full mt-2 w-[260px] sm:w-[280px] bg-[#1a1c24] border border-[#2e3344] rounded-xl shadow-2xl p-2 text-white z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 text-[0.7rem] font-bold text-gray-400 uppercase tracking-wider border-b border-[#2e3344] mb-1">
                    Select Template & Theme
                  </div>
                  <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar">
                    {RESUME_TEMPLATES.map((tmpl) => {
                      const isSelected = tmpl.id === currentTemplateId;
                      return (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => {
                            setCurrentTemplateId(tmpl.id);
                            setIsTemplateMenuOpen(false);
                            toast.info(`Switched style to ${tmpl.name} (Theme ${tmpl.themeId})`);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-brand-lime text-[#111827] font-bold"
                              : "hover:bg-white/10 text-gray-200"
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold">{tmpl.name}</span>
                            <span className={`text-[0.68rem] ${isSelected ? "text-black/70" : "text-gray-400"}`}>
                              {tmpl.category}
                            </span>
                          </div>
                          <span className={`text-[0.68rem] font-mono px-1.5 py-0.5 rounded ${
                            isSelected ? "bg-black/20 text-black font-bold" : "bg-white/10 text-gray-300"
                          }`}>
                            T{tmpl.themeId}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Close Button */}
            <div className="flex md:hidden items-center ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-md bg-[#FF3B5C]/20 text-[#FF3B5C] hover:bg-[#FF3B5C] hover:text-white border border-[#FF3B5C]/40 transition-colors cursor-pointer"
                aria-label="Close Viewer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Zone 2 & 3: Canvas Controls + Action Buttons + Desktop Close (No-wrap on desktop) */}
          <div className="flex items-center justify-between md:justify-end gap-2 sm:gap-2.5 flex-nowrap overflow-x-auto md:overflow-visible w-full md:w-auto pb-0.5 md:pb-0 shrink-0">
            {/* Mode Switcher Tabs or Read-Only Pill */}
            {readOnly ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold shrink-0">
                <Lock className="w-3.5 h-3.5" />
                <span className="text-[0.74rem] sm:text-xs">Historical Draft (View Only)</span>
              </div>
            ) : (
              <div className="flex items-center bg-[#151720] border border-[#2B3042] rounded-md p-0.5 text-xs text-white shrink-0">
                <button
                  type="button"
                  onClick={() => setMode("view")}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded font-bold transition-all cursor-pointer ${
                    mode === "view"
                      ? "bg-white/20 text-white shadow-xs"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="text-[0.74rem] sm:text-xs">View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("visual-edit")}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded font-bold transition-all cursor-pointer ${
                    mode === "visual-edit"
                      ? "bg-brand-lime text-[#111827] shadow-xs"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span className="text-[0.74rem] sm:text-xs">Visual Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("raw-edit")}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded font-bold transition-all cursor-pointer ${
                    mode === "raw-edit"
                      ? "bg-white/20 text-white shadow-xs"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span className="text-[0.74rem] sm:text-xs">Markdown</span>
                </button>
              </div>
            )}

            {/* Zoom Controls */}
            <div className="flex items-center bg-[#151720] border border-[#2B3042] rounded-md text-white shrink-0">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
                className="p-1 sm:p-1.5 hover:bg-white/10 transition-colors cursor-pointer border-r border-[#2B3042]"
                aria-label="Zoom Out"
              >
                <ZoomOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
              <span className="text-[0.72rem] sm:text-[0.78rem] font-bold px-1.5 sm:px-2 w-[46px] text-center shrink-0">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.0, Math.round((z + 0.25) * 100) / 100))}
                className="p-1 sm:p-1.5 hover:bg-white/10 transition-colors cursor-pointer border-l border-[#2B3042]"
                aria-label="Zoom In"
              >
                <ZoomIn className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>

            {/* Action Buttons */}
            {mode !== "view" ? (
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={store.isSaving}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1 sm:py-1.5 rounded-md bg-brand-lime text-[#111827] font-bold text-[0.72rem] sm:text-xs shadow-md hover:bg-white hover:text-black transition-all cursor-pointer active:scale-98"
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  <span>{store.isSaving ? "Saving..." : "Save Changes"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white font-bold text-[0.72rem] sm:text-xs transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadMd}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md bg-[#151720] border border-[#2B3042] text-white hover:bg-white/10 font-bold text-[0.72rem] sm:text-xs transition-colors cursor-pointer"
                  title="Download structured Markdown conforming to backend parser contract"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Markdown</span>
                </button>

                {exportedDownloadUrl ? (
                  <a
                    href={exportedDownloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 sm:gap-1.5 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-400 font-bold text-[0.72rem] sm:text-xs shadow-md transition-all cursor-pointer active:scale-98"
                    title="Download vector PDF from Cloudflare R2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    disabled={isExporting}
                    className="inline-flex items-center gap-1 sm:gap-1.5 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-md bg-brand-lime text-[#111827] hover:bg-white font-bold text-[0.72rem] sm:text-xs shadow-md transition-all cursor-pointer active:scale-98 disabled:opacity-60"
                    title="Compile and export vector PDF via Cloud Run Typst service"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Compiling...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Export PDF</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePrintPdf}
                  className="p-1 sm:p-1.5 rounded-md bg-[#151720] border border-[#2B3042] text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Fallback: Print or save directly using browser print"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            )}


            {/* Desktop Close Button */}
            <div className="hidden md:flex items-center pl-1 border-l border-white/10 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-md bg-[#FF3B5C]/20 text-[#FF3B5C] hover:bg-[#FF3B5C] hover:text-white border border-[#FF3B5C]/40 transition-colors cursor-pointer"
                aria-label="Close Viewer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Floating Notice Banners (AI Audit Notice) */}
      {reviewReason && (
        <div className="no-print absolute top-[5.25rem] md:top-[4.5rem] left-1/2 -translate-x-1/2 z-[115] flex flex-col items-center gap-2 max-w-[90vw] pointer-events-none">
          <div className="pointer-events-auto px-4 py-2 bg-amber-500 text-black font-semibold text-xs rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 text-center">
            <AlertTriangle className="w-4 h-4 text-black shrink-0" />
            <span>
              <strong>AI Audit Notice:</strong> {reviewReason} — Review or edit the bullet points below before exporting.
            </span>
          </div>
        </div>
      )}

      {/* Main Document / Editor Workspace (Stable top padding to eliminate layout jumping) */}
      <div className="absolute inset-0 pt-28 md:pt-20 pb-20 overflow-auto custom-scrollbar flex justify-center z-[105] px-2 sm:px-4 print:p-0 print:m-0 print:static print:overflow-visible">
        {mode === "raw-edit" ? (
          /* Split / Raw Markdown Mode */
          <div className="w-full max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Raw Markdown Editor */}
            <div className="bg-[#11131a] border border-[#2B3042] rounded-xl p-4 flex flex-col shadow-2xl h-[780px]">
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-[#2B3042] text-xs text-gray-400">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-brand-lime" />
                  <span className="font-bold text-white">Markdown Editor</span>
                </div>
                <span>Conforms to Typst regex contract</span>
              </div>
              <textarea
                value={currentMarkdown}
                onChange={(e) => setCurrentMarkdown(e.target.value)}
                className="flex-1 w-full bg-transparent text-gray-200 font-mono text-xs leading-relaxed outline-none resize-none custom-scrollbar p-2"
                placeholder="Enter resume markdown..."
                spellCheck={false}
              />
            </div>

            {/* Live Pseudo-PDF Preview Pane */}
            <div className="flex flex-col items-center overflow-auto max-h-[780px] p-2 custom-scrollbar">
              <div className="text-xs text-gray-400 font-semibold mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-lime" />
                <span>Live Typst Parity Preview ({activeTemplate.name})</span>
              </div>
              <ResumeSheet
                markdown={currentMarkdown}
                themeId={activeTemplate.themeId}
                zoom={0.7}
                isEditable={false}
                onPageCountChange={setPageCount}
              />
            </div>
          </div>
        ) : (
          /* Visual Sheet Mode / View Mode */
          <div
            className="flex flex-col items-center justify-start print-only-sheet"
            style={{ minHeight: `${297 * zoom}mm` }}
          >
            {/* Informational Multi-Page Indicator Pill */}
            <div className="no-print mb-2.5 px-3.5 py-1 rounded-full bg-white/10 backdrop-blur-xs border border-white/10 text-gray-300 text-[0.74rem] font-medium flex items-center gap-1.5 shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-lime" />
              <span>
                {pageCount} A4 {pageCount === 1 ? "page" : "pages"} · Formatted for ISO 210 × 297 mm · All content included in PDF export
              </span>
            </div>

            {mode === "visual-edit" && (
              <div className="no-print mb-3 px-4 py-1 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-semibold flex items-center gap-2">
                <Edit3 className="w-3.5 h-3.5" />
                <span>Visual Edit Mode — Click directly on any text or bullet point on the paper to edit</span>
              </div>
            )}

            <ResumeSheet
              markdown={currentMarkdown}
              themeId={activeTemplate.themeId}
              zoom={zoom}
              isEditable={mode === "visual-edit"}
              onMarkdownChange={(newMd) => setCurrentMarkdown(newMd)}
              onPageCountChange={setPageCount}
            />
          </div>
        )}

      </div>
    </div>
  );
}
