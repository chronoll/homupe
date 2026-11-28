import { defineConfig } from "@playwright/test";

const port = Number(process.env.FACTORY_PORT || "3100");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid FACTORY_PORT");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "factory.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce",
    screenshot: "only-on-failure", trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "npm run start:fixtures",
    url: `http://127.0.0.1:${port}/api/notion/blog`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { FACTORY_PORT: String(port) },
  },
});
