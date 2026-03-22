import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@catest/ui'],
  devIndicators: {
    position: 'bottom-right',
  },
};

export default nextConfig;
