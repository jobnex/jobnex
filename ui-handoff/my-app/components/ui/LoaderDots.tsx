import React from "react";

export function LoaderDots({ className = "" }: { className?: string }) {
  // We use aspect-square to keep it 1:1 ratio.
  // The color is currentColor, so text-black dark:text-white will color the dots.
  return (
    <div 
      className={`loader-dots aspect-square text-black dark:text-white ${className}`} 
    />
  );
}
