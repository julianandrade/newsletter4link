import { NextResponse, after } from "next/server";
import { authorizeCron } from "@/lib/auth/cron";
import { config } from "@/lib/config";
import { handoverAccepted, selfOrigin } from "@/lib/inbound/handover";
import { runEmailIngestion, type IngestResult } from "@/lib/inbound/process";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * Chained invocations allowed from one cron firing.
 *
 * A backstop against a runaway rather than a throughput setting. Twelve runs of four
 * emails each is far more than a real backlog, and if the chain ever reaches this the
 * answer is that the budget is too small for the work, not that the cap is wrong.
 */
const MAX_CHAIN = 12;

/**
 * Wall clock a run may use before it stops and hands over.
 *
 * Sixty seconds below `maxDuration`, which is the room the handover itself needs plus the
 * tail of whatever was already in flight when the budget ran out: a worker mid-email keeps
 * going, and the largest newsletter measured takes about thirty seconds.
 */
const RUN_BUDGET_MS = 240_000;

/** How deep in a handover chain this invocation is. */
function readChain(request: Request): number {
  const parsed = Number.parseInt(
    new URL(request.url).searchParams.get("chain") ?? "0",
    10
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * `?budgetMs=` — shorten the budget so a handover can be observed without waiting four
 * minutes for one.
 *
 * The same argument as `?limit=`: the chain is the one part of this job that no test can
 * exercise, because `tsc`, the suites and `next build` all pass without a single chained
 * invocation ever running. A knob that forces the behaviour in seconds is the difference
 * between verifying it and hoping.
 *
 * Clamped, and never above the real budget: this can make a run stop sooner, never later.
 */
function readBudget(request: Request): number {
  const raw = new URL(request.url).searchParams.get("budgetMs");
  if (raw === null) return RUN_BUDGET_MS;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return RUN_BUDGET_MS;

  return Math.min(Math.max(parsed, 1_000), RUN_BUDGET_MS);
}

/**
 * Hand the remainder to a fresh invocation, if there is a remainder and room in the chain.
 *
 * Inside `after()`, so the request is sent once this invocation has already answered and
 * the caller is not held open for the child. The child is asked with `handover=1`, which
 * makes it answer immediately and do its work in its own `after()`, for the same reason:
 * if it answered only when finished, the parent would wait out the child's whole run and
 * the chain would serialise into one long invocation rather than several short ones.
 *
 * The status is checked, not just the absence of a throw. The first version awaited the
 * fetch inside a try and logged only thrown errors, so the 302 that Vercel's deployment
 * protection answers counted as success: eight emails sat untouched for four minutes and
 * nothing anywhere said why.
 *
 * A lost handover costs a day, not data: tomorrow's cron picks the backlog up. So this
 * logs loudly and gives up rather than retrying into the same wall.
 */
function handOver(result: IngestResult, chain: number): void {
  const origin = selfOrigin(process.env);

  if (!result.moreWork || chain >= MAX_CHAIN || !origin || !config.cron.secret) return;

  after(async () => {
    const target = `${origin}/api/cron/email-ingest?chain=${chain + 1}&handover=1`;

    try {
      const response = await fetch(target, {
        headers: { Authorization: `Bearer ${config.cron.secret}` },
        // A redirect is a refusal here, never something to follow: the only thing that
        // redirects this request is an authentication wall in front of the route.
        redirect: "manual",
      });

      if (!handoverAccepted(response.status)) {
        console.error(
          `[EMAIL INGEST] handover refused with ${response.status} by ${origin}; the backlog waits for the next cron`
        );
      }
    } catch (error) {
      console.error("[EMAIL INGEST] handover could not be sent:", error);
    }
  });
}

/**
 * `?limit=` — how many emails this run may touch. Absent means the job's own default,
 * which is what Vercel's schedule invokes and what the behaviour was before.
 *
 * It exists to make this job safe to test. Every pending email carries a `retryCount`
 * against `maxContentAttempts`, so a run that fails spends an attempt on every email it
 * touches, and three failures mark one `FAILED`. Verifying a change to
 * `RESEND_API_KEY` by running the whole backlog therefore risks the entire backlog to
 * answer one question. With a limit, the same question costs one email.
 *
 * Out of range values are clamped rather than refused: this is an operator's tool, and
 * failing a maintenance run over a typo in a query string helps nobody.
 */
function readLimit(request: Request): number | undefined {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null) return undefined;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return undefined;

  return Math.min(Math.max(parsed, 1), 200);
}

/**
 * One run, its logging, and the handover it may trigger.
 *
 * Shared by the synchronous path and the handover path so the two cannot drift: whatever a
 * manual trigger does, a chained invocation does the same.
 */
async function runAndHandOver(request: Request, chain: number): Promise<IngestResult> {
  const result = await runEmailIngestion({
    limit: readLimit(request),
    deadline: Date.now() + readBudget(request),
  });

  if (result.emailsFailed > 0 || result.contentFailed > 0) {
    console.warn(
      `[EMAIL INGEST] ${result.emailsFailed} email(s) failed, ${result.contentFailed} content fetch(es) failed`
    );
  }

  for (const note of result.notes) {
    console.log(`[EMAIL INGEST] ${note}`);
  }

  if (result.moreWork) {
    console.log(`[EMAIL INGEST] work remains, handing over from chain ${chain}`);
  }

  handOver(result, chain);

  return result;
}

/**
 * GET /api/cron/email-ingest
 *
 * RQ-007 step 2: read the emails the webhook recorded and create the articles they point at.
 *
 * Twice a day. Vercel Cron fires it at 05:30, ahead of the 06:00 radar and the 09:00
 * collection so a newsletter's articles are in place before anything reads them, and
 * .github/workflows/curation.yml fires it again at 17:30.
 *
 * The second firing does not live in `vercel.json`, and cannot. It was `15 * /4 * * *`
 * (every four hours) until 5 August 2026, and that value silently broke every deployment
 * from the commit that introduced it onwards. A Hobby account rejects a sub-daily cron
 * schedule, and it rejects it at *build* time: the three daily jobs deployed fine, adding
 * a fourth on a four-hourly schedule failed the build, so the route this comment sits in
 * was never deployed at all and the job had never once run. Nothing in the application
 * logs said so, because the application was never reached. That is the whole reason a
 * second scheduler exists outside the platform.
 *
 * Two firings a day cost little either way. Newsletters are not latency sensitive: a
 * digest that arrives at 07:00 and is read the next morning loses nothing. The gain is
 * that a burst of arrivals spread over two runs fights the article cap less than one run
 * does, and a backlog no longer waits a full day when a handover chain is lost.
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

    const chain = readChain(request);

    /**
     * A handover answers first and works afterwards.
     *
     * Its parent is inside its own `after()` waiting for this response, and if that wait
     * lasted the whole child run the chain would collapse into one invocation of the same
     * 300 seconds it exists to escape.
     *
     * Deliberately not the default: a manual trigger still runs synchronously and returns
     * the result, which is how every diagnosis in this requirement was made.
     */
    if (new URL(request.url).searchParams.get("handover") === "1") {
      after(async () => {
        await runAndHandOver(request, chain);
      });

      return NextResponse.json({ success: true, accepted: true, chain });
    }

    const result = await runAndHandOver(request, chain);

    return NextResponse.json({ success: true, chain, ...result });
  } catch (error) {
    console.error("Error ingesting inbound email:", error);

    return NextResponse.json(
      { success: false, error: "Email ingestion failed" },
      { status: 500 }
    );
  }
}
