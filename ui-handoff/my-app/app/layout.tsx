import type { Metadata } from "next";
import localFont from "next/font/local";
import { Rubik, Geist, Geist_Mono, Comfortaa } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

const comfortaa = Comfortaa({
  subsets: ["latin"],
  variable: "--font-comfortaa",
  display: "swap",
});

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
  title: {
    default: "Jobnex | AI Job Search",
    template: "%s | Jobnex",
  },
  description: "Explore verified technical, design, and growth positions from top-tier product teams.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.json",
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
      className={cn("h-full", "antialiased", monaSans.variable, rubik.variable, geist.variable, geistMono.variable, comfortaa.variable)}
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
