import { Metadata } from "next";
import { Suspense } from "react";
import { AuthContainer } from "@/components/auth/AuthContainer";
import { LoaderDots } from "@/components/ui/LoaderDots";

export const metadata: Metadata = {
  title: "Sign In | Strawberry Jobs",
  description: "Sign in to your Strawberry Jobs account to explore curated opportunities.",
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-bg-page">
          <LoaderDots className="w-8 h-8  " />
        </div>
      }
    >
      <AuthContainer />
    </Suspense>
  );
}

