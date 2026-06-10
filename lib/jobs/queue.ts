import { prisma } from "@/lib/db";
import { QueueJob, QueueJobType } from "@prisma/client";

/**
 * Postgres-backed durable job queue.
 *
 * Jobs are claimed atomically with `FOR UPDATE SKIP LOCKED`, so multiple
 * concurrent workers never grab the same row. A claimed job is locked via a
 * visibility timeout (`lockedUntil`); if the worker dies or times out, the
 * job becomes reclaimable once the lock expires. Failures are retried with
 * exponential backoff up to `maxAttempts`.
 */

// Visibility timeout: how long a claimed job stays locked before another
// worker may reclaim it. Should exceed the longest expected job runtime.
const DEFAULT_LOCK_MS = 5 * 60 * 1000;

// Backoff for retries
const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;

/**
 * Exponential backoff for the Nth attempt (1-based), capped at MAX_BACKOFF_MS.
 */
export function computeBackoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
}

export interface EnqueueOptions {
  type: QueueJobType;
  organizationId?: string | null;
  payload?: Record<string, unknown>;
  /**
   * If set, enqueue is a no-op when an active (PENDING/RUNNING) job with the
   * same key already exists - the existing job is returned instead.
   */
  dedupeKey?: string;
  maxAttempts?: number;
  /** Delay before the job first becomes available. */
  availableAt?: Date;
}

/**
 * Add a job to the queue. Idempotent when a dedupeKey is supplied.
 */
export async function enqueueJob(options: EnqueueOptions): Promise<QueueJob> {
  const {
    type,
    organizationId = null,
    payload = {},
    dedupeKey,
    maxAttempts = 3,
    availableAt,
  } = options;

  if (dedupeKey) {
    const existing = await prisma.queueJob.findFirst({
      where: {
        dedupeKey,
        status: { in: ["PENDING", "RUNNING"] },
      },
    });
    if (existing) return existing;
  }

  return prisma.queueJob.create({
    data: {
      type,
      organizationId,
      payload: payload as object,
      dedupeKey,
      maxAttempts,
      ...(availableAt ? { availableAt } : {}),
    },
  });
}

/**
 * Atomically claim the next runnable job, or null if none are ready.
 * Marks it RUNNING and extends its lock by `lockMs`.
 */
export async function claimNextJob(
  lockMs: number = DEFAULT_LOCK_MS
): Promise<QueueJob | null> {
  // Use parameterized timestamps (not SQL now()) so comparisons are
  // unambiguous against the timestamp-without-tz columns Prisma generates.
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + lockMs);

  // Single-statement atomic claim. A job is runnable if it is PENDING and due,
  // or RUNNING with an expired lock (its previous worker died).
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "QueueJob"
    SET status = 'RUNNING',
        "lockedUntil" = ${lockedUntil},
        "startedAt" = COALESCE("startedAt", ${now}),
        attempts = attempts + 1,
        "updatedAt" = ${now}
    WHERE id = (
      SELECT id FROM "QueueJob"
      WHERE (status = 'PENDING' AND "availableAt" <= ${now})
         OR (status = 'RUNNING' AND "lockedUntil" < ${now})
      ORDER BY "availableAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id;
  `;

  if (rows.length === 0) return null;

  // Re-read through Prisma for a fully-typed, deserialized row
  return prisma.queueJob.findUnique({ where: { id: rows[0].id } });
}

/**
 * Mark a claimed job as succeeded.
 */
export async function succeedJob(
  jobId: string,
  result?: Record<string, unknown>
): Promise<void> {
  await prisma.queueJob.update({
    where: { id: jobId },
    data: {
      status: "SUCCEEDED",
      result: (result ?? {}) as object,
      lastError: null,
      lockedUntil: null,
      completedAt: new Date(),
    },
  });
}

/**
 * Mark a claimed job as failed. Retries with exponential backoff until
 * `maxAttempts` is reached, then marks it permanently FAILED.
 * Returns whether the job will be retried.
 */
export async function failJob(
  jobId: string,
  error: unknown
): Promise<{ willRetry: boolean }> {
  const job = await prisma.queueJob.findUnique({ where: { id: jobId } });
  if (!job) return { willRetry: false };

  const message = error instanceof Error ? error.message : String(error);
  const willRetry = job.attempts < job.maxAttempts;

  if (willRetry) {
    const backoff = computeBackoffMs(job.attempts);
    await prisma.queueJob.update({
      where: { id: jobId },
      data: {
        status: "PENDING",
        lastError: message,
        lockedUntil: null,
        availableAt: new Date(Date.now() + backoff),
      },
    });
  } else {
    await prisma.queueJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        lastError: message,
        lockedUntil: null,
        completedAt: new Date(),
      },
    });
  }

  return { willRetry };
}

/**
 * Queue depth snapshot for observability.
 */
export async function getQueueStats(): Promise<Record<string, number>> {
  const grouped = await prisma.queueJob.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  return Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
}

/**
 * Delete terminal (SUCCEEDED/FAILED) jobs older than `days`.
 */
export async function purgeOldJobs(days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { count } = await prisma.queueJob.deleteMany({
    where: {
      status: { in: ["SUCCEEDED", "FAILED"] },
      completedAt: { lt: cutoff },
    },
  });
  return count;
}
