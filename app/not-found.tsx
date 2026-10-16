import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[65vh] p-6 text-center">
      <div className="max-w-md w-full p-8 bg-bg-card border border-border-subtle rounded-2xl shadow-sm flex flex-col items-center gap-5 dark:border-[#2B3042]">
        <div className="w-16 h-16 rounded-full bg-brand-lime/20 flex items-center justify-center text-brand-dark dark:text-brand-lime">
          <Search className="w-8 h-8" />
        </div>

        <div>
          <span className="font-heading text-sm font-bold uppercase tracking-wider text-brand-lime bg-brand-dark px-2.5 py-0.5 rounded-full dark:bg-brand-lime dark:text-[#111827]">
            404
          </span>
          <h2 className="font-heading text-2xl font-bold text-text-primary dark:text-white mt-3 mb-2">
            Page Not Found
          </h2>
          <p className="text-text-muted text-sm leading-relaxed">
            The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
          </p>
        </div>

        <div className="pt-2 w-full">
          <Link
            href="/"
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm bg-brand-dark text-white hover:bg-brand-lime hover:text-[#111827] transition-all cursor-pointer dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Job Board</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
