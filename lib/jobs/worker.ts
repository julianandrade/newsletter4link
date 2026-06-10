import { QueueJob } from "@prisma/client";
import { claimNextJob, succeedJob, failJob } from "./queue";
import { reportError } from "@/lib/observability/report";

export interface WorkerRunResult {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  timedOut: boolean;
}

// Reserve headroom for one more job plus bookkeeping before the hard limit
const PER_JOB_HEADROOM_MS = 60 * 1000;

/**
 * Dependencies the worker loop needs. Injectable so the loop logic can be
 * tested without a database.
 */
export interface WorkerDeps {
  claim: () => Promise<QueueJob | null>;
  process: (job: QueueJob) => Promise<Record<string, unknown>>;
  succeed: (jobId: string, result: Record<string, unknown>) => Promise<void>;
  fail: (jobId: string, error: unknown) => Promise<{ willRetry: boolean }>;
  onTerminalFailure?: (job: QueueJob, error: unknown) => void;
  now?: () => number;
}

/**
 * Core loop: claim and run jobs one at a time until the queue is empty or the
 * time budget is nearly spent. Pure with respect to its injected deps.
 */
export async function runWorkerWith(
  deps: WorkerDeps,
  budgetMs: number
): Promise<WorkerRunResult> {
  const now = deps.now ?? Date.now;
  const deadline = now() + budgetMs;
  const result: WorkerRunResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    timedOut: false,
  };

  while (now() < deadline - PER_JOB_HEADROOM_MS) {
    const job = await deps.claim();
    if (!job) break; // queue drained

    result.processed++;

    try {
      const handlerResult = await deps.process(job);
      await deps.succeed(job.id, handlerResult);
      result.succeeded++;
    } catch (error) {
      const { willRetry } = await deps.fail(job.id, error);
      if (willRetry) {
        result.retried++;
      } else {
        result.failed++;
        deps.onTerminalFailure?.(job, error);
      }
    }
  }

  if (now() >= deadline - PER_JOB_HEADROOM_MS) {
    result.timedOut = true;
  }

  return result;
}

/**
 * Drain the queue until it is empty or the time budget is nearly spent.
 *
 * Designed to be invoked by a frequent cron tick: each invocation claims and
 * runs jobs within `budgetMs`, leaving headroom below the serverless
 * `maxDuration`. Work that doesn't fit is left PENDING for the next tick, so a
 * long backlog drains across invocations without any single request risking a
 * timeout.
 */
export async function runWorker(budgetMs: number): Promise<WorkerRunResult> {
  // Lazy-load handlers so the heavy curation/AI module graph is only pulled
  // in when the worker actually runs (keeps the loop unit-testable in isolation)
  const { runJobHandler } = await import("./handlers");
  return runWorkerWith(
    {
      claim: () => claimNextJob(),
      process: runJobHandler,
      succeed: succeedJob,
      fail: failJob,
      // Only page on terminal failure, not on each retryable attempt
      onTerminalFailure: (job, error) =>
        reportError(error, {
          worker: "queue",
          jobId: job.id,
          jobType: job.type,
          organizationId: job.organizationId,
        }),
    },
    budgetMs
  );
}
