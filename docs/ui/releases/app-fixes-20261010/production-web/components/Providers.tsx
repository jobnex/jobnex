"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { LocationHydrator } from "./LocationHydrator";
import { SavedJobsHydrator } from "./SavedJobsHydrator";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
        <LocationHydrator />
        <SavedJobsHydrator />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
