"use client";

import { Briefcase, FileText, Settings } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useCreditStore } from "@/store/useCreditStore";

const TABS = [
  { id: "curated", label: "Curated Jobs", icon: Briefcase, href: "/job-hunt" },
  { id: "applications", label: "My Applications", icon: FileText, href: "/job-hunt/applications" },
  { id: "manage", label: "Manage Job Hunt", icon: Settings, href: "/job-hunt/manage" },
];

export function JobHuntSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const getTabIdFromPath = (path: string) => {
    if (path === "/job-hunt/manage") return "manage";
    if (path === "/job-hunt/applications") return "applications";
    return "curated";
  };

  const pathnameTab = getTabIdFromPath(pathname);
  const [activeTab, setActiveTab] = useState<string>(pathnameTab);
  const [prevPathnameTab, setPrevPathnameTab] = useState<string>(pathnameTab);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  
  const { balance: credits, fetchCredits } = useCreditStore();

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  if (pathnameTab !== prevPathnameTab) {
    setActiveTab(pathnameTab);
    setPrevPathnameTab(pathnameTab);
  }

  const activeIndex = TABS.findIndex((t) => t.id === activeTab);
  const hoveredIndex = hoveredTab ? TABS.findIndex((t) => t.id === hoveredTab) : -1;
  const currentPillIndex = hoveredIndex !== -1 ? hoveredIndex : (activeIndex !== -1 ? activeIndex : 0);
  const isHoveringOther = hoveredTab !== null && hoveredTab !== activeTab;

  const handleTabClick = (tabId: string, href: string) => {
    setActiveTab(tabId);
    setHoveredTab(null);
    router.push(href);
  };

  return (
    <aside className="hidden md:flex w-[280px] shrink-0 flex-col sticky top-[100px] h-[calc(100vh-130px)] overflow-y-auto hide-scrollbar bg-bg-card rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-border-subtle/80 dark:border-transparent dark:shadow-sm select-none">
      {/* Applications Progress Container -> Repurposed for Credits */}
      <div className="p-5 border-b border-border-subtle">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[0.85rem] font-bold text-text-primary">Tailor Credits</span>
          <span className="text-[0.8rem] font-bold text-text-muted">
            {credits !== null ? credits : "..."} / 200
          </span>
        </div>
        <div className="h-1.5 w-full bg-[#E5E7EB] dark:bg-[#374151] rounded-full overflow-hidden">
          <div 
            className="h-full bg-brand-lime rounded-full transition-all duration-500" 
            style={{ width: credits !== null ? `${Math.min(100, Math.max(0, (credits / 200) * 100))}%` : "0%" }} 
          />
        </div>
      </div>

      <nav
        className="relative flex flex-col p-4 pt-8 gap-1"
        onMouseLeave={() => setHoveredTab(null)}
      >
        {/* Sliding Pill Indicator: Solid on active tab, transitions to outline pill on hover, smoothly fills on click */}
        <div
          className={`absolute left-4 right-4 h-[48px] rounded-md transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] pointer-events-none shadow-none ${
            isHoveringOther
              ? "bg-transparent border-[1.5px] border-[#111827] dark:bg-transparent dark:border-[#525B75]"
              : "bg-[#111827] border-[1.5px] border-transparent dark:bg-[#2D3244] dark:border-transparent"
          }`}
          style={{ top: `calc(2rem + ${currentPillIndex * 52}px)` }}
        />

        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isHovered = hoveredTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id, tab.href)}
              onMouseEnter={() => setHoveredTab(tab.id)}
              className={`relative z-10 flex items-center gap-3 px-4 h-[48px] rounded-md font-bold transition-colors duration-250 cursor-pointer text-left w-full ${
                isActive
                  ? isHoveringOther
                    ? "text-text-primary dark:text-[#E2E8F0]"
                    : "text-white"
                  : isHovered
                  ? "text-[#111827] dark:text-white"
                  : "text-text-muted hover:text-text-primary dark:hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
