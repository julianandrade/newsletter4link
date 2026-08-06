import { describe, expect, it } from "vitest";
import { CLAIM_LEASE_MS, claimCutoff, shouldStop } from "@/lib/inbound/claim";

/**
 * The claim exists because a run can overlap with a manual trigger. That is not
 * hypothetical: it is how this job was debugged all through the night of 6 August 2026,
 * and the STATUS note tells the next person to trigger it by hand too.
 */
describe("claimCutoff", () => {
  it("is the lease length before now, so an older claim is reclaimable", () => {
    const now = new Date("2026-08-07T10:00:00.000Z");
    expect(claimCutoff(now).toISOString()).toBe("2026-08-07T09:50:00.000Z");
  });

  it("uses a lease long enough to outlast one function invocation", () => {
    // A run is capped at 300 seconds, so a lease shorter than that could be reclaimed
    // while its owner is still working, and the email would be processed twice.
    expect(CLAIM_LEASE_MS).toBeGreaterThan(300_000);
  });
});

describe("shouldStop", () => {
  it("is false with time to spare", () => {
    expect(shouldStop(10_000, 0)).toBe(false);
  });

  it("is true once the deadline has passed", () => {
    expect(shouldStop(10_000, 10_001)).toBe(true);
  });

  it("is true at the deadline exactly, rather than starting one more email", () => {
    expect(shouldStop(10_000, 10_000)).toBe(true);
  });

  it("never stops when there is no deadline, which is the manual case", () => {
    expect(shouldStop(undefined, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});
