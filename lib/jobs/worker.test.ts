import { describe, it, expect, vi } from "vitest";
import { runWorkerWith, type WorkerDeps } from "./worker";
import type { QueueJob } from "@prisma/client";

function fakeJob(id: string): QueueJob {
  return {
    id,
    type: "CURATION",
    status: "RUNNING",
    payload: {},
    result: null,
    lastError: null,
    attempts: 1,
    maxAttempts: 3,
    availableAt: new Date(),
    lockedUntil: new Date(),
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    dedupeKey: null,
    organizationId: "org_1",
  };
}

/** Build deps that hand out the given jobs once, then null (drained). */
function depsForJobs(
  jobs: QueueJob[],
  overrides: Partial<WorkerDeps> = {}
): WorkerDeps {
  const queue = [...jobs];
  return {
    claim: vi.fn(async () => queue.shift() ?? null),
    process: vi.fn(async () => ({ ok: true })),
    succeed: vi.fn(async () => {}),
    fail: vi.fn(async () => ({ willRetry: false })),
    now: () => 0, // fixed time: always within budget
    ...overrides,
  };
}

describe("runWorkerWith", () => {
  it("drains all jobs and reports counts", async () => {
    const deps = depsForJobs([fakeJob("a"), fakeJob("b"), fakeJob("c")]);
    const result = await runWorkerWith(deps, 300_000);

    expect(result.processed).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(deps.succeed).toHaveBeenCalledTimes(3);
  });

  it("stops when the queue is empty", async () => {
    const deps = depsForJobs([]);
    const result = await runWorkerWith(deps, 300_000);
    expect(result.processed).toBe(0);
    expect(deps.claim).toHaveBeenCalledTimes(1);
  });

  it("counts retried jobs separately from terminal failures", async () => {
    const deps = depsForJobs([fakeJob("a"), fakeJob("b")], {
      process: vi.fn(async () => {
        throw new Error("boom");
      }),
      fail: vi
        .fn()
        .mockResolvedValueOnce({ willRetry: true })
        .mockResolvedValueOnce({ willRetry: false }),
    });

    const result = await runWorkerWith(deps, 300_000);

    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(0);
    expect(result.retried).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("invokes onTerminalFailure only for non-retryable failures", async () => {
    const onTerminalFailure = vi.fn();
    const deps = depsForJobs([fakeJob("a")], {
      process: vi.fn(async () => {
        throw new Error("boom");
      }),
      fail: vi.fn(async () => ({ willRetry: false })),
      onTerminalFailure,
    });

    await runWorkerWith(deps, 300_000);
    expect(onTerminalFailure).toHaveBeenCalledTimes(1);
  });

  it("stops claiming once the time budget (minus headroom) is exceeded", async () => {
    // Clock jumps past the budget after the first tick check
    let t = 0;
    const deps = depsForJobs([fakeJob("a"), fakeJob("b")], {
      now: () => {
        const current = t;
        t += 200_000; // advance 200s each call
        return current;
      },
    });

    // Budget 240s, headroom 60s -> effective deadline 180s. Second loop check
    // (t=200s) exceeds it, so at most one job is processed.
    const result = await runWorkerWith(deps, 240_000);
    expect(result.processed).toBeLessThanOrEqual(1);
    expect(result.timedOut).toBe(true);
  });
});
