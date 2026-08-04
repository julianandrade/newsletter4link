import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/auth/cron";
import { collectDay, findMissingDays } from "@/lib/radar/collect";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/cron/radar-collect
 *
 * RQ-004 phase A: one day's counts for every watched entity, once a day.
 *
 * Runs at 06:00 UTC and collects **yesterday**, because a day counted while it is
 * still running records a partial figure that later reads as a quiet day, and
 * forward-only collection means there is no archive to correct it from.
 *
 * Collection is idempotent: the unique key is (entity, source, day), so a second
 * invocation updates rather than duplicates, and pairs already collected are skipped
 * without a request. That matters because the original plan's key included a
 * nullable column, which in Postgres does not prevent duplicates at all.
 *
 * Guarded like every scheduled route: no CRON_SECRET configured means 503 and no
 * work, rather than an open endpoint that spends someone else's rate limit.
 */
export async function GET(request: Request) {
  try {
    const auth = authorizeCron(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const url = new URL(request.url);
    const only = url.searchParams.get("source");

    if (only !== null && only !== "HN" && only !== "ARXIV") {
      return NextResponse.json(
        { error: "source must be HN or ARXIV when given" },
        { status: 400 }
      );
    }

    const result = await collectDay({ only: only ?? undefined });

    // Reported rather than repaired. A day nobody collected cannot be recovered, so
    // the useful thing is to say so while it can still be explained.
    const missing = await findMissingDays(14);

    if (result.gaps > 0) {
      console.warn(
        `[RADAR] ${result.gaps} of ${result.requested} counts failed for ${result.date}`
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
      recentIncompleteDays: missing,
    });
  } catch (error) {
    console.error("Error collecting radar signals:", error);

    return NextResponse.json(
      { success: false, error: "Radar collection failed" },
      { status: 500 }
    );
  }
}
