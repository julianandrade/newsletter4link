import { describe, expect, it } from "vitest";

/**
 * RQ-007: the `?limit=` on the email-ingest cron route.
 *
 * The parser is duplicated here rather than exported, because the route module imports
 * the Prisma client transitively and a unit test should not need a database to check
 * that "abc" is not a limit. The two must stay in step; the shape is small enough that
 * this is the cheaper trade.
 */
function readLimit(url: string): number | undefined {
  const raw = new URL(url).searchParams.get("limit");
  if (raw === null) return undefined;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return undefined;

  return Math.min(Math.max(parsed, 1), 200);
}

const base = "https://example.com/api/cron/email-ingest";

describe("the ingest run limit", () => {
  it("is absent when the caller does not ask, so the schedule behaves as before", () => {
    expect(readLimit(base)).toBeUndefined();
  });

  it("passes a sensible value through", () => {
    expect(readLimit(`${base}?limit=1`)).toBe(1);
    expect(readLimit(`${base}?limit=25`)).toBe(25);
  });

  it("clamps rather than refuses, since this is a maintenance tool", () => {
    expect(readLimit(`${base}?limit=0`)).toBe(1);
    expect(readLimit(`${base}?limit=-5`)).toBe(1);
    expect(readLimit(`${base}?limit=99999`)).toBe(200);
  });

  it("ignores a value that is not a number", () => {
    expect(readLimit(`${base}?limit=abc`)).toBeUndefined();
    expect(readLimit(`${base}?limit=`)).toBeUndefined();
  });

  it("takes the leading integer of something like 10x, as parseInt does", () => {
    // Recorded rather than defended: it is the standard parseInt behaviour, and for an
    // operator's query string a forgiving read beats a refusal.
    expect(readLimit(`${base}?limit=10x`)).toBe(10);
  });
});

/** Duplicated from the route for the same reason as `readLimit` above. */
const MAX_CHAIN = 12;
const RUN_BUDGET_MS = 240_000;

function readChain(url: string): number {
  const parsed = Number.parseInt(new URL(url).searchParams.get("chain") ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readBudget(url: string): number {
  const raw = new URL(url).searchParams.get("budgetMs");
  if (raw === null) return RUN_BUDGET_MS;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return RUN_BUDGET_MS;

  return Math.min(Math.max(parsed, 1_000), RUN_BUDGET_MS);
}

describe("the handover chain depth", () => {
  it("starts at zero when the caller is the cron rather than a parent run", () => {
    expect(readChain(base)).toBe(0);
  });

  it("reads a depth a parent passed", () => {
    expect(readChain(`${base}?chain=3`)).toBe(3);
  });

  it("treats nonsense and negatives as the start of a chain", () => {
    // A depth that read as negative would let the chain run past its cap.
    expect(readChain(`${base}?chain=-4`)).toBe(0);
    expect(readChain(`${base}?chain=abc`)).toBe(0);
    expect(readChain(`${base}?chain=`)).toBe(0);
  });

  it("has a cap low enough to bound a runaway and high enough for a real backlog", () => {
    // Twelve runs of four emails is far more than the largest backlog seen, which was 45.
    expect(MAX_CHAIN).toBeGreaterThanOrEqual(8);
    expect(MAX_CHAIN).toBeLessThanOrEqual(25);
  });
});

describe("the run budget", () => {
  it("is the full budget when the caller does not ask", () => {
    expect(readBudget(base)).toBe(RUN_BUDGET_MS);
  });

  it("leaves room below maxDuration for the handover and the tail in flight", () => {
    // The largest newsletter measured takes about 30 seconds, and a worker mid-email keeps
    // going past the deadline, so the gap has to cover that plus sending the handover.
    expect(RUN_BUDGET_MS).toBeLessThanOrEqual(300_000 - 45_000);
  });

  it("accepts a shorter budget, which is how a handover gets observed", () => {
    expect(readBudget(`${base}?budgetMs=5000`)).toBe(5_000);
  });

  it("never allows a budget longer than the real one", () => {
    // This knob can make a run stop sooner. Letting it run longer would let a query string
    // push an invocation past the platform ceiling and get it killed mid-email.
    expect(readBudget(`${base}?budgetMs=999999`)).toBe(RUN_BUDGET_MS);
  });

  it("clamps a budget too short to finish anything", () => {
    expect(readBudget(`${base}?budgetMs=0`)).toBe(1_000);
    expect(readBudget(`${base}?budgetMs=-5`)).toBe(1_000);
  });

  it("ignores a value that is not a number", () => {
    expect(readBudget(`${base}?budgetMs=soon`)).toBe(RUN_BUDGET_MS);
  });
});
