"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Mail,
  ShieldCheck,
  Clock,
  Copy,
  Check,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";

export interface ManualCheckoutViewProps {
  plan: "starter" | "pro";
  onBack: () => void;
  email?: string;
  whatsapp?: string;
}

/**
 * Official Meta WhatsApp brand glyph with scalable vector coordinates.
 */
function WhatsAppIcon({ className = "w-5 h-5 shrink-0" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 720 720"
      fill="currentColor"
      className={className}
    >
      <path d="M360,0C161.18,0,0,161.18,0,360c0,65.41,17.45,126.75,47.94,179.61L0,720l187.02-44.21c51.34,28.18,110.28,44.21,172.98,44.21,198.82,0,360-161.18,360-360S558.82,0,360,0ZM360,655.52c-60.17,0-116.13-17.98-162.82-48.87l-110.49,28.14,30.99-105.61c-33.53-47.93-53.2-106.26-53.2-169.19,0-163.21,132.31-295.52,295.52-295.52s295.52,132.31,295.52,295.52-132.31,295.52-295.52,295.52Z" />
      <path d="M444.35,407.52l87.1,41.06c4,1.88,6.56,5.94,6.2,10.34-.94,11.46-5.54,34.43-26.13,55.02-58.12,58.12-162.49-7.64-166.74-10.18-25.67-13.79-50.06-32.24-73.19-55.36-23.12-23.12-41.58-47.52-55.37-73.19-2.55-4.24-68.31-108.61-10.18-166.74,20.59-20.59,43.56-25.19,55.02-26.13,4.41-.36,8.46,2.2,10.34,6.2l41.07,87.1c1.94,4.12,1.09,9.02-2.13,12.24l-30.61,30.61c-6.62,6.62-8.56,16.93-4,25.11,11.17,20.03,26.19,39.32,43.59,57.07,17.75,17.4,37.04,32.43,57.07,43.59,8.18,4.56,18.48,2.62,25.11-4l30.61-30.61c3.22-3.22,8.12-4.08,12.24-2.13Z" />
    </svg>
  );
}

