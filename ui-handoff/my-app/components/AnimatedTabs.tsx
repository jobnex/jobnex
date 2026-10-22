import { useState } from "react";

interface AnimatedTabsProps {
  tabs: {
    id: string;
    label: string;
    count?: number;
  }[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function AnimatedTabs({ tabs, activeTab, onTabChange }: AnimatedTabsProps) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  const currentPillTab = hoveredTab ?? activeTab;
  const isHoveringOther = hoveredTab !== null && hoveredTab !== activeTab;
  
  // Assuming 2 tabs for now, left/right logic could be made generic if needed
  const activeIndex = tabs.findIndex(t => t.id === currentPillTab);

  return (
    <div 
      className="relative flex items-center p-1 bg-bg-input border-[1.5px] border-border-input rounded-full w-fit select-none"
      onMouseLeave={() => setHoveredTab(null)}
    >
      <div 
        className={`absolute top-1 bottom-1 w-[120px] rounded-full transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] pointer-events-none ${
          isHoveringOther
            ? "bg-transparent border-[1.5px] border-border-input shadow-none dark:bg-transparent dark:border-border-input dark:shadow-none"
            : "bg-bg-card border-[1.5px] border-transparent shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-[#222534] dark:border-transparent dark:shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
        }`}
        style={{ left: `calc(4px + ${activeIndex * 120}px)` }}
      />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => {
            onTabChange(tab.id);
            setHoveredTab(null);
          }}
          onMouseEnter={() => setHoveredTab(tab.id)}
          className={`relative z-10 w-[120px] py-[0.35rem] text-[0.85rem] font-bold rounded-full cursor-pointer transition-colors duration-250 ${
            activeTab === tab.id
              ? isHoveringOther
                ? "text-text-primary dark:text-[#E2E8F0]"
                : "text-text-primary dark:text-white"
              : hoveredTab === tab.id
              ? "text-[#111827] dark:text-white"
              : "text-text-muted hover:text-text-primary dark:hover:text-white"
          }`}
        >
          {tab.label} {tab.count !== undefined && `(${tab.count})`}
        </button>
      ))}
    </div>
  );
}
