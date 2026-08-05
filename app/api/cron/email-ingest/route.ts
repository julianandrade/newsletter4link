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
 * Once a day, at 05:30, ahead of the 06:00 radar and the 09:00 collection so a newsletter's
 * articles are in place before anything reads them.
 *
 * It was `15 * /4 * * *` (every four hours) until 5 August 2026, and that value silently
 * broke every deployment from the commit that introduced it onwards. This project's Vercel
 * plan rejects a sub-daily cron schedule, and it rejects it at *build* time: the three daily
 * jobs deployed fine, adding a fourth on a four-hourly schedule failed the build, so the
 * route this comment sits in was never deployed at all and the job had never once run.
 * Nothing in the application logs said so, because the application was never reached.
 *
 * Daily costs little here. Newsletters are not latency sensitive: a digest that arrives at
 * 07:00 and is read the next morning loses nothing. If the plan is ever upgraded, a shorter
 * schedule is a one-line change in `vercel.json`, and a burst of arrivals spread over
 * several runs fights the article cap less than one run does.
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
