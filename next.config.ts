import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 画像最適化: Amazon等の外部画像を最適化
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images-na.ssl-images-amazon.com',
        pathname: '/images/**',
      },
    ],
  },
};

export default nextConfig;
