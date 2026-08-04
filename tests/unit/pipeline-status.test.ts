import { describe, expect, it } from "vitest";
import {
  decideRunNeeded,
  readPipelineStatus,
  STALE_AFTER_HOURS,
} from "@/lib/radar/pipeline";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const hoursAgo = (hours: number) =>
  new Date(NOW.getTime() - hours * 60 * 60 * 1000);

describe("decideRunNeeded", () => {
  it("needs a run when the collector has never run", () => {
    expect(decideRunNeeded({ lastRun: null, running: false, now: NOW })).toEqual({
      needed: true,
      reason: "never-run",
    });
  });

  it("needs no run while one is in flight", () => {
    expect(decideRunNeeded({ lastRun: null, running: true, now: NOW })).toEqual({
      needed: false,
      reason: "running",
    });
  });

  it("puts a run in flight ahead of every other reason", () => {
    // Otherwise "needed" while one is already going queues a second run.
    const stale = { status: "COMPLETED" as const, completedAt: hoursAgo(200) };
    expect(
      decideRunNeeded({ lastRun: stale, running: true, now: NOW }).reason
    ).toBe("running");

    const failed = { status: "FAILED" as const, completedAt: hoursAgo(1) };
    expect(
      decideRunNeeded({ lastRun: failed, running: true, now: NOW }).reason
    ).toBe("running");
  });

  it("says a failure is a failure rather than reporting it as current", () => {
    // AC-5.6: a failed run an hour ago is recent, and reporting "current" would
    // hide the failure behind a reassuring word.
    expect(
      decideRunNeeded({
        lastRun: { status: "FAILED", completedAt: hoursAgo(1) },
        running: false,
        now: NOW,
      })
    ).toEqual({ needed: true, reason: "last-run-failed" });
  });

  it("treats a cancelled run as leaving nothing behind", () => {
    expect(
      decideRunNeeded({
        lastRun: { status: "CANCELLED", completedAt: hoursAgo(1) },
        running: false,
        now: NOW,
      })
    ).toEqual({ needed: true, reason: "stale" });
  });

  it("is current inside the window", () => {
    for (const hours of [0, 1, 12, STALE_AFTER_HOURS - 0.01]) {
      expect(
        decideRunNeeded({
          lastRun: { status: "COMPLETED", completedAt: hoursAgo(hours) },
          running: false,
          now: NOW,
        })
      ).toEqual({ needed: false, reason: "current" });
    }
  });

  it("is stale past the window", () => {
    expect(
      decideRunNeeded({
        lastRun: { status: "COMPLETED", completedAt: hoursAgo(25) },
        running: false,
        now: NOW,
      })
    ).toEqual({ needed: true, reason: "stale" });
  });

  it("holds the boundary exactly, so a run at the limit is still current", () => {
    expect(
      decideRunNeeded({
        lastRun: { status: "COMPLETED", completedAt: hoursAgo(STALE_AFTER_HOURS) },
        running: false,
        now: NOW,
      }).reason
    ).toBe("current");
  });

  it("cannot age a completed run with no completion time", () => {
    expect(
      decideRunNeeded({
        lastRun: { status: "COMPLETED", completedAt: null },
        running: false,
        now: NOW,
      })
    ).toEqual({ needed: true, reason: "stale" });
  });

  it("does not treat a clock skew into the future as stale", () => {
    expect(
      decideRunNeeded({
        lastRun: { status: "COMPLETED", completedAt: hoursAgo(-2) },
        running: false,
        now: NOW,
      }).reason
    ).toBe("current");
  });
});

function fakeDb(rows: { running?: any; finished?: any }) {
  const queries: any[] = [];

  return {
    queries,
    db: {
      curationJob: {
        findFirst: async (args: any) => {
          queries.push(args);
          const wantsRunning = args?.where?.status === "RUNNING";
          return wantsRunning ? (rows.running ?? null) : (rows.finished ?? null);
        },
      },
    } as any,
  };
}

const job = (over: Record<string, unknown> = {}) => ({
  id: "j1",
  status: "COMPLETED",
  startedAt: hoursAgo(2),
  completedAt: hoursAgo(1),
  totalFound: 120,
  processed: 120,
  curated: 14,
  duplicates: 31,
  lowScore: 62,
  errorsCount: 0,
  ...over,
});

describe("readPipelineStatus", () => {
  it("reports the last finished run and that none is needed", async () => {
    const { db } = fakeDb({ finished: job() });

    const status = await readPipelineStatus(db, NOW);

    expect(status.running).toBe(false);
    expect(status.current).toBeNull();
    expect(status.total).toBeNull();
    expect(status.runNeeded).toBe(false);
    expect(status.runReason).toBe("current");
    expect(status.lastRun).toEqual({
      status: "COMPLETED",
      startedAt: hoursAgo(2).toISOString(),
      completedAt: hoursAgo(1).toISOString(),
      totalFound: 120,
      curated: 14,
      duplicates: 31,
      lowScore: 62,
      errorsCount: 0,
    });
  });

  it("reports progress from a run in flight", async () => {
    const { db } = fakeDb({
      running: job({ status: "RUNNING", processed: 45, totalFound: 90, completedAt: null }),
      finished: job(),
    });

    const status = await readPipelineStatus(db, NOW);

    expect(status.running).toBe(true);
    expect(status.current).toBe(45);
    expect(status.total).toBe(90);
    expect(status.runReason).toBe("running");
    // The previous outcome is still reported, so the band can show both.
    expect(status.lastRun?.status).toBe("COMPLETED");
  });

  it("returns a null total while the collector is still counting feeds", async () => {
    const { db } = fakeDb({
      running: job({ status: "RUNNING", processed: 0, totalFound: 0, completedAt: null }),
    });

    const status = await readPipelineStatus(db, NOW);

    // Zero would render as a finished progress bar.
    expect(status.total).toBeNull();
    expect(status.current).toBe(0);
  });

  it("says never-run when the organization has no jobs at all", async () => {
    const { db } = fakeDb({});

    const status = await readPipelineStatus(db, NOW);

    expect(status).toEqual({
      running: false,
      current: null,
      total: null,
      lastRun: null,
      runNeeded: true,
      runReason: "never-run",
    });
  });

  it("carries a failed run through with its counts", async () => {
    const { db } = fakeDb({
      finished: job({ status: "FAILED", errorsCount: 7, curated: 0 }),
    });

    const status = await readPipelineStatus(db, NOW);

    expect(status.runReason).toBe("last-run-failed");
    expect(status.runNeeded).toBe(true);
    expect(status.lastRun?.errorsCount).toBe(7);
  });

  it("asks only for finished states in the second read, never for RUNNING", async () => {
    const { db, queries } = fakeDb({});

    await readPipelineStatus(db, NOW);

    // A single "latest job" read would report a run in flight as the last run and
    // show its empty counts as the week's result.
    expect(queries).toHaveLength(2);
    expect(queries[0].where).toEqual({ status: "RUNNING" });
    expect(queries[1].where).toEqual({
      status: { in: ["COMPLETED", "FAILED", "CANCELLED"] },
    });
    // Newest first on both, or "last run" is whichever row the database felt like.
    for (const query of queries) {
      expect(query.orderBy).toEqual({ startedAt: "desc" });
    }
  });
});
