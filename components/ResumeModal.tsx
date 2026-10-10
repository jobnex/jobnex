"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Download, X, Edit3, FileText, Check,
  ZoomIn, ZoomOut, AlertTriangle, Printer,
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
}

export function ResumeModal({
  isOpen,
  onClose,
  initialMode = "view",
  initialMarkdown,
  templateId,
  reviewWarning,
}: ResumeModalProps) {
  const store = useResumeStore();

  const [mode, setMode] = useState<"view" | "visual-edit" | "raw-edit">(
    initialMode === "edit" ? "visual-edit" : "view"
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
  const [zoom, setZoom] = useState<number>(1);
  const [isOverflowing, setIsOverflowing] = useState<boolean>(false);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState<boolean>(false);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  // Active template derived from modal's working templateId
  const activeTemplate: ResumeTemplate = getTemplateById(currentTemplateId);

  // Reset the working document when this modal opens, before painting it.
  if (!prevIsOpen && isOpen) {
      setPrevIsOpen(true);
      const activeTmpl = getTemplateById(templateId || store.selectedTemplateId).id;
      const initialMd = initialMarkdown || store.resumeMarkdown;
      setCurrentTemplateId(activeTmpl);
      setCurrentMarkdown(initialMd);
      setSavedBaselineMarkdown(initialMd);
      setMode(initialMode === "edit" ? "visual-edit" : "view");
      setZoom(1);
      setIsTemplateMenuOpen(false);
  } else if (prevIsOpen && !isOpen) {
      setPrevIsOpen(false);
  }

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
    try {
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

  return createPortal(
    <div data-resume-print-root className="fixed inset-0 z-[100] font-sans print:p-0">
      {/* Print-specific style sheet for exact 8.5in x 11in vector PDF generation */}
      <style jsx global>{`
        @media print {
          @page { size: letter portrait; margin: 0; }
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
          .resume-sheet-root, .pseudo-pdf-container {
            display: block !important;
            position: static !important;
            width: 8.5in !important;
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
            min-height: 0 !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            border: 0 !important;
            box-shadow: none !important;
            print-color-adjust: exact;
          }
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

      {reviewWarning && <p role="alert" className="no-print absolute bottom-5 left-5 right-5 z-[120] rounded-lg border border-amber-400 bg-amber-950 p-3 text-sm text-amber-100">{reviewWarning}</p>}

      {/* Top Floating Bar: Title + Active Template Indicator (Hidden on Print) */}
      <div className="no-print absolute top-5 left-6 z-[110] flex items-center gap-3 animate-in slide-in-from-top-4 fade-in duration-300">
        <div className="flex items-center gap-2.5 text-white font-heading font-semibold text-[1.25rem] drop-shadow-md">
          <FileText className="w-5 h-5 text-brand-lime dark:text-[#ACEE5F]" strokeWidth={2.5} />
          <span>Resume Preview</span>
        </div>

        {/* Template Selector Dropdown */}
        <div className="relative" ref={templateMenuRef}>
          <button
            type="button"
            onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold backdrop-blur-sm transition-all cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-brand-lime animate-pulse" />
            <span>{activeTemplate.name}</span>
            <span className="text-white/60 text-[0.7rem] uppercase font-mono">
              Theme {activeTemplate.themeId}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-white/70 transition-transform duration-200 ${isTemplateMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {isTemplateMenuOpen && (
            <div className="absolute left-0 top-full mt-2 w-[280px] bg-[#1a1c24] border border-[#2e3344] rounded-xl shadow-2xl p-2 text-white z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 text-[0.7rem] font-bold text-gray-400 uppercase tracking-wider border-b border-[#2e3344] mb-1">
                Select Template & Theme
              </div>
              <div className="space-y-1">
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
      </div>

      {/* Top Floating Controls & Action Buttons (Hidden on Print) */}
      <div className="no-print absolute top-5 right-6 z-[110] flex items-center gap-3 animate-in slide-in-from-right-4 fade-in duration-300">

        {/* Mode Switcher Tabs */}
        <div className="flex items-center bg-[#151720] border border-[#2B3042] rounded-md p-0.5 text-xs text-white">
          <button
            type="button"
            onClick={() => setMode("view")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition-all cursor-pointer ${
              mode === "view"
                ? "bg-white/20 text-white shadow-xs"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("visual-edit")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition-all cursor-pointer ${
              mode === "visual-edit"
                ? "bg-brand-lime text-[#111827] shadow-xs"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Visual Edit</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("raw-edit")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition-all cursor-pointer ${
              mode === "raw-edit"
                ? "bg-white/20 text-white shadow-xs"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Markdown</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center bg-[#151720] border border-[#2B3042] rounded-md text-white">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
            className="p-1.5 hover:bg-white/10 transition-colors cursor-pointer border-r border-[#2B3042]"
            aria-label="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[0.78rem] font-bold px-2.5 w-[50px] text-center shrink-0">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.0, Math.round((z + 0.25) * 100) / 100))}
            className="p-1.5 hover:bg-white/10 transition-colors cursor-pointer border-l border-[#2B3042]"
            aria-label="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action Buttons */}
        {mode !== "view" ? (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={store.isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-brand-lime text-[#111827] font-bold text-xs shadow-md hover:bg-white hover:text-black transition-all cursor-pointer active:scale-98"
            >
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
              <span>{store.isSaving ? "Saving..." : "Save Changes"}</span>
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setMode("visual-edit")}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-brand-lime text-[#111827] font-bold text-xs shadow-md hover:bg-white transition-all cursor-pointer active:scale-98"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Resume</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadMd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#151720] border border-[#2B3042] text-white hover:bg-white/10 font-bold text-xs transition-colors cursor-pointer"
              title="Download structured Markdown conforming to backend parser contract"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Markdown</span>
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#151720] border border-[#2B3042] text-white hover:bg-white/10 font-bold text-xs transition-colors cursor-pointer"
              title="Print or save as vector PDF with physical US Letter dimensions"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          </>
        )}

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md bg-[#FF3B5C]/20 text-[#FF3B5C] hover:bg-[#FF3B5C] hover:text-white border border-[#FF3B5C]/40 transition-colors cursor-pointer"
          aria-label="Close Viewer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 1-Page Budget Warning Banner (Hidden on Print) */}
      {isOverflowing && (
        <div className="no-print absolute top-[4.5rem] left-1/2 -translate-x-1/2 z-[115] px-4 py-2 bg-amber-500/90 text-black font-semibold text-xs rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertTriangle className="w-4 h-4 text-black shrink-0" />
          <span>
            <strong>Page Budget Exceeded:</strong> Content extends beyond the one-page preview. PDF export includes the full resume. Shorten content if you need one page.
          </span>
        </div>
      )}

      {/* Main Document / Editor Workspace */}
      <div className="resume-workspace absolute inset-0 pt-24 pb-20 overflow-y-auto custom-scrollbar flex justify-center z-[105] print:p-0 print:m-0 print:static print:overflow-visible">
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
                onOverflowChange={setIsOverflowing}
              />
            </div>
          </div>
        ) : (
          /* Visual Sheet Mode / View Mode */
          <div
            className="flex flex-col items-center justify-start print-only-sheet"
            style={{ minHeight: `${11 * zoom}in` }}
          >
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
              onOverflowChange={setIsOverflowing}
            />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
