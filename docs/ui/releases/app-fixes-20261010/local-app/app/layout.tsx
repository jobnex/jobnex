import type { Metadata } from "next";
import localFont from "next/font/local";
import { Rubik, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

const monaSans = localFont({
  src: "./fonts/MonaSansVF.woff2",
  variable: "--font-mona-sans",
  display: "swap",
  weight: "200 900",
});

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Strawberry Jobs - Navigating Careers For Success",
  description: "Explore verified technical, design, and growth positions from top-tier product teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full", "antialiased", monaSans.variable, rubik.variable, geist.variable, geistMono.variable)}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          <Toaster position="bottom-right" theme="system" />
        </Providers>
      </body>
    </html>
  );
}
