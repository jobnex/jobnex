import React from "react";

interface StrawberryLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showHoverEffect?: boolean;
}

const SIZE_MAP = {
  sm: "w-[clamp(1.25rem,calc(1.15rem+0.25vw),1.5rem)] h-[clamp(1.25rem,calc(1.15rem+0.25vw),1.5rem)]",
  md: "w-[clamp(1.5rem,calc(1.35rem+0.37vw),1.75rem)] h-[clamp(1.5rem,calc(1.35rem+0.37vw),1.75rem)]",
  lg: "w-16 h-16 sm:w-20 sm:h-20",
  xl: "w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32",
};

export function StrawberryLogo({
  size = "md",
  className = "",
  showHoverEffect = true,
}: StrawberryLogoProps) {
  const sizeClass = SIZE_MAP[size] || size;
  const hoverClass = showHoverEffect
    ? "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-rotate-12 group-hover:scale-110"
    : "transition-transform duration-300";

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${sizeClass} ${hoverClass} ${className} shrink-0 select-none`}
      aria-hidden="true"
    >
      {/* Strawberry Body */}
      <path
        d="M16 29C16 29 6 22 6 13.5C6 9.5 9 6.5 13 6.5C14.2 6.5 15.3 6.9 16 7.5C16.7 6.9 17.8 6.5 19 6.5C23 6.5 26 9.5 26 13.5C26 22 16 29 16 29Z"
        fill="#FF3B5C"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[#111827] dark:text-[#31364A]"
      />
      {/* Strawberry Seeds */}
      <circle cx="12" cy="13" r="1.2" fill="#B9FF66" className="dark:fill-[#ACEE5F]" />
      <circle cx="16" cy="15" r="1.2" fill="#B9FF66" className="dark:fill-[#ACEE5F]" />
      <circle cx="20" cy="13" r="1.2" fill="#B9FF66" className="dark:fill-[#ACEE5F]" />
      <circle cx="13.5" cy="19" r="1.2" fill="#B9FF66" className="dark:fill-[#ACEE5F]" />
      <circle cx="18.5" cy="19" r="1.2" fill="#B9FF66" className="dark:fill-[#ACEE5F]" />
      <circle cx="16" cy="23.5" r="1.2" fill="#B9FF66" className="dark:fill-[#ACEE5F]" />
      {/* Leaves & Crown Stem */}
      <path
        d="M16 6.5V3M11 6.5C12 4.5 14.5 4 16 6C17.5 4 20 4.5 21 6.5"
        stroke="#B9FF66"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="dark:stroke-[#ACEE5F]"
      />
    </svg>
  );
}
