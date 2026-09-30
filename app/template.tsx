"use client";

import { usePathname } from "next/navigation";

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname.startsWith("/auth") || pathname.startsWith("/login") || pathname.startsWith("/signup");

  // Auth routes have their own seamless in-place state transitions
  if (isAuth) {
    return <>{children}</>;
  }

  // Clean, elegant fade transition between routes
  const animationClass = "animate-in fade-in duration-250 ease-out";

  return (
    <div className={`w-full h-full flex flex-col flex-1 ${animationClass}`}>
      {children}
    </div>
  );
}
