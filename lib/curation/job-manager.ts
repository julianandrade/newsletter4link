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
 */
export async function getCurrentJob() {
  return await prisma.curationJob.findFirst({
    where: { status: "RUNNING" },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Get recent jobs (paginated)
 */
export async function getJobs(options: { page?: number; limit?: number; status?: CurationJobStatus } = {}) {
  const { page = 1, limit = 10, status } = options;
  const skip = (page - 1) * limit;

  const where = status ? { status } : {};

  const [jobs, total] = await Promise.all([
    prisma.curationJob.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.curationJob.count({ where }),
  ]);

  return {
    jobs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
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
