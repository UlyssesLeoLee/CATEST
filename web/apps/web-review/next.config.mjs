/** @type {import('next').NextConfig} */
const isSaaS = process.env.NEXT_PUBLIC_SAAS_MODE === "true";

const nextConfig = {
  output: 'standalone',
  basePath: isSaaS ? '/review' : '',
  skipTrailingSlashRedirect: true,
  transpilePackages: ['@catest/ui'],
  devIndicators: {
    position: 'bottom-right',
  },
};

export default nextConfig;
