import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'polymarket.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.polymarket.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
