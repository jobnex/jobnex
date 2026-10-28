"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { JobnexLogo } from "@/components/ui/JobnexLogo";
import { AiResumeBannerArt } from "./AiResumeBannerArt";

export interface AiResumeOfferBannerProps {
  /**
   * Optional callback when user dismisses the banner
   */
  onDismiss?: () => void;
}

export function AiResumeOfferBanner({
  onDismiss,
}: AiResumeOfferBannerProps) {
  const { data: sessionData, isPending: isAuthPending } = authClient.useSession();
  const [isDismissed, setIsDismissed] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  // Only display if user is NOT logged in, authentication check has settled, and banner is not dismissed
  if (isAuthPending || sessionData?.user || isDismissed) {
    return null;
  }

  return (
    <aside
      aria-label="Sign up and get 5 free credits for AI-tailored resumes"
      className="relative w-full mb-3.5 sm:mb-4 lg:mb-5 overflow-hidden rounded-[22px] sm:rounded-[26px] border border-[#23262e] bg-[#14161b] text-[#f3f4f6] isolate shadow-sm animate-in fade-in duration-200"
      style={{
        containerType: "inline-size",
      }}
    >
      {/* Paper grain subtle overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-[3] opacity-20 mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
          backgroundSize: "240px",
        }}
        aria-hidden="true"
      />

      {/* Dismiss button */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss offer banner"
        className="absolute top-3 right-3 sm:top-3.5 sm:right-3.5 z-20 flex h-7 w-7 items-center justify-center rounded-lg text-[#9ca0aa] hover:text-[#f3f4f6] hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#adee5e]"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Main Grid: Left Copy & Right Art */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center min-h-[190px] sm:min-h-[205px] lg:min-h-[225px] xl:min-h-[240px]">
        {/* Copy side */}
        <div className="relative z-[2] px-5 sm:px-7 lg:pl-8 xl:pl-10 py-5 sm:py-6 lg:py-5 flex flex-col justify-center">
          {/* Eyebrow: App Logo + Jobnex Wordmark */}
          <div className="flex items-center gap-2 mb-2 sm:mb-2.5 select-none">
            <JobnexLogo
              size="sm"
              className="w-4 h-4 sm:w-[18px] sm:h-[18px] [&_path:first-child]:!fill-[#F3F4F6]"
              showHoverEffect={false}
            />
            <span className="font-wordmark font-bold tracking-tight text-xs sm:text-[13px] inline-flex items-center">
              <span className="text-[#f3f4f6]">Job</span>
              <span className="text-[#adee5e]">nex</span>
            </span>
          </div>

          {/* Heading with highlighter effect */}
          <h2 className="font-heading text-xl sm:text-2xl lg:text-[1.85rem] xl:text-[2.15rem] font-normal leading-[1.08] tracking-[-0.035em] text-[#f3f4f6] m-0">
            Every job gets{" "}
            <b className="font-extrabold lg:inline block">
              <span className="relative whitespace-nowrap z-0">
                its own resume.
                <span
                  className="absolute -left-[2%] -right-[3%] bottom-[0.04em] h-[0.24em] -z-10 bg-[#adee5e] opacity-90 rounded-[3px_9px_4px_10px] -rotate-[1.2deg]"
                  aria-hidden="true"
                />
              </span>
            </b>
          </h2>

          {/* Subtitle - fitted neatly in a single line */}
          <p className="font-body text-xs sm:text-sm lg:text-[0.938rem] text-[#9ca0aa] mt-1.5 sm:mt-2 leading-normal whitespace-normal sm:whitespace-nowrap">
            Pick a job, and AI rewrites your resume to match it
          </p>

          {/* Actions: Sign up button + Prominent Freestanding 5 Credits Callout */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-4 sm:mt-5">
            {/* Sign up free button: No glow, no bounce, retaining arrow effect */}
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 h-10 sm:h-11 px-5 sm:px-6 rounded-xl bg-[#adee5e] text-[#0f1218] font-bold text-xs sm:text-sm hover:bg-[#bcf277] transition-colors focus-visible:outline-2 focus-visible:outline-[#f3f4f6]"
            >
              Sign up free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-150" />
            </Link>

            {/* 5 credits on signup: Freestanding (no container), larger diamond, prominent glow */}
            <div className="relative inline-flex items-center gap-2.5 sm:gap-3 select-none py-1">
              {/* Prominent radial glow aura behind the emerald crystal diamond */}
              <div
                className="absolute -left-2 -top-2 w-12 h-12 bg-[#22d38f]/35 blur-xl rounded-full pointer-events-none"
                aria-hidden="true"
              />

              {/* Enlarged faceted emerald diamond SVG */}
              <svg
                className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 relative z-10"
                style={{
                  filter:
                    "drop-shadow(0 0 10px rgba(34,211,143,0.75)) drop-shadow(0 0 20px rgba(34,211,143,0.45))",
                }}
                viewBox="-13 -13 26 26"
                aria-hidden="true"
              >
                <polygon points="-1.3,-7.9 -5.2,-6.5 -0.9,-8.2" fill="#42dfa3" stroke="#0e9f68" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-1.3,-7.9 -0.9,-8.2 3.4,-10.0" fill="#80f6c8" stroke="#1dbe81" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-6.6,-2.0 -6.9,-1.5 -5.2,-6.5" fill="#8cf7cd" stroke="#1fc284" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-3.5,-4.5 -1.3,-7.9 -5.2,-6.5" fill="#83f6c9" stroke="#1dbf82" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-6.6,-2.0 -8.6,3.5 -6.9,-1.5" fill="#41dfa3" stroke="#0e9e68" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-3.5,-4.5 -5.2,-6.5 -6.6,-2.0" fill="#e8fff4" stroke="#61ebb6" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="0.8,-6.2 3.4,-10.0 -1.3,-7.9" fill="#7af4c4" stroke="#1bba7e" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="4.8,-6.6 3.4,-10.0 6.0,-6.7" fill="#043022" stroke="#08704b" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="0.8,-6.2 4.8,-6.6 3.4,-10.0" fill="#1ab97d" stroke="#086d49" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-5.2,0.5 -6.6,-2.0 -8.6,3.5" fill="#71f1bf" stroke="#19b67b" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-3.5,-4.5 0.8,-6.2 -1.3,-7.9" fill="#c5fce5" stroke="#27d493" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="4.8,-6.6 6.0,-6.7 8.6,-3.5" fill="#065b3d" stroke="#10a26b" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-5.2,0.5 -3.5,-4.5 -6.6,-2.0" fill="#e8fff4" stroke="#58e7b0" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-5.8,5.2 -6.0,6.7 -8.6,3.5" fill="#11a46d" stroke="#3edea1" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-5.2,0.5 -8.6,3.5 -5.8,5.2" fill="#70f0be" stroke="#19b67b" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-2.3,-3.0 -3.5,-4.5 0.8,-6.2" fill="#18b57a" stroke="#076846" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-3.3,-0.3 -3.5,-4.5 -2.3,-3.0" fill="#61ebb6" stroke="#16ae75" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-2.3,-3.0 0.8,-6.2 -0.0,-3.9" fill="#61ebb6" stroke="#16ae75" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="8.6,-3.5 8.8,-3.2 7.1,1.8 6.9,1.5" fill="#043525" stroke="#09764e" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-3.3,-0.3 -5.2,0.5 -3.5,-4.5" fill="#16af76" stroke="#076242" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="3.4,-3.0 8.6,-3.5 4.8,-6.6" fill="#0d9562" stroke="#27d392" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="0.8,-6.2 3.4,-3.0 4.8,-6.6" fill="#23cb8c" stroke="#0b8357" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-5.8,5.2 -3.4,10.0 -6.0,6.7" fill="#0a7d53" stroke="#1dbf82" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-0.9,-1.2 -2.3,-3.0 -0.0,-3.9" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-0.0,-3.9 0.8,-6.2 3.4,-3.0" fill="#11a46c" stroke="#3ddea0" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-0.9,-1.2 -3.3,-0.3 -2.3,-3.0" fill="#9df9d4" stroke="#21c788" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-0.9,-1.2 -0.0,-3.9 1.4,-2.2" fill="#9df9d4" stroke="#21c788" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="5.5,0.6 8.6,-3.5 6.9,1.5" fill="#03261c" stroke="#076342" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-1.9,1.4 -5.2,0.5 -3.3,-0.3" fill="#5be9b2" stroke="#14ab72" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-0.0,-3.9 3.4,-3.0 1.4,-2.2" fill="#51e5ac" stroke="#12a66e" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="3.4,-3.0 5.5,0.6 8.6,-3.5" fill="#06563a" stroke="#0e9d67" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-2.6,3.7 -5.2,0.5 -5.8,5.2" fill="#6ff0be" stroke="#19b57a" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-0.9,-1.2 -1.9,1.4 -3.3,-0.3" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="0.9,8.2 1.1,8.5 -3.2,10.3 -3.4,10.0" fill="#043525" stroke="#09764e" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="6.9,1.5 7.1,1.8 5.4,6.7 5.2,6.5" fill="#043525" stroke="#09764e" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-2.6,3.7 -5.8,5.2 -3.4,10.0" fill="#0c8a5b" stroke="#22ca8a" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-0.9,-1.2 1.4,-2.2 0.5,0.5" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-1.9,1.4 -2.6,3.7 -5.2,0.5" fill="#0f9f69" stroke="#34db9b" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-0.9,-1.2 0.5,0.5 -1.9,1.4" fill="#9df9d4" stroke="#21c788" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="5.2,6.5 5.4,6.7 1.1,8.5 0.9,8.2" fill="#043525" stroke="#09764e" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="5.5,0.6 6.9,1.5 5.2,6.5" fill="#054831" stroke="#0c8c5d" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="0.2,6.5 0.9,8.2 -3.4,10.0" fill="#054d34" stroke="#0d9260" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="1.4,-2.2 3.4,-3.0 1.7,2.0" fill="#17b278" stroke="#076544" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="0.5,0.5 -2.6,3.7 -1.9,1.4" fill="#3ddea1" stroke="#0e9c67" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="1.4,-2.2 1.7,2.0 0.5,0.5" fill="#43e0a4" stroke="#0f9f69" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-2.6,3.7 -3.4,10.0 0.2,6.5" fill="#0fa16a" stroke="#38dc9d" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="3.4,-3.0 1.7,2.0 5.5,0.6" fill="#0c8d5d" stroke="#24cc8d" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="0.2,6.5 5.2,6.5 0.9,8.2" fill="#03261c" stroke="#066041" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="1.7,2.0 5.2,6.5 5.5,0.6" fill="#076846" stroke="#15ad74" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="0.5,0.5 1.7,2.0 -2.6,3.7" fill="#15ad74" stroke="#066040" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="1.7,2.0 0.2,6.5 5.2,6.5" fill="#054932" stroke="#0c8d5d" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="1.7,2.0 -2.6,3.7 0.2,6.5" fill="#14aa71" stroke="#4ae2a8" strokeWidth="0.5" strokeLinejoin="round" />
                <polygon points="-8.6,3.5 -6.9,-1.5 -5.2,-6.5 -0.9,-8.2 3.4,-10.0 8.6,-3.5 8.8,-3.2 7.1,1.8 5.4,6.7 1.1,8.5 -3.2,10.3 -8.4,3.8" fill="none" stroke="#06150f" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>

              {/* Bold attention-grabbing typography */}
              <span className="relative z-10 text-sm sm:text-base lg:text-[1.05rem] font-medium text-[#d1d5db] flex items-baseline gap-1.5">
                <strong className="text-white font-extrabold text-base sm:text-lg lg:text-[1.2rem] tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#22d38f] via-[#8cf7cd] to-white drop-shadow-[0_0_12px_rgba(34,211,143,0.35)]">
                  5 credits
                </strong>
                <span>on signup</span>
              </span>
            </div>
          </div>
        </div>

        {/* Art side - calibrated for wide & less tall presentation */}
        <div className="relative z-[1] self-stretch flex items-center justify-center lg:justify-end pr-2 sm:pr-4 lg:pr-6 max-lg:order-first max-lg:h-[180px] sm:max-lg:h-[220px] max-lg:pt-2 max-lg:px-4 overflow-hidden">
          <div className="w-full h-full max-h-[220px] lg:max-h-[245px] xl:max-h-[265px] flex items-center justify-center lg:justify-end">
            <AiResumeBannerArt />
          </div>
        </div>
      </div>
    </aside>
  );
}
