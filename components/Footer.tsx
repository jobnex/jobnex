"use client";

import { JobnexLogo } from "@/components/ui/JobnexLogo";

export function Footer() {
  return (
    <footer className="bg-[#111827] text-white rounded-t-[var(--border-radius-lg)] pt-[2.75rem] pb-28 md:pb-[2rem] mt-[3rem] dark:bg-[#0C0D11] dark:border-t dark:border-border-subtle">
      <div className="fluid-container">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-[var(--space-l)] pb-[var(--space-m)] border-b border-white/10 mb-[var(--space-m)]">
          <div className="flex items-center gap-[0.6rem] cursor-pointer group select-none">
            <JobnexLogo size="sm" className="w-6 h-6" />
            <span className="font-wordmark text-xl sm:text-2xl font-bold tracking-tight">
              <span className="text-white">Job</span>
              <span className="text-brand-lime">nex</span>
            </span>
          </div>

          <ul className="flex flex-wrap gap-4 sm:gap-[1.75rem] list-none text-xs sm:text-sm">
            <li><a href="#" className="text-gray-300 font-semibold hover:text-brand-lime transition-colors cursor-pointer">For Candidates</a></li>
            <li><a href="#" className="text-gray-300 font-semibold hover:text-brand-lime transition-colors cursor-pointer">For Employers</a></li>
            <li><a href="#" className="text-gray-300 font-semibold hover:text-brand-lime transition-colors cursor-pointer">Our Guidelines</a></li>
            <li><a href="#" className="text-gray-300 font-semibold hover:text-brand-lime transition-colors cursor-pointer">Contact</a></li>
          </ul>

          <div className="flex gap-[0.65rem]">
            <a href="#" aria-label="Twitter / X" className="w-8 h-8 rounded bg-[#1F2433] flex items-center justify-center text-white cursor-pointer hover:bg-brand-lime hover:text-[#111827] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1.5px]">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path></svg>
            </a>
            <a href="#" aria-label="LinkedIn" className="w-8 h-8 rounded bg-[#1F2433] flex items-center justify-center text-white cursor-pointer hover:bg-brand-lime hover:text-[#111827] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1.5px]">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
            </a>
            <a href="#" aria-label="GitHub" className="w-8 h-8 rounded bg-[#1F2433] flex items-center justify-center text-white cursor-pointer hover:bg-brand-lime hover:text-[#111827] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1.5px]">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
            </a>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center text-[#8E92A4] text-xs sm:text-sm gap-3">
          <p>&copy; {new Date().getFullYear()} Jobnex. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors cursor-pointer">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors cursor-pointer">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
