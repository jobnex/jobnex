"use client";

import { ArrowRight, Check } from "lucide-react";

export interface PricingCardsProps {
  onSelectPlan?: (plan: "starter" | "pro") => void;
}

export function PricingCards({ onSelectPlan }: PricingCardsProps) {
  return (
    <section
      id="plans"
      aria-label="Plans"
      className="max-w-[840px] mx-auto px-4 sm:px-6 pt-6 pb-8"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-7 items-center">
        {/* PRO (ON THE LEFT - ELEVATED WITH NATURAL TOP BANNER HIERARCHY) */}
        <article
          style={{ borderRadius: 24 }}
          className="relative z-10 bg-[#14161b] border-2 border-[#aeee5e] text-[#f3f4f6] rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col md:scale-[1.02] shadow-[0_0_35px_-10px_rgba(174,238,94,0.2)] transition-transform duration-200"
        >
          {/* Top Banner: normal title case, creates natural height delta */}
          <div className="w-full py-2.5 bg-[#aeee5e]/15 text-center font-semibold text-xs sm:text-[13px] text-[#aeee5e] select-none">
            Most Popular
          </div>

          <div className="p-7 sm:p-8 flex flex-col gap-6 flex-1">
            {/* Header Row: Pro title */}
            <div className="flex justify-between items-center gap-3">
              <h2 className="m-0 font-heading text-xl sm:text-2xl font-bold tracking-tight text-[#f3f4f6]">
                Pro
              </h2>
            </div>

            {/* Price display: less weighted font, 13% off aligned to bottom */}
            <div className="flex items-end gap-2.5 flex-wrap">
              <span className="text-4xl sm:text-[44px] font-bold tracking-tight leading-none text-[#f3f4f6] flex items-baseline">
                <span className="text-[0.55em] align-super mr-0.5 font-normal text-[#9ca3af]">$</span>
                129
              </span>
              <span className="text-base sm:text-lg font-medium text-[#a3a9b4] leading-none mb-1">
                $<span className="line-through decoration-[2px]">149</span>
              </span>
              <span className="bg-[#aeee5e]/15 text-[#aeee5e] font-semibold text-xs px-2.5 py-0.5 rounded-full select-none mb-0.5">
                13% off
              </span>
            </div>

            {/* Get button directly below pricing */}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => onSelectPlan?.("pro")}
                className="group w-full flex items-center justify-center gap-2 bg-[#aeee5e] text-[#10141f] font-bold text-sm sm:text-[15px] py-3.5 px-5 rounded-xl transition-colors duration-200 hover:bg-[#c8f78c] active:scale-[0.99] select-none cursor-pointer"
              >
                <span>Get my 300 resumes</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.4} />
              </button>

              {/* Per resume pricing: dollar duller */}
              <p className="m-0 text-center text-xs sm:text-[13px] text-[#a3a9b4]">
                <span className="font-semibold text-[#f3f4f6]">
                  <span className="text-[#6b7280] font-normal mr-0.5">$</span>0.43
                </span>{" "}
                per resume
              </p>
            </div>

            {/* Feature checklist: separating line removed, comfortable gap */}
            <ul className="m-0 p-0 list-none flex flex-col gap-3.5 text-xs sm:text-sm text-[#d4d8de] pt-3 sm:pt-4">
              <li className="flex gap-2.5 items-start">
                <Check
                  className="w-4 h-4 shrink-0 mt-0.5 text-[#aeee5e]"
                  strokeWidth={2.8}
                />
                <span>
                  <strong className="font-bold text-[#f3f4f6]">300 tailored resumes</strong> — 100 more than Starter
                </span>
              </li>
              <li className="flex gap-2.5 items-start">
                <Check
                  className="w-4 h-4 shrink-0 mt-0.5 text-[#aeee5e]"
                  strokeWidth={2.8}
                />
                <span className="font-medium">Unlimited job search</span>
              </li>
              <li className="flex gap-2.5 items-start">
                <Check
                  className="w-4 h-4 shrink-0 mt-0.5 text-[#aeee5e]"
                  strokeWidth={2.8}
                />
                <span className="font-medium">Personalized job recommendations</span>
              </li>
              <li className="flex gap-2.5 items-start">
                <Check
                  className="w-4 h-4 shrink-0 mt-0.5 text-[#aeee5e]"
                  strokeWidth={2.8}
                />
                <span className="font-medium">Application tracking</span>
              </li>
            </ul>
          </div>
        </article>

        {/* STARTER (ON THE RIGHT - TALLER, SPACIOUS, SUBTLE HEIGHT DELTA TO PRO) */}
        <article
          style={{ borderRadius: 24 }}
          className="bg-[#14161b] border border-[#262a33] text-[#f3f4f6] rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col transition-transform duration-200"
        >
          <div className="p-7 sm:p-8 flex flex-col gap-6 flex-1">
            {/* Header Row: Starter title */}
            <div className="flex justify-between items-center gap-3">
              <h2 className="m-0 font-heading text-xl sm:text-2xl font-bold tracking-tight text-[#f3f4f6]">
                Starter
              </h2>
            </div>

            {/* Price display: less weighted font */}
            <div className="flex items-baseline gap-2.5">
              <span className="text-4xl sm:text-[44px] font-bold tracking-tight leading-none text-[#f3f4f6] flex items-baseline">
                <span className="text-[0.55em] align-super mr-0.5 font-normal text-[#9ca3af]">$</span>
                99
              </span>
            </div>

            {/* Action button: filled with slightly diff shade from bg, no outline */}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => onSelectPlan?.("starter")}
                className="group w-full flex items-center justify-center gap-2 bg-[#1f232e] text-[#f3f4f6] font-semibold text-sm sm:text-[15px] py-3.5 px-5 rounded-xl transition-colors duration-200 hover:bg-[#282d3b] hover:text-white select-none shadow-sm cursor-pointer"
              >
                <span>Start with 200 resumes</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.2} />
              </button>

              {/* Per resume pricing: dollar duller */}
              <p className="m-0 text-center text-xs sm:text-[13px] text-[#a3a9b4]">
                <span className="font-semibold text-[#f3f4f6]">
                  <span className="text-[#6b7280] font-normal mr-0.5">$</span>0.50
                </span>{" "}
                per resume
              </p>
            </div>

            {/* Feature checklist: separating line removed, comfortable gap */}
            <ul className="m-0 p-0 list-none flex flex-col gap-3.5 text-xs sm:text-sm text-[#d4d8de] pt-3 sm:pt-4">
              <li className="flex gap-2.5 items-start">
                <Check
                  className="w-4 h-4 shrink-0 mt-0.5 text-[#aeee5e]"
                  strokeWidth={2.8}
                />
                <span>
                  <strong className="font-semibold text-[#f3f4f6]">200 tailored resumes</strong>
                </span>
              </li>
              <li className="flex gap-2.5 items-start">
                <Check
                  className="w-4 h-4 shrink-0 mt-0.5 text-[#aeee5e]"
                  strokeWidth={2.8}
                />
                <span>Unlimited job search</span>
              </li>
              <li className="flex gap-2.5 items-start">
                <Check
                  className="w-4 h-4 shrink-0 mt-0.5 text-[#aeee5e]"
                  strokeWidth={2.8}
                />
                <span>Personalized job recommendations</span>
              </li>
              <li className="flex gap-2.5 items-start">
                <Check
                  className="w-4 h-4 shrink-0 mt-0.5 text-[#aeee5e]"
                  strokeWidth={2.8}
                />
                <span>Application tracking</span>
              </li>
            </ul>
          </div>
        </article>
      </div>

      <p className="mt-6 mb-0 text-center text-xs text-[#a3a9b4] select-none">
        Secure checkout · Cancel in two clicks · Prices in USD
      </p>
    </section>
  );
}
