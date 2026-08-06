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
