import type { Metadata } from "next";
import "./globals.css";
import '@mantine/core/styles.css';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import AuthSessionProvider from "@/components/AuthSessionProvider";

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
        <AuthSessionProvider>
          <MantineProvider defaultColorScheme="light">{children}</MantineProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}