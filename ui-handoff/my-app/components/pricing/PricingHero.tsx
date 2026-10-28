import { ShieldCheck } from "lucide-react";

export function PricingHero() {
  return (
    <section
      id="top"
      className="max-w-[780px] mx-auto px-4 sm:px-6 pt-10 sm:pt-12 pb-5 flex flex-col items-center text-center gap-3.5"
    >
      <h1 className="m-0 font-heading text-[clamp(1.75rem,3.2vw,2.5rem)] leading-tight tracking-tight font-semibold text-[#f3f4f6]">
        Simple pricing.{" "}
        <span className="font-extrabold text-[#aeee5e]">No surprises.</span>
      </h1>

      <div className="flex gap-2.5 flex-wrap justify-center mt-0.5">
        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#171a24] rounded-full text-xs sm:text-[13px] font-medium text-[#d4d8de] select-none shadow-sm">
          <ShieldCheck className="w-4 h-4 text-[#aeee5e] shrink-0" strokeWidth={2.3} />
          Cancel anytime
        </span>
        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#171a24] rounded-full text-xs sm:text-[13px] font-medium text-[#d4d8de] select-none shadow-sm">
          <ShieldCheck className="w-4 h-4 text-[#aeee5e] shrink-0" strokeWidth={2.3} />
          No commitment
        </span>
      </div>
    </section>
  );
}
