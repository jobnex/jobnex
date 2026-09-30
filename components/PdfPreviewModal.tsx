"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, FileText, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { ResumeTemplate } from "@/data/resume-templates";

export interface PdfPreviewDocument {
  id?: string;
  name: string;
  category?: string;
  fileName?: string;
  filePath: string;
}

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  template?: ResumeTemplate | PdfPreviewDocument | null;
  document?: PdfPreviewDocument | null;
}

interface RenderedPdfPage {
  pageNumber: number;
  dataUrl: string;
  aspectRatio: number;
}

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.85;
const BASE_WIDTH = 750;

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

export function PdfPreviewModal({ isOpen, onClose, template, document: docProp }: PdfPreviewModalProps) {
  const activeItem = docProp || template;
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState<RenderedPdfPage[]>([]);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRenderRef = useRef<boolean>(false);

  // Lock body scroll and reset state on open
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPages([]);
      setIsLoadingPdf(true);
      setLoadError(null);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      cancelRenderRef.current = true;
    }
    return () => {
      document.body.style.overflow = "";
      cancelRenderRef.current = true;
    };
  }, [isOpen]);

  // Load PDF.js library script dynamically
  const ensurePdfJsLoaded = useCallback(async () => {
    if (typeof window === "undefined") return null;

    if (window.pdfjsLib) {
      return window.pdfjsLib;
    }

    // Check if script tag is already in DOM
    const existingScript = document.querySelector('script[src*="pdf.min.js"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "/vendor/pdfjs/pdf.min.js";
      script.async = true;
      document.head.appendChild(script);

      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load PDF.js engine"));
      });
    } else {
      // Script tag exists, wait for window.pdfjsLib to be available
      let retries = 0;
      while (!window.pdfjsLib && retries < 20) {
        await new Promise((r) => setTimeout(r, 50));
        retries++;
      }
    }

    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";
      return window.pdfjsLib;
    }

    throw new Error("PDF.js failed to initialize");
  }, []);

  // Render PDF pages onto high-resolution canvas and cache data URLs
  useEffect(() => {
    if (!isOpen || !activeItem?.filePath) return;

    cancelRenderRef.current = false;
    let isCancelled = false;

    async function renderPdfDocument() {
      setIsLoadingPdf(true);
      setLoadError(null);

      try {
        const pdfjs = await ensurePdfJsLoaded();
        if (!pdfjs || isCancelled) return;

        // Clean query/hash parameters from URL for getDocument
        const rawUrl = activeItem?.filePath || "";
        const cleanUrl = rawUrl.split("#")[0];

        const loadingTask = pdfjs.getDocument({
          url: cleanUrl,
          cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
          cMapPacked: true,
        });

        const pdfDoc = await loadingTask.promise;
        if (isCancelled || cancelRenderRef.current) return;

        const renderedPages: RenderedPdfPage[] = [];
        const pixelRatio = typeof window !== "undefined" ? Math.max(1.5, window.devicePixelRatio || 1) : 2;

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (isCancelled || cancelRenderRef.current) return;

          const page = await pdfDoc.getPage(pageNum);
          const baseViewport = page.getViewport({ scale: 1 });
          const renderScale = 2.0 * pixelRatio;
          const viewport = page.getViewport({ scale: renderScale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext("2d", { alpha: false });

          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({
              canvasContext: ctx,
              viewport,
            }).promise;

            renderedPages.push({
              pageNumber: pageNum,
              dataUrl: canvas.toDataURL("image/png"),
              aspectRatio: baseViewport.width / baseViewport.height,
            });
          }
        }

        if (!isCancelled && !cancelRenderRef.current) {
          setPages(renderedPages);
          setIsLoadingPdf(false);
        }
      } catch (err: any) {
        if (!isCancelled && !cancelRenderRef.current) {
          console.error("PDF.js render error:", err);
          setLoadError(err?.message || "Failed to render PDF preview");
          setIsLoadingPdf(false);
        }
      }
    }

    renderPdfDocument();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, activeItem?.filePath, ensurePdfJsLoaded]);

  // Handle escape key and keyboard zoom shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 0.15) * 100) / 100));
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - 0.15) * 100) / 100));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    if (isOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Trackpad pinch gesture handler: scales the whole container smoothly
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Smooth delta factor tuned for direct 1:1 feel with trackpad gestures
      const delta = -e.deltaY * 0.003;
      setZoom((prev) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
        return Math.round(next * 100) / 100;
      });
    }
  };

  // Window-level Ctrl + wheel listener so pinch gestures outside the container also scale the container
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.003;
        setZoom((prev) => {
          const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
          return Math.round(next * 100) / 100;
        });
      }
    };

    window.addEventListener("wheel", handleWindowWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWindowWheel);
  }, [isOpen]);

  if (!isOpen || !activeItem) return null;

  const displayName = activeItem.fileName || activeItem.name || "Resume.pdf";

  return (
    <div 
      className="fixed inset-0 z-[100] font-sans select-none" 
      role="dialog" 
      aria-modal="true"
      onWheel={handleWheel}
    >
      {/* Dark Blur Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto cursor-pointer"
        onClick={onClose}
        aria-label="Close modal overlay"
      />

      {/* Top Floating Bar: Space above the container with Title, Zoom Controls, and Corner Close Cross */}
      <div className="absolute top-2 left-4 right-4 sm:top-2.5 sm:left-6 sm:right-6 z-[110] flex items-center justify-between pointer-events-none animate-in slide-in-from-top-2 fade-in duration-300">
        {/* Left: Name of the File */}
        <div className="flex items-center gap-2.5 text-white font-heading font-semibold text-[1.1rem] sm:text-[1.2rem] drop-shadow-md pointer-events-auto">
          <FileText className="w-5 h-5 text-brand-lime dark:text-[#ACEE5F] shrink-0" strokeWidth={2.5} />
          <span className="truncate max-w-[calc(100vw-280px)] sm:max-w-md lg:max-w-lg">
            {displayName}
          </span>
        </div>

        {/* Right: Container Zoom Controls & Corner Close Cross */}
        <div className="flex items-center gap-2.5 sm:gap-3 pointer-events-auto">
          {/* Zoom Controls: Scales container width smoothly */}
          <div className="flex items-center bg-[#151720]/90 backdrop-blur-md border border-[#2B3042] rounded-md text-white shadow-md">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - 0.15) * 100) / 100))}
              disabled={zoom <= MIN_ZOOM}
              className="p-1.5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer border-r border-[#2B3042]"
              aria-label="Zoom Out"
              title="Make container smaller"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="text-[0.76rem] font-bold px-2.5 w-[52px] text-center shrink-0 hover:text-brand-lime transition-colors cursor-pointer"
              title="Click to reset container size (100%)"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 0.15) * 100) / 100))}
              disabled={zoom >= MAX_ZOOM}
              className="p-1.5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer border-l border-[#2B3042]"
              aria-label="Zoom In"
              title="Make container bigger"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Corner Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer border border-transparent hover:border-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Document Workspace — Moved up, maximized vertical space, sharp corners, zero border/grey card */}
      <div 
        className="absolute inset-0 pt-9 pb-2 px-2 sm:pt-10 sm:pb-3 sm:px-4 flex justify-center items-center z-[105]"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        {/* Container: Transparent background card that blends seamlessly with the blur background, no border color, sharp corners */}
        <div 
          ref={containerRef}
          className="h-full bg-transparent rounded-none border-0 overflow-y-auto custom-scrollbar flex flex-col items-center relative"
          style={{
            width: `${Math.round(BASE_WIDTH * zoom)}px`,
            maxWidth: "calc(100vw - 1.5rem)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {isLoadingPdf ? (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-zinc-400 gap-3 bg-transparent">
              <Loader2 className="w-8 h-8 animate-spin text-brand-lime" />
              <p className="text-sm font-semibold">Rendering crisp PDF pages...</p>
            </div>
          ) : loadError ? (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-zinc-300 gap-3 bg-transparent text-center p-6">
              <p className="text-sm text-red-400 font-semibold">{loadError}</p>
              <p className="text-xs text-zinc-400">Unable to render in-browser canvas. You can download or view via direct link.</p>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center space-y-4 py-1">
              {pages.map((p) => (
                <img
                  key={p.pageNumber}
                  src={p.dataUrl}
                  alt={`Page ${p.pageNumber}`}
                  className="w-full h-auto rounded-none shadow-[0_20px_50px_rgba(0,0,0,0.6)] bg-white block select-none pointer-events-none"
                  style={{
                    aspectRatio: `${p.aspectRatio}`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
