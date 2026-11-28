import type { NextConfig } from "next";

if (process.env.VERCEL_ENV === "production" && process.env.FACTORY_FIXTURES === "1") {
  throw new Error("FACTORY_FIXTURES cannot be enabled for a production deployment");
}

const nextConfig: NextConfig = {
  // Keep local fixture builds separate from the normal production build.
  distDir: process.env.FACTORY_FIXTURES === "1" ? ".next-fixtures" : ".next",
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
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        pathname: '/vi/**',
      },
      {
        protocol: 'https',
        hostname: 'is1-ssl.mzstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'statics.tver.jp',
      },
      {
        protocol: 'https',
        hostname: 'radiko.jp',
      },
      {
        protocol: 'https',
        hostname: 'program-static.cf.radiko.jp',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'image-cdn-ak.spotifycdn.com',
      },
      {
        protocol: 'https',
        hostname: 'i1.sndcdn.com',
      },
    ],
  },
};

export default nextConfig;
