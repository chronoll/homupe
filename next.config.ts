import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler: 自動メモ化で再レンダリングを削減
  reactCompiler: true,

  // 画像最適化: Amazon等の外部画像を最適化
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images-na.ssl-images-amazon.com',
        pathname: '/images/**',
      },
      {
        protocol: 'https',
        hostname: 'prod-files-secure.s3.us-west-2.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
