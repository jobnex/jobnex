"use client";

import { useMemo, useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, Sparkles, Bookmark } from "lucide-react";
import { authClient } from "@/lib/auth/client";

function HeaderProfileIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="7" r="4" />
      <path d="M4 20.5C4 16.91 7.13 14 11 14H13C16.87 14 20 16.91 20 20.5C20 21.05 19.55 21.5 19 21.5H5C4.45 21.5 4 21.05 4 20.5Z" />
    </svg>
  );
}

interface NavItem {
  id: "job-board" | "job-hunt" | "saved" | "profile";
  label: string;
  icon?: typeof Briefcase;
  isProfile?: boolean;
  href: string;
}

export function FloatingBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  // Optimistic tab selection for 0ms instantaneous animation on tap
  const [optimisticTabId, setOptimisticTabId] = useState<string | null>(null);

  const navItems: NavItem[] = useMemo(
    () => [
      {
        id: "job-board",
        label: "Job Board",
        icon: Briefcase,
        href: "/",
      },
      {
        id: "job-hunt",
        label: "Job Hunt",
        icon: Sparkles,
        href: "/job-hunt",
      },
      {
        id: "saved",
        label: "Saved",
        icon: Bookmark,
        href: "/saved-jobs",
      },
      {
        id: "profile",
        label: "Profile",
        isProfile: true,
        href: session?.user ? "/profile" : `/auth?callbackUrl=${encodeURIComponent(pathname || "/")}`,
      },
    ],
    [session?.user, pathname]
  );

  // Determine active tab ID (optimistic first, fallback to pathname match)
  const currentPathTabId = useMemo(() => {
    if (!pathname) return "job-board";
    if (pathname === "/" || pathname.startsWith("/job/")) return "job-board";
    if (pathname.startsWith("/job-hunt")) return "job-hunt";
    if (pathname.startsWith("/saved-jobs")) return "saved";
    if (pathname.startsWith("/profile") || pathname.startsWith("/auth")) return "profile";
    return "job-board";
  }, [pathname]);

  const activeTabId = optimisticTabId ?? currentPathTabId;

  // Sync optimistic override with pathname changes without cascading effect renders
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOptimisticTabId(null);
  }

  const handleNavigate = useCallback(
    (item: NavItem) => {
      setOptimisticTabId(item.id);
      router.push(item.href, { scroll: false });
    },
    [router]
  );

  return (
    <nav
      role="navigation"
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,1rem))] left-1/2 -translate-x-1/2 z-50 md:hidden print:hidden select-none pointer-events-auto animate-in fade-in slide-in-from-bottom-5 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
    >
      {/* 
        Rock-solid Fixed-width Capsule Dock (272px):
        - Inactive tabs: 40px circle each (3 x 40px = 120px)
        - Active tab: 122px elongated pill (1 x 122px = 122px)
        - Inter-item gaps: 3 x 6px = 18px
        - Capsule padding: 2 x 6px = 12px
        - Exact sum: 122 + 120 + 18 + 12 = 272px CONSTANT.
        Because sum of widths during transition is mathematically invariant (122 - ΔW + 40 + ΔW = 162),
        the container NEVER resizes, NEVER wobbles, and the UI NEVER jumps!
      */}
      <div className="relative flex items-center gap-1.5 p-1.5 rounded-full border-0 outline-none ring-0 w-[272px] bg-[#DFE3E8]/95 text-zinc-900 shadow-[0_12px_36px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] backdrop-blur-xl dark:bg-[#252936]/95 dark:text-white dark:shadow-[0_16px_40px_rgba(0,0,0,0.6),0_2px_8px_rgba(0,0,0,0.3)]">
        {navItems.map((item) => {
          const isActive = activeTabId === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item)}
              className={`group relative flex items-center h-10 rounded-full border-0 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 active:outline-none ring-0 ring-offset-0 cursor-pointer select-none overflow-hidden transition-[width,background-color,color] duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isActive
                  ? "w-[122px] bg-white text-zinc-900 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:bg-[#E2E5EB] dark:text-zinc-900 dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),0_1px_2px_rgba(0,0,0,0.15)]"
                  : "w-10 bg-transparent text-[#4B5563] hover:text-zinc-900 hover:bg-black/[0.04] dark:text-[#9BA5B7] dark:hover:text-white dark:hover:bg-white/[0.06]"
              }`}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              {/* 
                Invariant Icon Container: Exactly 40x40px anchored to the left.
                The icon stays in the exact same position whether active or inactive,
                completely preventing icons from jumping horizontally.
              */}
              <div className="w-10 h-10 shrink-0 flex items-center justify-center">
                {item.isProfile ? (
                  <HeaderProfileIcon
                    className={`w-[18px] h-[18px] shrink-0 transition-transform duration-250 ${
                      isActive
                        ? "scale-105 text-zinc-900 dark:text-zinc-900"
                        : "text-[#4B5563] group-hover:scale-110 dark:text-[#9BA5B7] dark:group-hover:text-white"
                    }`}
                  />
                ) : Icon ? (
                  <Icon
                    className={`w-[18px] h-[18px] shrink-0 transition-transform duration-250 ${
                      isActive
                        ? "scale-105 text-zinc-900 dark:text-zinc-900"
                        : "text-[#4B5563] group-hover:scale-110 dark:text-[#9BA5B7] dark:group-hover:text-white"
                    }`}
                    strokeWidth={isActive ? 2.4 : 2}
                    fill={item.id === "saved" && isActive ? "currentColor" : "none"}
                  />
                ) : null}
              </div>

              {/* 
                Smoothly Animated Label: Slides and fades in without shifting the icon 
                or causing layout jumping.
              */}
              <span
                className={`font-heading text-xs font-semibold tracking-wide whitespace-nowrap overflow-hidden pr-3 transition-[opacity,transform] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isActive
                    ? "opacity-100 translate-x-0 delay-75"
                    : "opacity-0 -translate-x-2 pointer-events-none"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
