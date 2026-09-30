# Next.js Component Reference & Implementation Guide

This document provides modular, production-ready React (Next.js App Router / Pages Router) code snippets to implement the synchronized pseudo-PDF editor.

---

## 1. API Client (`lib/resumeApi.ts`)

```typescript
export interface CompileRequest {
  markdown: string;
  theme?: 2 | 3 | 5 | 6;
  include_base64?: boolean;
  destination_endpoint?: string;
}

export interface CompileResponse {
  success: boolean;
  theme: number;
  pdf_url: string;
  pdf_base64?: string;
  json_data?: Record<string, any>;
  typst_code?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
}

const SERVER_URL = process.env.NEXT_PUBLIC_RESUME_BACKEND_URL || 'http://localhost:5000';

export async function compileResumePdf(payload: CompileRequest): Promise<CompileResponse> {
  const res = await fetch(`${SERVER_URL}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      theme: payload.theme ?? 2,
      markdown: payload.markdown,
      include_base64: payload.include_base64 ?? true,
      destination_endpoint: payload.destination_endpoint,
    }),
  });

  if (!res.ok) {
    throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

export function base64ToBlobUrl(base64: string): string {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}
```

---

## 2. Sync Hook (`hooks/useResumeSync.ts`)

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import { compileResumePdf, base64ToBlobUrl, CompileResponse } from '@/lib/resumeApi';

export function useResumeSync(initialMarkdown: string, initialTheme: 2 | 3 | 5 | 6 = 2) {
  const [markdown, setMarkdown] = useState<string>(initialMarkdown);
  const [theme, setTheme] = useState<2 | 3 | 5 | 6>(initialTheme);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [compileStats, setCompileStats] = useState<{ stdout?: string; stderr?: string }>({});

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Manual Compile Trigger (e.g. user clicks "Generate PDF")
  const triggerCompile = useCallback(async (currentMd?: string, currentTheme?: 2 | 3 | 5 | 6) => {
    const mdToCompile = currentMd ?? markdown;
    const themeToUse = currentTheme ?? theme;

    setIsCompiling(true);
    setLastError(null);

    try {
      const result: CompileResponse = await compileResumePdf({
        markdown: mdToCompile,
        theme: themeToUse,
        include_base64: true,
      });

      if (result.success && result.pdf_base64) {
        const url = base64ToBlobUrl(result.pdf_base64);
        setPdfBlobUrl(url);
        setCompileStats({ stdout: result.stdout, stderr: result.stderr });
      } else {
        setLastError(result.stderr || result.error || 'Compilation failed');
      }
    } catch (err: any) {
      setLastError(err.message || 'Network error connecting to backend');
    } finally {
      setIsCompiling(false);
    }
  }, [markdown, theme]);

  // Debounced Auto-Sync on text edit (800ms quiet period)
  const updateMarkdownWithDebounce = useCallback((newMd: string) => {
    setMarkdown(newMd);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      triggerCompile(newMd, theme);
    }, 800);
  }, [theme, triggerCompile]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return {
    markdown,
    setMarkdown: updateMarkdownWithDebounce,
    setMarkdownImmediate: setMarkdown,
    theme,
    setTheme: (newTheme: 2 | 3 | 5 | 6) => {
      setTheme(newTheme);
      triggerCompile(markdown, newTheme);
    },
    isCompiling,
    pdfBlobUrl,
    lastError,
    compileStats,
    triggerCompile,
  };
}
```

---

## 3. The Pseudo-PDF Paper Component (`components/ResumeSheet.tsx`)

```tsx
import React, { useRef, useEffect, useState } from 'react';

interface ResumeSheetProps {
  theme: 2 | 3 | 5 | 6;
  zoom: number;
  children: React.ReactNode;
}

export const ResumeSheet: React.FC<ResumeSheetProps> = ({ theme, zoom, children }) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;

    // Check if content exceeds 11 inches (1056px at 96 DPI)
    const checkOverflow = () => {
      const overflow = el.scrollHeight > el.clientHeight + 2;
      setIsOverflowing(overflow);
    };

    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  // Theme-specific font families and margins matching bridge.typ
  const getThemeStyles = () => {
    switch (theme) {
      case 5: // Classic Executive (Serif)
        return {
          fontFamily: '"Times New Roman", Times, serif',
          fontSize: '8.6pt',
          lineHeight: 'calc(8.6pt + 0.46em)',
          padding: '0.8cm 1.0cm',
        };
      case 3: // Modern Clean
        return {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '8.5pt',
          lineHeight: 'calc(8.5pt + 0.48em)',
          padding: '0.8cm 1.0cm',
        };
      case 6: // Minimal Tech
        return {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '8.8pt',
          lineHeight: 'calc(8.8pt + 0.48em)',
          padding: '0.8cm 1.1cm',
        };
      case 2: // Jake's Resume (Default)
      default:
        return {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '8.5pt',
          lineHeight: 'calc(8.5pt + 0.48em)',
          padding: '0.8cm 1.0cm',
        };
    }
  };

  const themeStyles = getThemeStyles();

  return (
    <div className="relative flex flex-col items-center">
      {/* 1-Page Budget Warning Banner */}
      {isOverflowing && (
        <div className="mb-3 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-md flex items-center gap-2">
          <span>⚠️</span>
          <span>Content exceeds the 1-page boundary. Typst will generate a 2-page PDF.</span>
        </div>
      )}

      {/* Zoom Scaled Wrapper */}
      <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}>
        <div
          ref={sheetRef}
          style={{
            width: '8.5in',
            minHeight: '11in',
            maxHeight: '11in',
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            color: '#000000',
            ...themeStyles,
          }}
          className={`shadow-2xl rounded-sm relative overflow-hidden select-text ${
            isOverflowing ? 'border-b-2 border-dashed border-red-500' : ''
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
```

---

## 4. Download & Export Trigger Button

```tsx
export const DownloadPdfButton: React.FC<{ blobUrl: string | null; isCompiling: boolean }> = ({ blobUrl, isCompiling }) => {
  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'resume.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <button
      onClick={handleDownload}
      disabled={!blobUrl || isCompiling}
      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition flex items-center gap-1.5"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {isCompiling ? 'Compiling...' : 'Download Vector PDF'}
    </button>
  );
};
```
