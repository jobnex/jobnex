"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { X, FileText, Loader2, Minus, Plus } from "lucide-react";
import { ResumeTemplate } from "@/data/resume-templates";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/utils/scrollLock";

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

interface PageMetadata {
  pageNumber: number;
  width: number;
  height: number;
  aspectRatio: number;
}

const MIN_ZOOM = 0.20; // 20%
const MAX_ZOOM = 6.50; // 650%
const BASE_WIDTH = 750;

/**
 * Standard discrete zoom steps ladder (from 20% to 650%).
 * Clicking +/- steps to the adjacent fixed preset rather than adding arbitrary increments.
 */
const ZOOM_PRESETS = [
  0.20, 0.30, 0.40, 0.50, 0.65, 0.75, 0.90,
  1.00,
  1.15, 1.25, 1.50, 1.75, 2.00, 2.50, 3.00, 4.00, 5.00, 6.50,
];

interface PdfViewport {
  width: number;
  height: number;
  scale?: number;
}

interface PdfRenderTask {
  promise: Promise<unknown>;
  cancel: () => void;
}

interface PdfTextTask {
  promise: Promise<unknown>;
  cancel?: () => void;
}

interface PdfPageProxy {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (params: Record<string, unknown>) => PdfRenderTask;
  getTextContent: () => Promise<unknown>;
  cleanup?: () => void;
}

interface PdfDocumentProxy {
  numPages: number;
  destroyed?: boolean;
  _transport?: unknown;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy: () => Promise<void>;
}

interface PdfLoadingTask {
  promise: Promise<PdfDocumentProxy>;
  destroy: () => Promise<void>;
}

