import { NextResponse } from "next/server";
import { isFactoryFixtureMode } from "@/lib/factory-fixtures";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    dataMode: isFactoryFixtureMode() ? "fixture" : "live",
    revision: process.env.VERCEL_GIT_COMMIT_SHA || "local",
  }, { headers: { "Cache-Control": "no-store" } });
}
