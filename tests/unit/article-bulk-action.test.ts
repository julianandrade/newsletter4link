import { describe, expect, it } from "vitest";
import {
  MAX_BULK_IDS,
  parseBulkRequest,
  writeForAction,
} from "@/lib/articles/bulk-action";

/**
 * RQ-005 specified `reset` and the route was never given it, so every Undo in the product
 * has been answering 400 since the day the toast shipped. Nothing tested this route at all.
 * These are its rules, in the one place they can be asserted without a database.
 */

const ok = (body: unknown) => {
  const parsed = parseBulkRequest(body);
  if ("error" in parsed) throw new Error(`expected a parse, got: ${parsed.error}`);
  return parsed;
};

const err = (body: unknown) => {
  const parsed = parseBulkRequest(body);
  if (!("error" in parsed)) throw new Error("expected a refusal, got a parse");
  return parsed.error;
};

describe("parseBulkRequest", () => {
  it("accepts every action the product can take", () => {
    for (const action of ["approve", "reject", "reset", "discard", "restore"] as const) {
      expect(ok({ action, ids: ["a"] }).action).toBe(action);
    }
  });

  it("names the allowed actions when refusing an unknown one", () => {
    // The message is the whole diagnosis when a client and a route disagree, which is
    // exactly how `reset` went unnoticed.
    expect(err({ action: "archive", ids: ["a"] })).toContain("reset");
    expect(err({ action: "archive", ids: ["a"] })).toContain("discard");
  });

  it("refuses a missing or empty selection", () => {
    expect(err({ action: "approve" })).toContain("non-empty array");
    expect(err({ action: "approve", ids: [] })).toContain("non-empty array");
    expect(err({ action: "approve", ids: "a" })).toContain("non-empty array");
  });

  it("refuses an id that is not a non-empty string", () => {
    expect(err({ action: "approve", ids: ["a", ""] })).toContain("non-empty string");
    expect(err({ action: "approve", ids: ["a", 7] })).toContain("non-empty string");
    expect(err({ action: "approve", ids: ["a", null] })).toContain("non-empty string");
  });

  it("survives a body that is not an object at all", () => {
    expect(err(null)).toBeTruthy();
    expect(err("approve")).toBeTruthy();
    expect(err([])).toBeTruthy();
  });

  it("deduplicates the selection", () => {
    expect(ok({ action: "approve", ids: ["a", "b", "a"] }).ids).toEqual(["a", "b"]);
  });

  it("refuses more than the ceiling, counted after deduplication", () => {
    const ids = Array.from({ length: MAX_BULK_IDS + 1 }, (_, i) => `id-${i}`);

    expect(err({ action: "approve", ids })).toContain(String(MAX_BULK_IDS));
    // The duplicate does not count against the ceiling, because it is one write.
    expect(ok({ action: "approve", ids: [...ids.slice(0, MAX_BULK_IDS), "id-0"] }).ids)
      .toHaveLength(MAX_BULK_IDS);
  });
});

describe("writeForAction", () => {
  const now = new Date("2026-08-07T10:00:00.000Z");

  it("approve and reject only touch what is still awaiting a decision", () => {
    // Without the guard a stale selection flips an article another reviewer has already
    // decided, and the reported count hides it.
    expect(writeForAction("approve", now)).toEqual({
      where: { status: "PENDING_REVIEW" },
      data: { status: "APPROVED" },
    });
    expect(writeForAction("reject", now)).toEqual({
      where: { status: "PENDING_REVIEW" },
      data: { status: "REJECTED" },
    });
  });

  it("reset takes a decided article back to awaiting a decision", () => {
    // The inverse of the two above, so it must match exactly what they can produce and
    // nothing else: resetting an article that was never decided is a no-op, not an error.
    expect(writeForAction("reset", now)).toEqual({
      where: { status: { in: ["APPROVED", "REJECTED"] } },
      data: { status: "PENDING_REVIEW" },
    });
  });

  it("discard stamps the time and only touches what is not already discarded", () => {
    expect(writeForAction("discard", now)).toEqual({
      where: { discardedAt: null },
      data: { discardedAt: now },
    });
  });

  it("restore clears it, and leaves the verdict alone", () => {
    // The point of a column rather than a fourth status: an approved article that was
    // discarded comes back approved.
    expect(writeForAction("restore", now)).toEqual({
      where: { discardedAt: { not: null } },
      data: { discardedAt: null },
    });
  });

  it("no action ever writes both a status and a discard", () => {
    for (const action of ["approve", "reject", "reset", "discard", "restore"] as const) {
      const { data } = writeForAction(action, now);
      expect("status" in data && "discardedAt" in data).toBe(false);
    }
  });
});
