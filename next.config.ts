import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Needed for Prisma and bcryptjs in serverless/edge environments
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
