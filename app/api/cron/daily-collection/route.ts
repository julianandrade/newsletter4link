import { NextResponse } from "next/server";
import { runCurationPipeline } from "@/lib/curation/curator";
import { prisma } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/auth/cron";
import { reportError } from "@/lib/observability/report";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/cron/daily-collection
 * Triggered by Vercel Cron every 6 hours
 * Runs the content curation pipeline for all organizations
 */
export async function GET(request: Request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[CRON] Starting daily content collection for all organizations...");

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
        console.log(`[CRON] Processing organization: ${org.name}`);
        const result = await runCurationPipeline(org.id);
        results.push({
          organizationId: org.id,
          organizationName: org.name,
          curated: result.curated,
          duplicates: result.duplicates,
          lowScore: result.lowScore,
          errors: result.errors.length,
        });
        console.log(`[CRON] ${org.name}: ${result.curated} curated, ${result.duplicates} duplicates`);
      } catch (error) {
        reportError(error, {
          cron: "daily-collection",
          organizationId: org.id,
          organizationName: org.name,
        });
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

    console.log("[CRON] Daily content collection complete for all organizations");

    return NextResponse.json({
      success: true,
      message: "Daily content collection completed",
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    reportError(error, { cron: "daily-collection", scope: "top-level" });

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
