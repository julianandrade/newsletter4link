import { prisma } from "@/lib/db";
import { CurationJobStatus } from "@prisma/client";

export interface JobLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Create a new curation job
 */
export async function createJob(organizationId: string) {
  return await prisma.curationJob.create({
    data: {
      status: "RUNNING",
      logs: [],
      organizationId,
    },
  });
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string) {
  return await prisma.curationJob.findUnique({
    where: { id: jobId },
  });
}

/**
 * Get the currently running job (if any)
 * Also marks stale jobs (running > 10 minutes) as failed
 */
export async function getCurrentJob() {
  // First, clean up stale jobs (running for more than 10 minutes)
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

  await prisma.curationJob.updateMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: staleThreshold },
    },
    data: {
      status: "FAILED",
      completedAt: new Date(),
    },
  });

  return await prisma.curationJob.findFirst({
    where: { status: "RUNNING" },
    orderBy: { startedAt: "desc" },
  });
}

/** The columns the curation history table draws. */
export const JOB_SORT_FIELDS = [
  "startedAt",
  "status",
  "durationMs",
  "totalFound",
  "curated",
  "errorsCount",
] as const;

export type JobSortField = (typeof JOB_SORT_FIELDS)[number];

/**
 * Get recent jobs (paginated, filtered and ordered).
 *
 * The date range and the ordering used to be applied in the browser, to whatever ten rows
 * this function had already picked. Two consequences, both visible:
 *
 *  - "Longest first" ordered the ten rows of page one and presented that as the slowest
 *    runs in the history. The actual slowest run was on page four and never surfaced.
 *  - A date range filtered those same ten rows away, so the screen showed three jobs under
 *    a pager that still said "Page 1 of 12", and pressing Next showed nothing at all.
 *
 * Both are the same mistake: a filter or a sort that runs after the page has been cut
 * describes the page, not the list.
 */
export async function getJobs(
  options: {
    page?: number;
    limit?: number;
    status?: CurationJobStatus;
    from?: string | null;
    to?: string | null;
    sortBy?: JobSortField;
    sortOrder?: "asc" | "desc";
  } = {}
) {
  const {
    page = 1,
    limit = 10,
    status,
    from,
    to,
    sortBy = "startedAt",
    sortOrder = "desc",
  } = options;
  const skip = (page - 1) * limit;

  const startedAt: { gte?: Date; lte?: Date } = {};
  if (from) startedAt.gte = new Date(from);
  if (to) {
    // The whole of the named day. Parsing "2026-08-08" gives midnight, so a range ending
    // there excluded every run of the day the reader asked for.
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    startedAt.lte = end;
  }

  const where = {
    ...(status ? { status } : {}),
    ...(startedAt.gte || startedAt.lte ? { startedAt } : {}),
  };

  // `startedAt` second, so runs that finished in the same number of milliseconds, or found
  // the same number of articles, still come back newest first and in a stable order.
  const orderBy =
    sortBy === "startedAt"
      ? [{ startedAt: sortOrder }]
      : [
          sortBy === "durationMs"
            ? { durationMs: { sort: sortOrder, nulls: "last" as const } }
            : { [sortBy]: sortOrder },
          { startedAt: "desc" as const },
        ];

  const [jobs, total] = await Promise.all([
    prisma.curationJob.findMany({
      where,
      orderBy,
      skip,
      take: limit,
    }),
    prisma.curationJob.count({ where }),
  ]);

  return {
    jobs,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Update job stats
 */
export async function updateJobStats(
  jobId: string,
  stats: {
    totalFound?: number;
    processed?: number;
    duplicates?: number;
    lowScore?: number;
    curated?: number;
    errorsCount?: number;
  }
) {
  return await prisma.curationJob.update({
    where: { id: jobId },
    data: stats,
  });
}

/**
 * Add a log entry to a job
 */
export async function addJobLog(
  jobId: string,
  level: JobLogEntry["level"],
  message: string,
  data?: Record<string, unknown>
) {
  const job = await prisma.curationJob.findUnique({
    where: { id: jobId },
    select: { logs: true },
  });

  if (!job) return null;

  const logs = (job.logs as unknown as JobLogEntry[]) || [];
  const newEntry: JobLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  };

  return await prisma.curationJob.update({
    where: { id: jobId },
    data: {
      logs: [...logs, newEntry] as any,
    },
  });
}

/**
 * Complete a job successfully
 */
export async function completeJob(jobId: string) {
  const job = await prisma.curationJob.findUnique({
    where: { id: jobId },
    select: { startedAt: true },
  });

  if (!job) return null;

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - job.startedAt.getTime();

  return await prisma.curationJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      completedAt,
      durationMs,
    },
  });
}

/**
 * Fail a job with error
 */
export async function failJob(jobId: string, errorMessage?: string) {
  const job = await prisma.curationJob.findUnique({
    where: { id: jobId },
    select: { startedAt: true, logs: true },
  });

  if (!job) return null;

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - job.startedAt.getTime();

  const logs = (job.logs as unknown as JobLogEntry[]) || [];
  if (errorMessage) {
    logs.push({
      timestamp: completedAt.toISOString(),
      level: "error",
      message: errorMessage,
    });
  }

  return await prisma.curationJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      completedAt,
      durationMs,
      logs: logs as any,
    },
  });
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string) {
  const job = await prisma.curationJob.findUnique({
    where: { id: jobId },
    select: { startedAt: true, status: true, logs: true },
  });

  if (!job) return null;
  if (job.status !== "RUNNING") return job;

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - job.startedAt.getTime();

  const logs = (job.logs as unknown as JobLogEntry[]) || [];
  logs.push({
    timestamp: completedAt.toISOString(),
    level: "info",
    message: "Job cancelled by user",
  });

  return await prisma.curationJob.update({
    where: { id: jobId },
    data: {
      status: "CANCELLED",
      completedAt,
      durationMs,
      logs: logs as any,
    },
  });
}

/**
 * Check if a job has been cancelled
 */
export async function isJobCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.curationJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  });

  return job?.status === "CANCELLED";
}

/**
 * Delete a job by ID
 * Returns the deleted job or null if not found
 */
export async function deleteJob(jobId: string) {
  try {
    return await prisma.curationJob.delete({
      where: { id: jobId },
    });
  } catch (error) {
    // Job not found
    return null;
  }
}

/**
 * Delete jobs older than specified number of days
 * Returns the count of deleted jobs
 */
export async function deleteJobsOlderThan(days: number) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const result = await prisma.curationJob.deleteMany({
    where: {
      startedAt: {
        lt: cutoffDate,
      },
      // Don't delete currently running jobs
      status: {
        not: "RUNNING",
      },
    },
  });

  return result.count;
}

/**
 * Mark stale running jobs as failed
 * Jobs running longer than the threshold are considered stuck
 * @param minutes - Number of minutes after which a job is considered stale (default: 10)
 * @returns Count of jobs marked as failed
 */
export async function cleanupStaleJobs(minutes: number = 10) {
  const staleThreshold = new Date(Date.now() - minutes * 60 * 1000);

  const result = await prisma.curationJob.updateMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: staleThreshold },
    },
    data: {
      status: "FAILED",
      completedAt: new Date(),
    },
  });

  return result.count;
}
