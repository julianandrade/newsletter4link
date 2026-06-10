import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/auth/cron";
import { runWorker } from "@/lib/jobs/worker";
import { getQueueStats } from "@/lib/jobs/queue";
import { reportError } from "@/lib/observability/report";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

// Leave headroom below maxDuration so the worker returns cleanly before
// the platform kills the invocation mid-job.
const BUDGET_MS = 240 * 1000;

/**
 * GET /api/cron/worker
 * Frequent tick that drains the durable job queue. Claims and runs queued
 * jobs (e.g. per-org curation) one at a time within a time budget, leaving
 * any remaining backlog for the next tick.
 */
export async function GET(request: Request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runWorker(BUDGET_MS);

    if (result.processed > 0) {
      console.log(
        `[WORKER] processed=${result.processed} succeeded=${result.succeeded} ` +
          `retried=${result.retried} failed=${result.failed} timedOut=${result.timedOut}`
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
      queue: await getQueueStats(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    reportError(error, { cron: "worker", scope: "top-level" });
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
