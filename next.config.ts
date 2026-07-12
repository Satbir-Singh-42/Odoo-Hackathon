import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Needed for Prisma and bcryptjs in serverless/edge environments
  serverExternalPackages: ["@prisma/client", "bcryptjs"],

  webpack(config) {
    // Ensure @/* resolves from project root
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname),
    };
    return config;
  },
};

export default nextConfig;
