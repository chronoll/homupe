import type { Metadata } from "next";
import "./globals.css";
import '@mantine/core/styles.css';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import NavigationProgress from "@/components/NavigationProgress";

export const metadata: Metadata = {
  title: "☆ ようこそ！私のホームページへ ☆",
  description: "90年代風レトロなホームページです♪",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" data-mantine-color-scheme="light">
      <head>
      </head>
      <body>
        <MantineProvider defaultColorScheme="light">{children}</MantineProvider>
        <NavigationProgress />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}