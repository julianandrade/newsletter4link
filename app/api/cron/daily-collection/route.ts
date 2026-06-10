import { NextResponse } from "next/server";
import { runCurationPipeline } from "@/lib/curation/curator";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/cron/daily-collection
 * Triggered by Vercel Cron every 6 hours
 * Runs the content curation pipeline for all organizations
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret (fail closed: reject if unset or mismatched)
    const authHeader = request.headers.get("authorization");
    if (!config.cron.secret || authHeader !== `Bearer ${config.cron.secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logger.info("[CRON] Starting daily content collection for all organizations...");

    // Get all organizations
    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true },
    });

    const results: Array<{
      organizationId: string;
      organizationName: string;
      curated: number;
      duplicates: number;
      lowScore: number;
      errors: number;
    }> = [];

    for (const org of organizations) {
      try {
        logger.info(`[CRON] Processing organization: ${org.name}`);
        const result = await runCurationPipeline(org.id);
        results.push({
          organizationId: org.id,
          organizationName: org.name,
          curated: result.curated,
          duplicates: result.duplicates,
          lowScore: result.lowScore,
          errors: result.errors.length,
        });
        logger.info(`[CRON] ${org.name}: ${result.curated} curated, ${result.duplicates} duplicates`);
      } catch (error) {
        logger.error(`[CRON] Error processing ${org.name}:`, error);
        results.push({
          organizationId: org.id,
          organizationName: org.name,
          curated: 0,
          duplicates: 0,
          lowScore: 0,
          errors: 1,
        });
      }
    }

    logger.info("[CRON] Daily content collection complete for all organizations");

    return NextResponse.json({
      success: true,
      message: "Daily content collection completed",
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("[CRON] Daily collection failed", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