export function ManualCheckoutView({
  plan,
  onBack,
  email = "customer_support@jobnex.co",
  whatsapp = "+1 (716) 704 3154",
}: ManualCheckoutViewProps) {
  const { data: session } = authClient.useSession();
  const [copied, setCopied] = useState(false);

  const isPro = plan === "pro";
  const planName = isPro ? "Pro" : "Starter";
  const planResumes = isPro ? "300" : "200";
  const planPrice = isPro ? "129" : "99";
  const planPer = isPro ? "$0.43" : "$0.50";

  // Base message rendered identically on server and client to eliminate SSR hydration mismatch
  const baseMsg = `Hi Jobnex! I'd like the ${planName} plan (${planResumes} resumes, $${planPrice}). Please send me the payment details.`;

  // Dynamic user message enhanced with session email on client interaction
  const getUserMsg = () => {
    const userAccountNote = session?.user?.email
      ? ` My Jobnex account email is ${session.user.email}.`
      : "";
    return `Hi Jobnex! I'd like the ${planName} plan (${planResumes} resumes, $${planPrice}).${userAccountNote} Please send me the payment details.`;
  };

  const waNum = whatsapp.replace(/[^0-9]/g, "");
  const cleanEmail = email.replace(/[\[\]]/g, "");

  // Safe SSR base URLs matching server and client perfectly
  const waHref = `https://wa.me/${waNum}?text=${encodeURIComponent(baseMsg)}`;
  const mailHref = `mailto:${cleanEmail}?subject=${encodeURIComponent(
    `Jobnex ${planName} plan — payment details`
  )}&body=${encodeURIComponent(baseMsg)}`;

  // Dynamic click handlers that append user account email when available
  const handleWhatsAppClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (session?.user?.email) {
      e.preventDefault();
      const dynamicHref = `https://wa.me/${waNum}?text=${encodeURIComponent(getUserMsg())}`;
      window.open(dynamicHref, "_blank", "noopener,noreferrer");
    }
  };

  const handleEmailClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (session?.user?.email) {
      e.preventDefault();
      const dynamicHref = `mailto:${cleanEmail}?subject=${encodeURIComponent(
        `Jobnex ${planName} plan — payment details`
      )}&body=${encodeURIComponent(getUserMsg())}`;
      window.location.href = dynamicHref;
    }
  };

  const handleCopyMessage = async () => {
    const textToCopy = getUserMsg();
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    }
  };

  return (
    <section
      aria-label="Checkout"
      className="w-full max-w-[840px] mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 flex flex-col items-center gap-4 animate-in fade-in duration-200"
    >
      {/* Top Navigation Row: Back button */}
      <div className="w-full flex items-center justify-start">
        <button
          type="button"
          onClick={onBack}
          className="group inline-flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs sm:text-sm text-[#a3a9b4] hover:text-[#f3f4f6] hover:bg-[#1c1f26] transition-colors cursor-pointer select-none font-medium"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.2} />
          <span>Back to plans</span>
        </button>
      </div>

      {/* Main Checkout Card (Desktop-optimized 840px with bulletproof radius & native styling) */}
      <div
        style={{ maxWidth: 840, width: "100%", borderRadius: 24 }}
        className="relative w-full checkout-card flex flex-col box-border overflow-hidden select-text"
      >
        <div className="checkout-card-body">
          {/* 1 · HEADER: LEFT-ALIGNED STATUS NOTE & TITLE */}
          <div className="w-full flex flex-col text-left gap-2">
            {/* Status Note: Unboxed, left-aligned, clock icon matches text color */}
            <div className="w-full flex items-center justify-start">
              <span className="inline-flex items-center gap-1.5 text-xs sm:text-[13px] text-[#a3a9b4] select-none font-medium">
                <Clock className="w-3.5 h-3.5 text-[#a3a9b4] shrink-0" strokeWidth={2} />
                <span>In-app payments launching soon</span>
              </span>
            </div>

            {/* Title & Subtext */}
            <div className="flex flex-col text-left pt-0.5">
              <h1 className="m-0 text-2xl sm:text-[28px] md:text-3xl font-bold tracking-tight text-[#f3f4f6] leading-tight font-heading">
                Get your plan in 3 simple steps
              </h1>
              <p className="m-0 text-xs sm:text-[14px] leading-relaxed text-[#a3a9b4] pt-1.5">
                Until card checkout is live, our team sets up your plan personally.
              </p>
            </div>
          </div>

          {/* 2 · PLAN SUMMARY PRICING CARD (Stacked Vertically Below Heading) */}
          <div
            style={{ borderRadius: 16 }}
            className="w-full p-4 sm:p-5 bg-[#0b0d12] border border-[#262a33] rounded-2xl flex justify-between items-center gap-4"
          >
            <div className="flex flex-col gap-1 min-w-0 text-left">
              <span className="text-base sm:text-lg font-bold text-[#f3f4f6] tracking-tight truncate">
                {planName}
              </span>
              <span className="text-xs sm:text-sm text-[#a3a9b4] truncate">
                {planResumes} tailored resumes &middot; {planPer} each
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 flex-wrap justify-end">
              {isPro && (
                <>
                  <span className="bg-[#aeee5e]/15 text-[#aeee5e] font-semibold text-xs px-2.5 py-0.5 rounded-full select-none">
                    13% off
                  </span>
                  <s className="text-xs sm:text-sm text-[#7d838e] font-normal">
                    $149
                  </s>
                </>
              )}
              <span className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#f3f4f6] leading-none flex items-baseline">
                <span className="text-[0.55em] align-super font-normal text-[#9ca3af] mr-0.5">
                  $
                </span>
                {planPrice}
              </span>
            </div>
          </div>

          {/* 3 · PROGRESS STEPPER (Center-Aligned Rail to Milestone Centers) */}
          <div className="w-full">
            <ol
              aria-label="How it works"
              className="m-0 p-0 list-none relative grid grid-cols-3 w-full"
            >
              {/* Background rail connecting milestone node centers (Center at 16px) */}
              <span
                aria-hidden="true"
                style={{ background: "#2a2e37" }}
                className="checkout-stepper-rail"
              />
              {/* Active progress rail (Step 1 to Step 2 gradient) */}
              <span
                aria-hidden="true"
                style={{
                  background: "linear-gradient(90deg, #aeee5e, #2a2e37)",
                  width: "33.333%",
                }}
                className="checkout-stepper-rail"
              />

              {/* Step 1: Active Milestone */}
              <li
                aria-current="step"
                className="relative z-10 flex flex-col items-center text-center gap-2 select-none px-1"
              >
                <span
                  aria-hidden="true"
                  style={{ borderRadius: 9999 }}
                  className="w-8 h-8 flex items-center justify-center bg-[#aeee5e] text-[#10141f] font-bold text-xs sm:text-sm rounded-full shadow-[0_0_0_6px_rgba(174,238,94,0.16)] shrink-0"
                >
                  1
                </span>
                <div className="flex flex-col items-center gap-0.5 min-w-0">
                  <span className="text-[11px] sm:text-[13px] font-semibold text-[#f3f4f6] leading-tight">
                    Message us
                  </span>
                  <span className="text-[10px] sm:text-xs text-[#aeee5e] font-medium leading-tight">
                    You&apos;re here
                  </span>
                </div>
              </li>

              {/* Step 2 */}
              <li className="relative z-10 flex flex-col items-center text-center gap-2 select-none px-1">
                <span
                  aria-hidden="true"
                  style={{ borderRadius: 9999 }}
                  className="w-8 h-8 flex items-center justify-center bg-[#14161b] text-[#d4d8de] font-semibold text-xs sm:text-sm border-2 border-[#3a3f4a] rounded-full shrink-0"
                >
                  2
                </span>
                <div className="flex flex-col items-center gap-0.5 min-w-0">
                  <span className="text-[11px] sm:text-[13px] font-semibold text-[#d4d8de] leading-tight">
                    Receive invoice
                  </span>
                  <span className="text-[10px] sm:text-xs text-[#a3a9b4] leading-tight">
                    Within 1 hour
                  </span>
                </div>
              </li>

              {/* Step 3 */}
              <li className="relative z-10 flex flex-col items-center text-center gap-2 select-none px-1">
                <span
                  aria-hidden="true"
                  style={{ borderRadius: 9999 }}
                  className="w-8 h-8 flex items-center justify-center bg-[#14161b] text-[#d4d8de] font-semibold text-xs sm:text-sm border-2 border-[#3a3f4a] rounded-full shrink-0"
                >
                  3
                </span>
                <div className="flex flex-col items-center gap-0.5 min-w-0">
                  <span className="text-[11px] sm:text-[13px] font-semibold text-[#d4d8de] leading-tight">
                    Plan activated
                  </span>
                  <span className="text-[10px] sm:text-xs text-[#a3a9b4] leading-tight">
                    Right after payment
                  </span>
                </div>
              </li>
            </ol>
          </div>

          {/* 3 · SIDE-BY-SIDE ACTIONS: WHATSAPP (LIME) + EMAIL (FILLED, BORDERLESS, ARROW) */}
          <div className="w-full flex flex-col items-center gap-3.5">
            <div className="checkout-actions-grid">
              {/* Primary Action: WhatsApp */}
              <a
                href={waHref}
                onClick={handleWhatsAppClick}
                suppressHydrationWarning
                target="_blank"
                rel="noopener noreferrer"
                style={{ borderRadius: 14 }}
                className="group relative h-14 w-full flex items-center justify-center gap-2.5 bg-[#aeee5e] hover:bg-[#c8f78c] active:scale-[0.99] text-[#10141f] no-underline font-bold text-sm sm:text-base rounded-xl transition-all duration-200 select-none shadow-sm cursor-pointer"
              >
                <WhatsAppIcon className="w-5 h-5 shrink-0" />
                <span className="tracking-tight">Continue on WhatsApp</span>
                <ArrowRight
                  className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1"
                  strokeWidth={2.4}
                />
              </a>

              {/* Secondary Action: Email (Solid fill, no outline, with arrow) */}
              <a
                href={mailHref}
                onClick={handleEmailClick}
                suppressHydrationWarning
                style={{ borderRadius: 14 }}
                className="group relative h-14 w-full flex items-center justify-center gap-2.5 bg-[#1f232e] hover:bg-[#282d3b] hover:text-white active:scale-[0.99] text-[#f3f4f6] no-underline font-semibold text-sm sm:text-base rounded-xl transition-all duration-200 select-none cursor-pointer border-0"
              >
                <Mail
                  className="w-5 h-5 shrink-0 text-[#a3a9b4] group-hover:text-[#f3f4f6] transition-colors"
                  strokeWidth={2}
                />
                <span className="tracking-tight">Continue with email</span>
                <ArrowRight
                  className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1 text-[#a3a9b4] group-hover:text-white"
                  strokeWidth={2.4}
                />
              </a>
            </div>

            {/* Pre-fill reassurance & fail-safe copy action */}
            <div className="flex flex-col items-center gap-1.5 pt-0.5 text-center">
              <p className="m-0 text-center text-xs text-[#a3a9b4]">
                Your plan details are pre-filled. Just hit send.
              </p>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="inline-flex items-center gap-1.5 text-xs text-[#8e95a5] hover:text-white transition-colors cursor-pointer py-1.5 px-3 rounded-lg hover:bg-[#1c1f26]"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#aeee5e]" strokeWidth={2.5} />
                    <span className="text-[#aeee5e] font-medium">
                      Copied pre-filled message!
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" strokeWidth={2} />
                    <span>Having trouble? Click to copy request message</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 4 · STREAMLINED SECURITY FOOTER (Left-aligned with Shield icon for first line, matching container padding) */}
        <div
          style={{ borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}
          className="pt-3.5 pb-4 px-6 sm:px-10 border-t border-[#262a33] bg-[#111318] flex items-start justify-start gap-2.5"
        >
          <ShieldCheck className="w-4 h-4 text-[#aeee5e] shrink-0 mt-0.5" strokeWidth={2.2} />
          <p className="m-0 text-xs sm:text-[13px] leading-relaxed text-[#8e95a5] text-left">
            Only pay using details sent from{" "}
            <a
              href={mailHref}
              onClick={handleEmailClick}
              suppressHydrationWarning
              className="text-[#f3f4f6] font-medium underline underline-offset-2 decoration-[#3a4050] hover:decoration-white hover:text-white transition-colors"
            >
              {email}
            </a>{" "}
            or{" "}
            <a
              href={waHref}
              onClick={handleWhatsAppClick}
              suppressHydrationWarning
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#f3f4f6] font-medium underline underline-offset-2 decoration-[#3a4050] hover:decoration-white hover:text-white transition-colors"
            >
              {whatsapp}
            </a>. We&apos;ll never ask for your OTP, password, or card PIN.
          </p>
        </div>
      </div>
    </section>
  );
}
