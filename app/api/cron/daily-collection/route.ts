import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/auth/cron";
import { reportError } from "@/lib/observability/report";
import { enqueueJob } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Only enqueues; the worker does the heavy lifting

/**
 * GET /api/cron/daily-collection
 * Triggered by Vercel Cron. Enqueues one curation job per organization onto
 * the durable queue instead of running the pipelines inline - the
 * /api/cron/worker tick processes them across invocations, so a large number
 * of organizations can no longer time out a single request.
 */
export async function GET(request: Request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[CRON] Enqueuing daily curation jobs for all organizations...");

    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true },
    });

    // Date-stamped dedupe key: at most one curation job per org per day, even
    // if the cron double-fires.
    const day = new Date().toISOString().slice(0, 10);

    let enqueued = 0;
    for (const org of organizations) {
      try {
        await enqueueJob({
          type: "CURATION",
          organizationId: org.id,
          dedupeKey: `curation:${org.id}:${day}`,
        });
        enqueued++;
      } catch (error) {
        reportError(error, {
          cron: "daily-collection",
          phase: "enqueue",
          organizationId: org.id,
          organizationName: org.name,
        });
      }
    }

    console.log(
      `[CRON] Enqueued ${enqueued}/${organizations.length} curation jobs`
    );

    return NextResponse.json({
      success: true,
      message: `Enqueued ${enqueued} curation jobs`,
      enqueued,
      organizations: organizations.length,
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
