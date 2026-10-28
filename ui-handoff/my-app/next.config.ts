import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@base-ui/react",
      "@tanstack/react-query",
      "drizzle-orm",
      "clsx",
      "tailwind-merge",
    ],
  },
};

export default nextConfig;