interface PdfJsLib {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (params: { url: string; withCredentials?: boolean } & Record<string, unknown>) => PdfLoadingTask;
  renderTextLayer: (params: {
    textContentSource: unknown;
    container: HTMLElement;
    viewport: PdfViewport;
  }) => PdfTextTask;
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

/**
 * Individual PDF Page Renderer with Double-Buffering & TextLayer.
 * - Renders high-DPI vector graphics directly onto HTML5 Canvas.
 * - Mounts an aligned transparent TextLayer for selectable text, I-beam cursor, and copy-paste.
 * - Uses offscreen canvas double-buffering during re-render to eliminate visual flickering on zoom.
 * - Guards against premature document destruction or transport teardown.
 */
const PdfPageItem = memo(function PdfPageItem({
  pdfDoc,
  pageMeta,
  renderWidth,
}: {
  pdfDoc: PdfDocumentProxy | null;
  pageMeta: PageMetadata;
  renderWidth: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);
  const textTaskRef = useRef<PdfTextTask | null>(null);

  useEffect(() => {
    if (
      !pdfDoc ||
      pdfDoc.destroyed ||
      !pdfDoc._transport ||
      !canvasRef.current ||
      !textLayerRef.current ||
      renderWidth <= 0
    ) {
      return;
    }

    let isCancelled = false;

    async function renderPage() {
      try {
        if (!pdfDoc || pdfDoc.destroyed || !pdfDoc._transport || isCancelled) return;

        const page = await pdfDoc.getPage(pageMeta.pageNumber);
        if (isCancelled || !page) return;

        // Cancel previous in-flight render tasks
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore
          }
          renderTaskRef.current = null;
        }

        if (textTaskRef.current) {
          try {
            textTaskRef.current.cancel?.();
          } catch {
            // ignore
          }
          textTaskRef.current = null;
        }

        // Calculate viewports
        const scale = renderWidth / pageMeta.width;
        const displayViewport = page.getViewport({ scale });

        // HiDPI rasterization (at least 1.5x, up to devicePixelRatio)
        // Cap canvas dimension to 12,000px to ensure GPU stability at 650% zoom
        const dpr = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
        const rawPixelScale = scale * Math.max(dpr, 1.5);
        const maxCanvasDim = 12000;
        const unscaledMax = Math.max(pageMeta.width, pageMeta.height);
        const safePixelScale = Math.min(rawPixelScale, maxCanvasDim / unscaledMax);
        const renderViewport = page.getViewport({ scale: safePixelScale });

        // Double-buffer rendering: draw onto offscreen canvas to avoid screen flicker
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = Math.floor(renderViewport.width);
        tempCanvas.height = Math.floor(renderViewport.height);

        const tempCtx = tempCanvas.getContext("2d", { alpha: false });
        if (!tempCtx || isCancelled) return;

        tempCtx.fillStyle = "#ffffff";
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        const renderTask = page.render({
          canvasContext: tempCtx,
          viewport: renderViewport,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (isCancelled) return;

        // Blit to the visible canvas instantaneously
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = tempCanvas.width;
        canvas.height = tempCanvas.height;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) {
          ctx.drawImage(tempCanvas, 0, 0);
        }

        // Render TextLayer for native text selection and I-beam cursor
        const textLayerDiv = textLayerRef.current;
        if (!textLayerDiv || isCancelled) return;

        textLayerDiv.innerHTML = "";
        textLayerDiv.style.setProperty("--scale-factor", `${displayViewport.scale}`);

        const textContent = await page.getTextContent();
        if (isCancelled) return;

        if (window.pdfjsLib?.renderTextLayer) {
          const textTask = window.pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: displayViewport,
          });
          textTaskRef.current = textTask;
          await textTask.promise;
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (
          error?.name === "RenderingCancelledException" ||
          error?.name === "AbortException" ||
          error?.message?.includes("cancelled") ||
          error?.message?.includes("destroyed") ||
          error?.message?.includes("sendWithPromise") ||
          error?.message?.includes("Transport destroyed") ||
          error?.message?.includes("Worker was destroyed") ||
          error?.message?.includes("Cannot read properties of null") ||
          error?.message?.includes("TextLayer task cancelled")
        ) {
          return;
        }
        console.error(`Error rendering PDF page ${pageMeta.pageNumber}:`, error);
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
      if (textTaskRef.current) {
        try {
          textTaskRef.current.cancel?.();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, pageMeta.pageNumber, pageMeta.width, pageMeta.height, renderWidth]);

  return (
    <div
      className="relative bg-white shadow-[0_20px_50px_rgba(0,0,0,0.6)] select-text"
      style={{
        width: "100%",
        aspectRatio: `${pageMeta.aspectRatio}`,
      }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block pointer-events-none"
        style={{
          width: "100%",
          height: "100%",
        }}
      />
      <div
        ref={textLayerRef}
        className="textLayer select-text"
        style={{
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
});

export function PdfPreviewModal({ isOpen, onClose, template, document: docProp }: PdfPreviewModalProps) {
  const activeItem = docProp || template;
  const [zoom, setZoom] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null);
  const [pagesMeta, setPagesMeta] = useState<PageMetadata[]>([]);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(BASE_WIDTH);
  const [debouncedWidth, setDebouncedWidth] = useState<number>(BASE_WIDTH);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  const docRef = useRef<PdfDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PdfLoadingTask | null>(null);

  // Reset modal state on open/close during render before paint
  if (!prevIsOpen && isOpen) {
    setPrevIsOpen(true);
    setZoom(1);
    setPdfDoc(null);
    setPagesMeta([]);
    setIsLoadingPdf(true);
    setLoadError(null);
    setDebouncedWidth(BASE_WIDTH);
  } else if (prevIsOpen && !isOpen) {
    setPrevIsOpen(false);
    setPdfDoc(null);
    setPagesMeta([]);
  }

  // Stepping to next fixed zoom preset when clicking +
  const handleZoomIn = useCallback(() => {
    setZoom((current) => {
      const next = ZOOM_PRESETS.find((p) => p > current + 0.005);
      return next !== undefined ? next : MAX_ZOOM;
    });
  }, []);

  // Stepping to previous fixed zoom preset when clicking -
  const handleZoomOut = useCallback(() => {
    setZoom((current) => {
      for (let i = ZOOM_PRESETS.length - 1; i >= 0; i--) {
        if (ZOOM_PRESETS[i] < current - 0.005) {
          return ZOOM_PRESETS[i];
        }
      }
      return MIN_ZOOM;
    });
  }, []);

  // Close on Escape key
  useEscapeKey(onClose, isOpen);

  // Lock body scroll and cleanup on open/close
  useEffect(() => {
    if (isOpen) {
      lockBodyScroll();
    } else {
      if (docRef.current) {
        try {
          docRef.current.destroy();
        } catch {
          // ignore
        }
        docRef.current = null;
      }
      if (loadingTaskRef.current) {
        try {
          loadingTaskRef.current.destroy();
        } catch {
          // ignore
        }
        loadingTaskRef.current = null;
      }
    }
    return () => {
      if (isOpen) {
        unlockBodyScroll();
      }
      if (docRef.current) {
        try {
          docRef.current.destroy();
        } catch {
          // ignore
        }
        docRef.current = null;
      }
      if (loadingTaskRef.current) {
        try {
          loadingTaskRef.current.destroy();
        } catch {
          // ignore
        }
        loadingTaskRef.current = null;
      }
    };
  }, [isOpen]);

  // Load PDF.js library script & stylesheet dynamically
  const ensurePdfJsLoaded = useCallback(async () => {
    if (typeof window === "undefined") return null;

    if (window.pdfjsLib) {
      return window.pdfjsLib;
    }

    // Ensure stylesheet is loaded
    if (!document.querySelector('link[href*="pdf_viewer.min.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/vendor/pdfjs/pdf_viewer.min.css";
      document.head.appendChild(link);
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
      let retries = 0;
      while (!window.pdfjsLib && retries < 20) {
        await new Promise((r) => setTimeout(r, 50));
        retries++;
      }
    }

    const lib = (window as unknown as { pdfjsLib?: PdfJsLib }).pdfjsLib;
    if (lib) {
      lib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";
      return lib;
    }

    throw new Error("PDF.js failed to initialize");
  }, []);

  // Load the authentic PDF document and inspect page viewports
  useEffect(() => {
    if (!isOpen || !activeItem?.filePath) {
      if (docRef.current) {
        try {
          docRef.current.destroy();
        } catch {
          // ignore
        }
        docRef.current = null;
      }
      if (loadingTaskRef.current) {
        try {
          loadingTaskRef.current.destroy();
        } catch {
          // ignore
        }
        loadingTaskRef.current = null;
      }
      return;
    }

    let isCancelled = false;

    async function loadPdfDocument() {
      setIsLoadingPdf(true);
      setLoadError(null);

      try {
        const pdfjs = await ensurePdfJsLoaded();
        if (!pdfjs || isCancelled) return;

        const rawUrl = activeItem?.filePath || "";
        const cleanUrl = rawUrl.split("#")[0];

        // Clean up previous task/doc if active
        if (loadingTaskRef.current) {
          try {
            loadingTaskRef.current.destroy();
          } catch {
            // ignore
          }
          loadingTaskRef.current = null;
        }
        if (docRef.current) {
          try {
            docRef.current.destroy();
          } catch {
            // ignore
          }
          docRef.current = null;
        }

        const task = pdfjs.getDocument({
          url: cleanUrl,
          cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/",
        });
        loadingTaskRef.current = task;

        const doc = await task.promise;
        if (isCancelled) {
          doc.destroy();
          return;
        }

        docRef.current = doc;

        const metaList: PageMetadata[] = [];
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          if (isCancelled || doc.destroyed) return;
          const page = await doc.getPage(pageNum);
          const baseViewport = page.getViewport({ scale: 1 });
          metaList.push({
            pageNumber: pageNum,
            width: baseViewport.width,
            height: baseViewport.height,
            aspectRatio: baseViewport.width / baseViewport.height,
          });
        }

        if (!isCancelled && !doc.destroyed) {
          setPdfDoc(doc);
          setPagesMeta(metaList);
          setIsLoadingPdf(false);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const error = err as Error;
          if (
            error?.name === "RenderingCancelledException" ||
            error?.name === "AbortException" ||
            error?.message?.includes("cancelled") ||
            error?.message?.includes("destroyed")
          ) {
            return;
          }
          console.error("PDF load error:", error);
          setLoadError(error?.message || "Failed to load PDF preview");
          setIsLoadingPdf(false);
        }
      }
    }

    loadPdfDocument();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, activeItem?.filePath, ensurePdfJsLoaded]);

  // Track the actual DOM width of the preview container via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isOpen) return;

    const handleResize = () => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    };

    handleResize();
    const ro = new ResizeObserver(handleResize);
    ro.observe(el);

    return () => ro.disconnect();
  }, [isOpen]);

  // Debounce the heavy vector/text re-rendering during pinch/zoom gestures for smooth 60fps interaction
  useEffect(() => {
    if (containerWidth <= 0) return;

    const timer = setTimeout(() => {
      setDebouncedWidth(containerWidth);
    }, 120);

    return () => clearTimeout(timer);
  }, [containerWidth]);

  // Handle escape key and keyboard zoom shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        handleZoomIn();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        handleZoomOut();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    if (isOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, handleZoomIn, handleZoomOut]);

  // Trackpad pinch gesture handler: scales smoothly within [20%, 650%]
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
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
      className="fixed inset-0 z-[100] font-body" 
      role="dialog" 
      aria-modal="true"
      onWheel={handleWheel}
    >
      {/* Dark Blur Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto cursor-pointer select-none"
        onClick={onClose}
        aria-label="Close modal overlay"
      />

      {/* Top Floating Bar: Left title, Center Zoom Pill (- + | 100%), and Right Close Cross */}
      <div className="absolute top-2 left-2 right-2 sm:top-2.5 sm:left-6 sm:right-6 z-[110] flex items-center justify-between pointer-events-none select-none animate-in slide-in-from-top-2 fade-in duration-300 gap-1.5">
        {/* Left: Name of the File */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 text-white font-heading font-semibold text-sm sm:text-[1.2rem] drop-shadow-md pointer-events-auto min-w-0 max-w-[28%] sm:max-w-xs md:max-w-sm lg:max-w-md">
          <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-brand-lime dark:text-[#ACEE5F] shrink-0" strokeWidth={2.5} />
          <span className="truncate">
            {displayName}
          </span>
        </div>

        {/* Center: Pill-shaped Zoom Indicator (same compact 28px height as original) */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center pointer-events-auto">
          <div className="h-[28px] px-1 flex items-center bg-[#151720]/90 backdrop-blur-md border border-[#2B3042] rounded-full text-white shadow-md overflow-hidden gap-0.5">
            {/* Zoom Out Button (-) */}
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= MIN_ZOOM + 0.005}
              className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/10 active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-300 transition-all cursor-pointer outline-none focus:outline-none"
              aria-label="Zoom Out"
              title="Zoom out (-)"
            >
              <Minus className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>

            {/* Zoom In Button (+) */}
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= MAX_ZOOM - 0.005}
              className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/10 active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-300 transition-all cursor-pointer outline-none focus:outline-none"
              aria-label="Zoom In"
              title="Zoom in (+)"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>

            {/* Subtle Divider */}
            <div className="w-[1px] h-3 bg-[#2B3042] mx-0.5 shrink-0" />

            {/* Percentage Reset Button on the Right */}
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="h-[22px] px-2 min-w-[44px] rounded-full flex items-center justify-center text-[0.76rem] font-bold text-zinc-200 hover:text-brand-lime hover:bg-white/10 active:scale-95 transition-all cursor-pointer outline-none focus:outline-none shrink-0"
              title="Click to reset zoom (100%)"
            >
              {Math.round(zoom * 100)}%
            </button>
          </div>
        </div>

        {/* Right: Corner Close Cross */}
        <div className="flex items-center pointer-events-auto ml-auto">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer border border-transparent hover:border-white/10 outline-none focus:outline-none"
            aria-label="Close"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Document Workspace — Smooth horizontal and vertical scrolling with centered container */}
      <div 
        className="absolute inset-0 pt-9 pb-2 px-2 sm:pt-10 sm:pb-3 sm:px-4 overflow-auto custom-scrollbar z-[105]"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div 
          className="min-w-full min-h-full flex justify-center items-start py-2"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          {/* Container: Transparent background card that blends seamlessly with the blur background, no border color, sharp corners */}
          <div 
            ref={containerRef}
            className="bg-transparent rounded-none border-0 flex flex-col items-center relative select-text shrink-0 my-auto"
            style={{
              width: `${Math.round(BASE_WIDTH * zoom)}px`,
              maxWidth: zoom <= 1 ? "calc(100vw - 1.5rem)" : undefined,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isLoadingPdf ? (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-zinc-400 gap-3 bg-transparent select-none">
                <Loader2 className="w-8 h-8 animate-spin text-brand-lime" />
                <p className="text-sm font-semibold">Rendering vector PDF...</p>
              </div>
            ) : loadError ? (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-zinc-300 gap-3 bg-transparent text-center p-6 select-none">
                <p className="text-sm text-red-400 font-semibold">{loadError}</p>
                <p className="text-xs text-zinc-400">Unable to render in-browser canvas. You can download or view via direct link.</p>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center space-y-4 py-1 select-text">
                {pagesMeta.map((meta) => (
                  <PdfPageItem
                    key={meta.pageNumber}
                    pdfDoc={pdfDoc}
                    pageMeta={meta}
                    renderWidth={debouncedWidth > 0 ? debouncedWidth : containerWidth}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
