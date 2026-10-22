import React from "react";

export interface JobnexLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showHoverEffect?: boolean;
}

const SIZE_MAP = {
  sm: "w-5 h-5 sm:w-6 sm:h-6",
  md: "w-[1.65rem] h-[1.65rem] sm:w-7 sm:h-7",
  lg: "w-14 h-14 sm:w-16 sm:h-16",
  xl: "w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32",
};

/**
 * Jobnex Brand Symbol:
 * Foundation base block (Step 1) in solid ink (white in dark mode, charcoal in light mode)
 * meeting an elevated accent block (Step 2) in Electric Lime at one sharp contact point.
 * Every corner is smooth (rx=4) except the contact vertex representing career advancement.
 */
export function JobnexLogo({
  size = "md",
  className = "",
  showHoverEffect = true,
}: JobnexLogoProps) {
  const sizeClass = SIZE_MAP[size] || size;
  const hoverClass = showHoverEffect
    ? "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 group-hover:-translate-y-0.5"
    : "transition-transform duration-300";

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${sizeClass} ${hoverClass} ${className} shrink-0 select-none`}
      role="img"
      aria-label="Jobnex Logo"
    >
      {/* Foundation Block - Step 1 (White / Charcoal ink) */}
      <path
        d="M10,22 H26 V38 A4,4 0 0 1 22,42 H10 A4,4 0 0 1 6,38 V26 A4,4 0 0 1 10,22 Z"
        className="fill-[#111827] dark:fill-[#F3F4F6] transition-colors duration-200"
      />
      {/* Elevated Step Block - Step 2 (Electric Lime accent) */}
      <path
        d="M26,10 A4,4 0 0 1 30,6 H38 A4,4 0 0 1 42,10 V18 A4,4 0 0 1 38,22 H26 Z"
        fill="var(--brand-lime, #B9FF66)"
        className="dark:fill-[var(--brand-lime,#ACEE5F)] transition-colors duration-200"
      />
    </svg>
  );
}
