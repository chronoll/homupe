import { defineConfig } from "@playwright/test";
import localConfig from "./playwright.config";

const url = new URL(process.env.PREVIEW_BASE_URL || "https://invalid.local");
if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app") || url.username || url.password) {
  throw new Error("PREVIEW_BASE_URL must be the HTTPS URL of a Vercel Preview deployment");
}
if (!/^[a-f0-9]{40}$/.test(process.env.PREVIEW_REVISION || "")) {
  throw new Error("PREVIEW_REVISION must be the expected full commit SHA");
}

export default defineConfig({
  ...localConfig,
  webServer: undefined,
  use: { ...localConfig.use, baseURL: url.origin },
});
