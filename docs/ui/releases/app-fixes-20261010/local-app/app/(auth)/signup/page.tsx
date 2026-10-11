import { Metadata } from "next";
import { Suspense } from "react";
import { AuthContainer } from "@/components/auth/AuthContainer";
import { LoaderDots } from "@/components/ui/LoaderDots";

export const metadata: Metadata = {
  title: "Create Account | Strawberry Jobs",
  description: "Create your Strawberry Jobs account and climb higher in your career.",
};

export default function SignUpPage() {
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

