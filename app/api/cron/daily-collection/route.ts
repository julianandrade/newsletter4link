import { NextResponse } from "next/server";
import { runCurationPipeline } from "@/lib/curation/curator";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/cron/daily-collection
 * Triggered by Vercel Cron every 6 hours
 * Runs the content curation pipeline
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret (optional but recommended)
    const authHeader = request.headers.get("authorization");
    if (config.cron.secret) {
      if (authHeader !== `Bearer ${config.cron.secret}`) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    console.log("[CRON] Starting daily content collection...");

    const result = await runCurationPipeline();

    console.log("[CRON] Daily content collection complete");
    console.log(`[CRON] Results: ${result.curated} curated, ${result.duplicates} duplicates, ${result.lowScore} low score`);

    return NextResponse.json({
      success: true,
      message: "Daily content collection completed",
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] Daily collection failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
