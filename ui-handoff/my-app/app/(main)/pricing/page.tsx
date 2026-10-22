import type { Metadata } from "next";
import { Suspense } from "react";
import { PricingDarkThemeWrapper } from "@/components/pricing/PricingDarkThemeWrapper";
import { PricingView } from "@/components/pricing/PricingView";

export const metadata: Metadata = {
  title: "Pricing | Jobnex",
  description:
    "Simple pricing. No surprises. Flexible resume packages with AI tailoring, smart tracking, and personalized job recommendations.",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ plan?: string }>;
}) {
  const params = await searchParams;
  const initialPlan =
    params?.plan === "starter" || params?.plan === "pro"
      ? (params.plan as "starter" | "pro")
      : undefined;

  return (
    <PricingDarkThemeWrapper>
      <Suspense fallback={<div className="min-h-screen bg-[#0b0d12]" />}>
        <PricingView initialPlan={initialPlan} />
      </Suspense>
    </PricingDarkThemeWrapper>
  );
}
