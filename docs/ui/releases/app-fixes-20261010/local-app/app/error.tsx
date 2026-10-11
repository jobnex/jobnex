"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled Application Error:", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="max-w-md w-full p-8 bg-bg-card border border-border-subtle rounded-2xl shadow-sm flex flex-col items-center gap-5 dark:border-[#2B3042]">
        <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center text-red-600 dark:text-red-400">
          <AlertCircle className="w-7 h-7" />
        </div>
        
        <div>
          <h2 className="font-heading text-xl font-bold text-text-primary dark:text-white mb-2">
            Something went wrong
          </h2>
          <p className="text-text-muted text-sm leading-relaxed">
            An unexpected error occurred while loading this page. Our team has been notified.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
          <button
            onClick={() => reset()}
            className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm bg-brand-dark text-white hover:bg-brand-lime hover:text-[#111827] transition-all cursor-pointer dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try Again</span>
          </button>
          <Link
            href="/"
            className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm border border-border-input bg-bg-card text-text-primary hover:bg-bg-tag transition-all cursor-pointer dark:border-[#2B3042] dark:text-white dark:hover:bg-[#1C1E24]"
          >
            <Home className="w-4 h-4" />
            <span>Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
