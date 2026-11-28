import type { Metadata } from "next";
import "./globals.css";
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import NavigationProgress from "@/components/NavigationProgress";
import { isFactoryFixtureMode } from "@/lib/factory-fixtures";

export const metadata: Metadata = {
  title: "☆ ようこそ！私のホームページへ ☆",
  description: "90年代風レトロなホームページです♪",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fixtureMode = isFactoryFixtureMode();
  return (
    <html lang="ja" data-mantine-color-scheme="light">
      <head>
        {!fixtureMode && (
          // App Router's root layout shares this stylesheet across every page.
          // eslint-disable-next-line @next/next/no-page-custom-font
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&family=Courier+Prime:wght@400;700&family=Noto+Sans+JP:wght@400;700&display=swap"
          />
        )}
      </head>
      <body>
        <MantineProvider defaultColorScheme="light">{children}</MantineProvider>
        <NavigationProgress />
        {!fixtureMode && <Analytics />}
        {!fixtureMode && <SpeedInsights />}
      </body>
    </html>
  );
}
