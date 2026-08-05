import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/auth/cron";
import { runEmailIngestion } from "@/lib/inbound/process";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/cron/email-ingest
 *
 * RQ-007 step 2: read the emails the webhook recorded and create the articles they point at.
 *
 * Every four hours. Newsletters are not latency sensitive: a digest that arrives at 06:00 and
 * is read at 08:00 loses nothing, and a slower cadence means a burst of arrivals is spread
 * over several runs rather than fighting the article cap in one.
 *
 * Separate from the daily RSS collection on purpose. That job is already close to its own
 * time budget with fifteen feeds, and a failure in one should not take the other down.
 */
export async function GET(request: Request) {
  try {
    const auth = authorizeCron(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const result = await runEmailIngestion();

    if (result.emailsFailed > 0 || result.contentFailed > 0) {
      console.warn(
        `[EMAIL INGEST] ${result.emailsFailed} email(s) failed, ${result.contentFailed} content fetch(es) failed`
      );
    }

    for (const note of result.notes) {
      console.log(`[EMAIL INGEST] ${note}`);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error ingesting inbound email:", error);

    return NextResponse.json(
      { success: false, error: "Email ingestion failed" },
      { status: 500 }
    );
  }
}
