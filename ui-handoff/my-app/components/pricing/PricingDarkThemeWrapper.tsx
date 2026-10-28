"use client";

import { useEffect } from "react";

export function PricingDarkThemeWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    const hadDarkClass = root.classList.contains("dark");

    // Force pure dark mode on pricing route
    root.setAttribute("data-theme", "dark");
    root.classList.add("dark");

    return () => {
      // Restore user's previous preference when leaving pricing route
      if (previousTheme) {
        root.setAttribute("data-theme", previousTheme);
      } else {
        root.removeAttribute("data-theme");
      }
      if (!hadDarkClass) {
        root.classList.remove("dark");
      }
    };
  }, []);

  return (
    <div
      data-theme="dark"
      className="dark bg-[#0b0d12] text-[#f3f4f6] min-h-screen flex flex-col font-sans antialiased [color-scheme:dark]"
    >
      {children}
    </div>
  );
}
