import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async rewrites() {
    // When CLOUDRUN_MATCHING_URL is configured on Vercel, edge-proxy /api/jobs/matched
    // directly to GCP Cloud Run, putting 0% serverless function CPU load on Vercel.
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
