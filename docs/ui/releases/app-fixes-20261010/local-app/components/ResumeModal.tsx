"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { 
  Download, X, Edit3, FileText, Check, 
  ZoomIn, ZoomOut, Printer,
  Code2, Eye, Sparkles, ChevronDown 
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

interface ResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "view" | "edit";
  initialMarkdown?: string;
  templateId?: string;
  reviewWarning?: string;
  exportJobId?: string;
  expectedGenerationId?: string;
  readOnly?: boolean;
  onSave?: (markdown: string, templateId: string) => Promise<void>;
}

export function ResumeModal({
  isOpen,
  onClose,
  initialMode = "view",
  initialMarkdown,
  templateId,
  reviewWarning,
  exportJobId,
  expectedGenerationId,
  readOnly = false,
  onSave,
}: ResumeModalProps) {
  const store = useResumeStore();

  const [mode, setMode] = useState<"view" | "visual-edit" | "raw-edit">(
    initialMode === "edit" && !readOnly ? "visual-edit" : "view"
  );
  
  // Working state during modal session
  const [currentTemplateId, setCurrentTemplateId] = useState<string>(
    getTemplateById(templateId || store.selectedTemplateId).id
  );
  const [currentMarkdown, setCurrentMarkdown] = useState<string>(
    initialMarkdown || store.resumeMarkdown
  );
  const [savedBaselineMarkdown, setSavedBaselineMarkdown] = useState<string>(
    initialMarkdown || store.resumeMarkdown
  );
  const [savedBaselineTemplateId, setSavedBaselineTemplateId] = useState(getTemplateById(templateId || store.selectedTemplateId).id);
  const [zoom, setZoom] = useState<number>(1);
  const [pageCount, setPageCount] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const effectiveZoom = zoom * fitZoom;

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!isOpen || !workspace) return;
    const observer = new ResizeObserver(([entry]) => {
      setFitZoom(Math.min(1, Math.max(0.1, (entry.contentRect.width - 32) / (210 * 96 / 25.4))));
    });
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [isOpen]);

  useEffect(() => () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  }, []);

  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState<boolean>(false);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  // Active template derived from modal's working templateId
  const activeTemplate: ResumeTemplate = getTemplateById(currentTemplateId);

  // Reset state on modal open during render before paint
  if (!prevIsOpen && isOpen) {
    setPrevIsOpen(true);
    const activeTmpl = getTemplateById(templateId || store.selectedTemplateId).id;
    const initialMd = initialMarkdown || store.resumeMarkdown;
    setCurrentTemplateId(activeTmpl);
    setSavedBaselineTemplateId(activeTmpl);
    setPageCount(1);
    setCurrentMarkdown(initialMd);
    setSavedBaselineMarkdown(initialMd);
    setMode(initialMode === "edit" && !readOnly ? "visual-edit" : "view");
    setZoom(1);
    setDownloadUrl(null);
    setIsTemplateMenuOpen(false);
  } else if (prevIsOpen && !isOpen) {
    setPrevIsOpen(false);
  }

  // Manage body scroll locking
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
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

  if (!isOpen || typeof document === "undefined") return null;

  const handleSave = async () => {
    if (readOnly || isSaving) return;
    setIsSaving(true);
    try {
      if (!onSave) throw new Error("Open this resume from its application or base resume details to save edits.");
      await onSave(currentMarkdown, currentTemplateId);
      setSavedBaselineMarkdown(currentMarkdown);
      setSavedBaselineTemplateId(currentTemplateId);
      setDownloadUrl(null);
      setMode("view");
      toast.success("Resume changes saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save resume changes. Your edits remain open.");
    } finally { setIsSaving(false); }
  };

  const handleCancel = () => {
    setCurrentMarkdown(savedBaselineMarkdown);
    setCurrentTemplateId(savedBaselineTemplateId);
    setDownloadUrl(null);
    setMode("view");
  };

  const handleDownloadMd = () => {
    downloadMarkdownFile(currentMarkdown, `${activeTemplate.id}_resume.md`);
    toast.info("Downloaded resume as Markdown (.md)");
  };

  const handleExportPdf = async () => {
    if (readOnly || isExporting) return;
    setIsExporting(true);
    setDownloadUrl(null);
    try {
      const endpoint = exportJobId ? "/api/resume/export" : "/api/resume/base";
      const response = await fetch(endpoint, { method: "POST", signal: AbortSignal.timeout(110_000), headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(exportJobId ? { jobId: exportJobId, ...(expectedGenerationId ? { expectedGenerationId } : {}) } : {}), markdown: currentMarkdown, templateId: currentTemplateId }) });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "PDF export failed; your saved resume is retained.");
      }
      if (exportJobId) {
        const result = await response.json();
        if (typeof result.downloadUrl !== "string") throw new Error("PDF download is unavailable.");
        setDownloadUrl(result.downloadUrl);
      } else {
        const blob = await response.blob();
        if ((await blob.slice(0, 5).text()) !== "%PDF-") throw new Error("The PDF service returned an invalid file.");
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = URL.createObjectURL(blob);
        setDownloadUrl(blobUrlRef.current);
      }
      toast.success("PDF ready. Select Download PDF.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF export failed. Retry shortly.");
    } finally { setIsExporting(false); }
  };

  return createPortal(
    <div data-resume-print-root role="dialog" aria-modal="true" aria-labelledby="resume-preview-title" className="fixed inset-0 z-[100] font-body print:p-0 flex flex-col">
      {/* Print the same A4 pages shown in the preview. */}
      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: white !important;
          }
          body > :not([data-resume-print-root]) { display: none !important; }
          [data-resume-print-root], .resume-workspace, .print-only-sheet,
          .resume-sheet-root {
            display: block !important;
            position: static !important;
            width: 210mm !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            transform: none !important;
            transition: none !important;
            box-shadow: none !important;
          }
          .no-print, .no-print * { display: none !important; }
          .resume-paper {
            width: 210mm !important;
            min-height: 297mm !important;
            max-height: none !important;
            height: 297mm !important;
            overflow: visible !important;
            border: 0 !important;
            box-shadow: none !important;
            transform: none !important;
            print-color-adjust: exact;
          }
          .resume-page-frame {
            height: 297mm !important;
            margin: 0 !important;
            break-after: page;
            break-inside: avoid;
          }
          .resume-page-frame:last-child { break-after: auto; }
          .resume-paper h1, .resume-paper h2, .resume-paper h3 { break-after: avoid; }
          .resume-paper li { break-inside: avoid; }
        }
      `}</style>

      {/* Dark Blur Backdrop (Hidden on Print) */}
      <div
        className="no-print absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto"
        onClick={() => {
          if (mode === "view") onClose();
        }}
      />



      {/* Top Floating Bar: Responsive Header (Hidden on Print) */}
      <header className="no-print relative shrink-0 z-[110] p-2.5 sm:p-4 bg-[#11131a]/95 backdrop-blur-md border-b border-white/10 animate-in slide-in-from-top-2 fade-in duration-300">
        <div className="w-full max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3">
          {/* Top Row on mobile / Left group on desktop: Title + Template Selector + Mobile Close */}
          <div className="flex items-center justify-between md:justify-start gap-2 sm:gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 text-white font-heading font-semibold text-sm sm:text-base md:text-[1.2rem] drop-shadow-md shrink-0">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-brand-lime dark:text-[#ACEE5F] shrink-0" strokeWidth={2.5} />
              <span id="resume-preview-title" className="whitespace-nowrap">Resume Preview</span>
            </div>

            {/* Template Selector Dropdown */}
            <div className="relative" ref={templateMenuRef}>
              <button
                type="button"
                onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                disabled={readOnly}
                title={readOnly ? "Historical draft: saved template is read only" : "Select a resume template"}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[0.72rem] sm:text-xs font-semibold backdrop-blur-sm transition-all cursor-pointer"
              >
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-brand-lime animate-pulse shrink-0" />
                <span className="truncate max-w-[100px] sm:max-w-none">{activeTemplate.name}</span>
                <span className="text-white/60 text-[0.65rem] sm:text-[0.7rem] uppercase font-mono hidden xs:inline">
                  Theme {activeTemplate.themeId}
                </span>
                <ChevronDown className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/70 transition-transform duration-200 shrink-0 ${isTemplateMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {isTemplateMenuOpen && !readOnly && (
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
                            setDownloadUrl(null);
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

          {/* Bottom Row on mobile / Right group on desktop: Mode Switcher, Zoom, Actions, Desktop Close */}
          <div className="flex items-center justify-between md:justify-end gap-2 sm:gap-2.5 flex-wrap overflow-x-auto w-full md:w-auto pb-0.5 md:pb-0">
            {/* Mode Switcher Tabs */}
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
                disabled={readOnly}
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

            {/* Zoom Controls */}
            <div className="flex items-center bg-[#151720] border border-[#2B3042] rounded-md text-white shrink-0">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.25, Math.round((z - 0.25) * 100) / 100))}
                className="p-1 sm:p-1.5 hover:bg-white/10 transition-colors cursor-pointer border-r border-[#2B3042]"
                aria-label="Zoom Out"
              >
                <ZoomOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
              <span className="text-[0.72rem] sm:text-[0.78rem] font-bold px-1.5 sm:px-2.5 w-[42px] sm:w-[50px] text-center shrink-0">
                {Math.round(effectiveZoom * 100)}%
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
            {mode !== "view" && !readOnly ? (
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1 sm:py-1.5 rounded-md bg-brand-lime text-[#111827] font-bold text-[0.72rem] sm:text-xs shadow-md hover:bg-white hover:text-black transition-all cursor-pointer active:scale-98"
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  <span>{isSaving ? "Saving..." : "Save Changes"}</span>
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
                  onClick={() => setMode("visual-edit")}
                disabled={readOnly}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-md bg-brand-lime text-[#111827] font-bold text-[0.72rem] sm:text-xs shadow-md hover:bg-white transition-all cursor-pointer active:scale-98"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{readOnly ? "Read only" : "Edit Resume"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadMd}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md bg-[#151720] border border-[#2B3042] text-white hover:bg-white/10 font-bold text-[0.72rem] sm:text-xs transition-colors cursor-pointer"
                  title="Download the resume text as Markdown"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Markdown</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  disabled={readOnly || isExporting}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md bg-[#151720] border border-[#2B3042] text-white hover:bg-white/10 font-bold text-[0.72rem] sm:text-xs transition-colors cursor-pointer"
                  title="Compile and download a PDF of all resume pages"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{readOnly ? "PDF export unavailable" : isExporting ? "Exporting..." : "Export PDF"}</span>
                </button>
              </div>
            )}

            {/* Desktop Close Button */}
            <div className="hidden md:flex items-center shrink-0">
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
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-gray-200" role="status" aria-live="polite">
          <span>{pageCount} A4 {pageCount === 1 ? "page" : "pages"} · Full resume included</span>
          {!readOnly && downloadUrl && <a href={downloadUrl} download={`${activeTemplate.id}_resume.pdf`} target="_blank" rel="noopener noreferrer"
            className="rounded bg-brand-lime px-3 py-1.5 font-bold text-[#111827]">Download PDF</a>}
        </div>
      </header>

      {/* Main Document / Editor Workspace */}
      <div ref={workspaceRef} className="resume-workspace relative min-h-0 flex-1 py-4 overflow-auto custom-scrollbar flex justify-center z-[105] px-2 sm:px-4 print:p-0 print:m-0 print:static print:overflow-visible">
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
                <span>{readOnly ? "Historical draft · read only" : "Edit your resume text"}</span>
              </div>
              <textarea
                value={currentMarkdown}
                readOnly={readOnly}
                onChange={(e) => { setCurrentMarkdown(e.target.value); setDownloadUrl(null); }}
                className="flex-1 w-full bg-transparent text-gray-200 font-mono text-xs leading-relaxed outline-none resize-none custom-scrollbar p-2"
                placeholder="Enter resume markdown..."
                spellCheck={false}
              />
            </div>

            {/* Live Pseudo-PDF Preview Pane */}
            <div className="flex flex-col items-center overflow-auto max-h-[780px] p-2 custom-scrollbar">
              <div className="text-xs text-gray-400 font-semibold mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-lime" />
                <span>Live Resume Preview ({activeTemplate.name})</span>
              </div>
              <ResumeSheet
                markdown={currentMarkdown}
                themeId={activeTemplate.themeId}
                zoom={Math.min(0.7, effectiveZoom)}
                isEditable={false}
                onPageCountChange={setPageCount}
              />
            </div>
          </div>
        ) : (
          /* Visual Sheet Mode / View Mode */
          <div
            className="flex flex-col items-center justify-start print-only-sheet"
            style={{ minHeight: `calc(297mm * ${effectiveZoom})` }}
          >
            {mode === "visual-edit" && !readOnly && (
              <div className="no-print mb-3 px-4 py-1 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-semibold flex items-center gap-2">
                <Edit3 className="w-3.5 h-3.5" />
                <span>Visual Edit Mode — Click directly on any text or bullet point on the paper to edit</span>
              </div>
            )}

            <ResumeSheet
              markdown={currentMarkdown}
              themeId={activeTemplate.themeId}
              zoom={effectiveZoom}
              isEditable={mode === "visual-edit" && !readOnly}
              onMarkdownChange={(newMd) => { setCurrentMarkdown(newMd); setDownloadUrl(null); }}
              onPageCountChange={setPageCount}
            />
          </div>
        )}
      </div>
      {reviewWarning && <p role="alert" className="no-print relative shrink-0 z-[110] border-t border-amber-400 bg-amber-950 px-4 py-2 text-xs text-amber-100">{reviewWarning}</p>}
    </div>,
    document.body
  );
}
