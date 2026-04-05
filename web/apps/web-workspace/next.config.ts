import type { NextConfig } from "next";

const isSaaS = process.env.NEXT_PUBLIC_SAAS_MODE === "true";

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: isSaaS ? '/workspace' : '',
  skipTrailingSlashRedirect: true,
  transpilePackages: ['@catest/ui'],
  devIndicators: {
    position: 'bottom-right',
  },
};

export default nextConfig;
