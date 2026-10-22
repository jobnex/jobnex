"use client";

import React, { useSyncExternalStore } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PricingHero } from "./PricingHero";
import { PricingCards } from "./PricingCards";
import { PricingComparison } from "./PricingComparison";
import { ManualCheckoutView } from "./ManualCheckoutView";

const emptySubscribe = () => () => {};

export interface PricingViewProps {
  initialPlan?: "starter" | "pro";
}

export function PricingView({ initialPlan }: PricingViewProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const paramPlan = searchParams.get("plan");

  // Single source of truth:
  // On SSR, leverage server-evaluated initialPlan.
  // On client, derived directly from live searchParams.
  const activePlan = isMounted
    ? (paramPlan === "pro" || paramPlan === "starter" ? paramPlan : null)
    : (initialPlan ?? (paramPlan === "pro" || paramPlan === "starter" ? paramPlan : null));

  const selectedPlan: "starter" | "pro" | null = activePlan;

  const handleSelectPlan = (plan: "starter" | "pro") => {
    router.replace(`${pathname}?plan=${plan}`, { scroll: false });
  };

  const handleBackToPlans = () => {
    router.replace(pathname, { scroll: false });
  };

  // Dedicated Checkout View:
  // When a plan is selected, render ONLY the center-aligned checkout view.
  if (selectedPlan) {
    return (
      <div className="flex-1 w-full min-h-[calc(100vh-14rem)] flex items-center justify-center pb-14 animate-in fade-in duration-200">
        <ManualCheckoutView
          plan={selectedPlan}
          onBack={handleBackToPlans}
        />
      </div>
    );
  }

  // Default view: Pricing Hero, Cards, and Comparison Matrix
  return (
    <div className="flex-1 w-full pb-14 animate-in fade-in duration-200">
      {/* Hero Section with trust badges */}
      <PricingHero />

      {/* Pricing Tiers with onSelectPlan callback */}
      <PricingCards onSelectPlan={handleSelectPlan} />

      {/* Full Feature Comparison Matrix */}
      <PricingComparison />

      {/* Footnote */}
      <div className="max-w-[840px] mx-auto px-4 sm:px-6 pt-6 pb-6 text-center text-xs text-[#a3a9b4] select-none">
        © Jobnex · Prices shown in USD.
      </div>
    </div>
  );
}
