"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { X, ArrowRight, RefreshCw } from "lucide-react";
import { LoaderDots } from "@/components/ui/LoaderDots";
import { StrawberryLogo } from "@/components/ui/StrawberryLogo";
import { maskEmail } from "@/lib/utils";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";

export function AuthContainer() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") || "/job-hunt";

  // Resend countdown timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === "code" && !canResend) {
      interval = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step, canResend]);

  const handleEmailContinue = async () => {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
      if (error) throw new Error(error.message || "Failed to send code");
      
      toast.success("Verification code sent to your email!");
      
      setStep("code");
      setResendTimer(30);
      setCanResend(false);
      setCode("");
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error(String(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep("email");
  };

  const handleResendCode = async () => {
    if (!canResend) return;
    await handleEmailContinue();
  };

  const handleVerifyCode = async () => {
    if (!code || code.length < 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await authClient.signIn.emailOtp({ 
        email, 
        otp: code,
        // In Better Auth, rememberMe sets the session to be persistent rather than session-only
        rememberMe: true
      });
      if (error) throw new Error(error.message || "Invalid code");
      
      toast.success("Successfully authenticated!");
      
      // Force Next.js to refresh server components and update session states natively
      router.refresh();
      
      // Give the toast a moment, then redirect
      setTimeout(() => {
        router.push(callbackUrl);
      }, 500);
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error(String(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const { error } = await authClient.signIn.social({ 
        provider: 'google', 
        callbackURL: callbackUrl 
      });
      if (error) {
        toast.error(error.message || "Failed to initialize Google sign in");
        setIsLoading(false);
      }
      // If successful, the page will redirect automatically, so we leave isLoading true
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error(String(err));
      }
      setIsLoading(false);
    }
  };

  const maskedDisplayEmail = maskEmail(email);

  return (
    <div className="relative w-full min-h-screen bg-bg-page text-text-primary flex flex-col lg:flex-row transition-colors duration-200">
      
      {/* Top Header Utility: Close (X) button */}
      <div className="absolute top-5 left-5 sm:top-7 sm:left-8 z-30 flex items-center">
        <Link
          href="/"
          aria-label="Close"
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-tag border border-transparent hover:border-border-subtle transition-all duration-150 active:scale-95 cursor-pointer"
        >
          <X className="w-5 h-5" strokeWidth={2.2} />
        </Link>
      </div>

      {/* Left Half: Auth Form Area - Centered Vertically on the Page */}
      <div className="w-full lg:w-1/2 min-h-screen flex items-center justify-center lg:justify-end lg:pr-8 xl:pr-10 p-6 sm:p-8 z-10 overflow-hidden">
        {/* Masked Viewport */}
        <div
          className="w-full max-w-[390px] overflow-hidden py-1"
          style={{
            maskImage: "linear-gradient(to right, transparent 0%, black 3px, black calc(100% - 3px), transparent 100%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 3px, black calc(100% - 3px), transparent 100%)",
          }}
        >
          
          {/* 2-Slide Horizontal Carousel Track with Exponential Deceleration Curve */}
          <div
            className="w-[200%] flex transition-transform duration-500 ease-[cubic-bezier(0.08,0.85,0.18,1)]"
            style={{
              transform: step === "email" ? "translateX(0%)" : "translateX(-50%)",
            }}
          >
            
            {/* SLIDE 1: Email Form */}
            <div
              className={`w-1/2 px-1 flex flex-col items-center shrink-0 transition-all duration-500 ease-[cubic-bezier(0.08,0.85,0.18,1)] ${
                step === "email"
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-[0.98] pointer-events-none"
              }`}
              aria-hidden={step !== "email"}
            >
              {/* Section 1: Title (Exact 40px height + 30px margin) */}
              <div className="w-full min-h-[40px] flex items-center justify-center text-center mb-7 sm:mb-8">
                <h1 className="font-heading font-semibold text-[1.35rem] sm:text-[1.75rem] tracking-tight text-text-primary leading-tight whitespace-nowrap">
                  Create an account or sign in
                </h1>
              </div>
              
              {/* Section 2: Google Button + 'or' Separator (Total exact 132px height) */}
              <div className="w-full flex flex-col items-center pt-5">
                {/* Google Sign In */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  tabIndex={step === "email" ? 0 : -1}
                  className="w-full h-11 flex items-center justify-center gap-[0.6rem] rounded-[var(--border-radius-sm)] border-[1.5px] border-border-color bg-bg-card hover:bg-bg-tag text-text-primary font-heading font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <LoaderDots className="w-4 h-4" />
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                        <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                          <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                          <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                          <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                          <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                        </g>
                      </svg>
                      Continue with Google
                    </>
                  )}
                </button>
  
                {/* Equidistant 'or' separator centered between Google button & Email input */}
                <div className="my-[26px] flex items-center justify-center text-[0.85rem] font-bold uppercase text-text-subtle select-none leading-none tracking-widest">
                  OR
                </div>
              </div>

              {/* Section 3: Form with Input + Continue Button */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleEmailContinue();
                }}
                className="w-full space-y-4"
              >
                <div>
                  <label htmlFor="auth-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    disabled={isLoading}
                    tabIndex={step === "email" ? 0 : -1}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="Enter your email address"
                    className="w-full h-11 px-3.5 bg-bg-input border-[1.5px] border-border-input rounded-[var(--border-radius-sm)] font-medium text-text-primary placeholder:text-text-subtle focus:outline-none focus:border-border-color focus:ring-1 focus:ring-border-color transition-all text-sm disabled:opacity-50"
                  />
                </div>
                
                {/* Continue Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  tabIndex={step === "email" ? 0 : -1}
                  className="group w-full h-11 rounded-[var(--border-radius-sm)] border-[1.5px] border-border-color bg-brand-dark text-white flex items-center justify-center gap-1.5 hover:bg-brand-lime hover:text-[#111827] dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white transition-all duration-200 font-heading font-semibold text-sm active:scale-[0.98] cursor-pointer overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <LoaderDots className="w-4 h-4 " />
                  ) : (
                    <>
                      <span className="transition-transform duration-200 ease-out group-hover:-translate-x-1">
                        Continue
                      </span>
                      <ArrowRight
                        className="w-4 h-4 -ml-2 opacity-0 -translate-x-2 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-hover:ml-0 shrink-0"
                        strokeWidth={2.5}
                      />
                    </>
                  )}
                </button>

                {/* Vertical Balance Spacer matching Resend Code row in Slide 2 */}
                <div className="h-6" aria-hidden="true" />
              </form>

              {/* Section 4: Privacy & Terms Note */}
              <p className="text-center text-[0.75rem] text-text-subtle mt-8">
                Before continuing, read our{" "}
                <Link href="/terms" className="underline hover:text-text-primary">Terms</Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline hover:text-text-primary">Privacy information</Link>.
              </p>
            </div>

            {/* SLIDE 2: OTP Form */}
            <div
              className={`w-1/2 px-1 flex flex-col items-center shrink-0 transition-all duration-500 ease-[cubic-bezier(0.08,0.85,0.18,1)] ${
                step === "code"
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-[0.98] pointer-events-none"
              }`}
              aria-hidden={step !== "code"}
            >
              {/* Section 1: Title (Exact 40px height + 30px margin matching Slide 1 Title exactly) */}
              <div className="w-full min-h-[40px] flex items-center justify-center text-center mb-7 sm:mb-8">
                <h1 className="font-heading font-semibold text-2xl sm:text-[1.75rem] tracking-tight text-text-primary leading-tight">
                  Check your email
                </h1>
              </div>

              {/* Section 2: Verification Message + Masked Email (Exact 132px height matching Slide 1 Section 2) */}
              <div className="w-full h-[132px] flex flex-col items-center justify-center gap-1.5 text-center">
                <p className="text-text-muted font-medium text-xs sm:text-sm leading-relaxed">
                  We sent a verification code to
                </p>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <span className="font-mono font-bold text-xs sm:text-sm text-text-primary tracking-tight">
                    {maskedDisplayEmail}
                  </span>
                  <button
                    type="button"
                    tabIndex={step === "code" ? 0 : -1}
                    onClick={handleBackToEmail}
                    disabled={isLoading}
                    className="text-xs font-bold text-brand-dark dark:text-brand-lime underline underline-offset-2 hover:opacity-75 cursor-pointer transition-opacity disabled:opacity-50"
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Section 3: Form with OTP Input + Verify Button + Resend */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleVerifyCode();
                }}
                className="w-full space-y-4"
              >
                <div>
                  <label htmlFor="verification-code-input" className="sr-only">
                    Verification code
                  </label>
                  <input
                    id="verification-code-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter code"
                    tabIndex={step === "code" ? 0 : -1}
                    value={code}
                    disabled={isLoading}
                    onChange={(e) => setCode(e.target.value)}
                    autoFocus={step === "code"}
                    className="font-mono w-full h-11 px-3.5 bg-bg-input border-[1.5px] border-border-input rounded-[var(--border-radius-sm)] font-medium text-center text-text-primary placeholder:text-text-subtle placeholder:font-normal placeholder:tracking-normal focus:placeholder-transparent focus:outline-none focus:border-border-color focus:bg-bg-card focus:ring-1 focus:ring-border-color transition-all text-sm sm:text-base tracking-[0.3em] disabled:opacity-50"
                  />
                </div>

                {/* Verify & Continue Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  tabIndex={step === "code" ? 0 : -1}
                  className="group w-full h-11 rounded-[var(--border-radius-sm)] border-[1.5px] border-border-color bg-brand-dark text-white flex items-center justify-center gap-1.5 hover:bg-brand-lime hover:text-[#111827] dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white transition-all duration-200 font-heading font-semibold text-sm active:scale-[0.98] cursor-pointer overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <LoaderDots className="w-4 h-4 " />
                  ) : (
                    <>
                      <span className="transition-transform duration-200 ease-out group-hover:-translate-x-1">
                        Verify & Continue
                      </span>
                      <ArrowRight
                        className="w-4 h-4 -ml-2 opacity-0 -translate-x-2 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-hover:ml-0 shrink-0"
                        strokeWidth={2.5}
                      />
                    </>
                  )}
                </button>

                {/* Resend Code Section */}
                <div className="h-6 flex items-center justify-center text-center">
                  {canResend ? (
                    <button
                      type="button"
                      tabIndex={step === "code" ? 0 : -1}
                      onClick={handleResendCode}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-text-primary hover:underline cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Resend verification code</span>
                    </button>
                  ) : (
                    <p className="text-xs sm:text-sm font-medium text-text-muted">
                      Didn&apos;t receive code? Resend in{" "}
                      <span className="font-bold text-text-primary">{resendTimer}s</span>
                    </p>
                  )}
                </div>
              </form>

              {/* Section 4: Privacy & Terms Note */}
              <p className="text-center text-[0.75rem] text-text-subtle mt-8">
                Before continuing, read our{" "}
                <Link href="/terms" className="underline hover:text-text-primary">Terms</Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline hover:text-text-primary">Privacy information</Link>.
              </p>
            </div>

          </div>

        </div>
      </div>

      {/* Right Half: Perfectly Centered Strawberry Jobs Logo & Wordmark */}
      <div className="hidden lg:flex lg:w-1/2 min-h-screen relative items-center justify-center p-8 lg:p-12 select-none">
        <div className="relative flex flex-col items-center justify-center text-center gap-5">
          <div className="relative group cursor-default">
            <StrawberryLogo size="xl" showHoverEffect={false} className="hover:scale-105" />
          </div>

          <h2 className="font-heading font-semibold text-3xl sm:text-4xl lg:text-[2.6rem] text-text-primary select-none">
            strawberry jobs
          </h2>
        </div>
      </div>

    </div>
  );
}
