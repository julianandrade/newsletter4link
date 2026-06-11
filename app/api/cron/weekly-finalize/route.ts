import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getWeekNumber } from "@/lib/dates";
import { autoFinalizeWeeklyEdition } from "@/lib/editions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/weekly-finalize
 * Triggered Monday end-of-day (see vercel.json) — the editor's deadline.
 *
 * Promotes each org's weekly edition to FINALIZED so Tuesday morning's send
 * goes out: hand-curated drafts are finalized as-is; otherwise the edition is
 * built from fresh approved articles. Orgs with nothing approved are skipped.
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret (fail closed: reject if unset or mismatched)
    const authHeader = request.headers.get("authorization");
    if (!config.cron.secret || authHeader !== `Bearer ${config.cron.secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const week = getWeekNumber(now);
    const year = now.getFullYear();

    logger.info("[CRON] Weekly finalize starting", { week, year });

    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true },
    });

    const results: Array<{
      organizationId: string;
      organizationName: string;
      action: string;
      detail?: string;
    }> = [];

    for (const org of organizations) {
      try {
        const result = await autoFinalizeWeeklyEdition(org.id, week, year);
        results.push({
          organizationId: org.id,
          organizationName: org.name,
          action: result.action,
          detail:
            result.action === "finalized"
              ? `${result.articles} articles, ${result.projects} projects`
              : result.reason,
        });
        logger.info(`[CRON] Weekly finalize for ${org.name}`, { ...result });
      } catch (error) {
        logger.error(`[CRON] Weekly finalize failed for ${org.name}`, error);
        results.push({
          organizationId: org.id,
          organizationName: org.name,
          action: "error",
          detail: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Weekly finalize completed",
      data: { week, year, results },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("[CRON] Weekly finalize failed", error);

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
