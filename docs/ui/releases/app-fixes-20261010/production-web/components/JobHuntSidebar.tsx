"use client";

import { Briefcase, FileText, Settings } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useCreditStore } from "@/store/useCreditStore";
import { authClient } from "@/lib/auth/client";

const TABS = [
  { id: "curated", label: "Curated Jobs", icon: Briefcase, href: "/job-hunt" },
  { id: "applications", label: "My Applications", icon: FileText, href: "/job-hunt/applications" },
  { id: "manage", label: "Manage Job Hunt", icon: Settings, href: "/job-hunt/manage" },
];

export const creditBalanceLabel = (balance: number | null) => balance === null ? "Loading credits..." : `${balance} available`;

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
  
  const { data: session } = authClient.useSession();
  const balance = useCreditStore((s) => s.balance);
  const walletUserId = useCreditStore((s) => s.userId);
  const credits = session?.user?.id && walletUserId === session.user.id ? balance : null;

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
    <>
      {/* Mobile Top Navigation (Visible on < md screens, ensuring zero element disappearance) */}
      <div className="flex md:hidden flex-col gap-2.5 w-full bg-bg-card rounded-xl p-3 border border-border-subtle/80 dark:border-white/10 shadow-xs select-none">
        {/* Credits Status Row */}
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-text-primary dark:text-white">Tailor Credits</span>
            <span className="text-[11px] font-bold text-text-muted">
              {creditBalanceLabel(credits)}
            </span>
          </div>
          
        </div>

        {/* Mobile Segmented 3-Tab Switcher */}
        <div className="grid grid-cols-3 gap-1 bg-bg-input dark:bg-[#1A1C24] p-1 rounded-lg border border-border-subtle dark:border-[#2B3042]">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id, tab.href)}
                className={`flex items-center justify-center gap-1.5 py-2 px-1 text-xs font-bold rounded-md transition-all duration-200 cursor-pointer text-center truncate ${
                  isActive
                    ? "bg-[#111827] text-white dark:bg-[#2D3244] shadow-xs"
                    : "text-text-muted hover:text-text-primary dark:hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {tab.id === "curated" ? "Curated" : tab.id === "applications" ? "Applications" : "Manage"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Sticky Sidebar (Visible on md+) */}
      <aside className="hidden md:flex w-[260px] lg:w-[280px] shrink-0 flex-col sticky top-[84px] h-[calc(100vh-110px)] overflow-y-auto hide-scrollbar bg-bg-card rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-border-subtle/80 dark:border-transparent dark:shadow-sm select-none">
        {/* Applications Progress Container -> Repurposed for Credits */}
        <div className="p-5 border-b border-border-subtle">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs sm:text-sm font-bold text-text-primary">Tailor Credits</span>
            <span className="text-xs font-bold text-text-muted">
              {creditBalanceLabel(credits)}
            </span>
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
    </>
  );
}
