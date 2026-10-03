import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async rewrites() {
    // When CLOUDRUN_MATCHING_URL is set, edge-proxy /api/jobs/matched directly to Cloud Run
    if (process.env.CLOUDRUN_MATCHING_URL) {
      return [
        {
          source: "/api/jobs/matched",
          destination: `${process.env.CLOUDRUN_MATCHING_URL}/api/jobs/matched`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
