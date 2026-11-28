import { request, type FullConfig } from "@playwright/test";

export default async function verifyPreviewAccess(config: FullConfig) {
  const context = await request.newContext({ baseURL: config.projects[0].use.baseURL });
  try {
    const response = await context.get("/api/health", { maxRedirects: 0 });
    if (!response.ok() || !response.headers()["content-type"]?.includes("application/json")) {
      throw new Error("Preview health JSON is unavailable. Check Vercel Deployment Protection access before running browser acceptance.");
    }
    const health = await response.json();
    if (health.dataMode !== "fixture" || health.revision !== process.env.PREVIEW_REVISION) {
      throw new Error("Preview must serve fixture data from PREVIEW_REVISION; refusing browser activity against a live or stale deployment.");
    }
  } finally { await context.dispose(); }
}
