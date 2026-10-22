import { Metadata } from "next";
import { Suspense } from "react";
import { AuthContainer } from "@/components/auth/AuthContainer";
import { LoaderDots } from "@/components/ui/LoaderDots";

export const metadata: Metadata = {
  title: {
    absolute: "Join Jobnex | Sign Up & Login",
  },
  description: "Sign in or create your Jobnex account to explore curated product, design, and tech opportunities.",
};

export default function AuthPage() {
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

