import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Needed for Prisma and bcryptjs in serverless/edge environments
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
