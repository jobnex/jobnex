"use client";

import { useSyncUrlFilters } from "@/lib/hooks/useSyncUrlFilters";

export function UrlFilterSync({ variant = "default" }: { variant?: "default" | "saved" }) {
  useSyncUrlFilters(variant);
  return null;
}
