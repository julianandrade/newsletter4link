import { prisma } from "@/lib/db";
import { JobStatus, JobType, BackgroundJob } from "@prisma/client";

export interface JobLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Create a new background job
 */
export async function createJob(
  organizationId: string,
  type: JobType,
  metadata?: Record<string, unknown>
): Promise<BackgroundJob> {
  return await prisma.backgroundJob.create({
    data: {
      type,
      status: "RUNNING",
      metadata: (metadata ?? {}) as any,
      logs: [],
      organizationId,
    },
  });
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  jobId: string,
  stage: string,
  progress: number,
  message?: string
): Promise<void> {
  // If message provided, also add a log entry
  if (message) {
    const job = await prisma.backgroundJob.findUnique({
      where: { id: jobId },
      select: { logs: true },
    });

    if (job) {
      const logs = (job.logs as unknown as JobLogEntry[]) || [];
      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message,
      });

      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          currentStage: stage,
          progress: Math.min(100, Math.max(0, progress)),
          logs: logs as any,
        },
      });
      return;
    }
  }

  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      currentStage: stage,
      progress: Math.min(100, Math.max(0, progress)),
    },
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
): Promise<void> {
  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
    select: { logs: true },
  });

  if (!job) return;

  const logs = (job.logs as unknown as JobLogEntry[]) || [];
  const newEntry: JobLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  };

  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      logs: [...logs, newEntry] as any,
    },
  });
}

/**
 * Complete a job successfully with result
 */
export async function completeJob(
  jobId: string,
  result: Record<string, unknown>
): Promise<BackgroundJob> {
  return await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      progress: 100,
      result: result as any,
      completedAt: new Date(),
    },
  });
}

/**
 * Fail a job with error message
 */
export async function failJob(
  jobId: string,
  errorMessage: string
): Promise<BackgroundJob> {
  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
    select: { logs: true },
  });

  const logs = (job?.logs as unknown as JobLogEntry[]) || [];
  logs.push({
    timestamp: new Date().toISOString(),
    level: "error",
    message: errorMessage,
  });

  return await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      error: errorMessage,
      completedAt: new Date(),
      logs: logs as any,
    },
  });
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise<BackgroundJob> {
  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
    select: { status: true, logs: true },
  });

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.status !== "RUNNING" && job.status !== "PENDING") {
    throw new Error(`Cannot cancel job with status ${job.status}`);
  }

  const logs = (job.logs as unknown as JobLogEntry[]) || [];
  logs.push({
    timestamp: new Date().toISOString(),
    level: "info",
    message: "Job cancelled by user",
  });

  return await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
      logs: logs as any,
    },
  });
}

/**
 * Check if a job has been cancelled
 */
export async function isJobCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  });

  return job?.status === "CANCELLED";
}

/**
 * Get the currently running job of a specific type for an organization
 */
export async function getRunningJob(
  organizationId: string,
  type: JobType
): Promise<BackgroundJob | null> {
  return await prisma.backgroundJob.findFirst({
    where: {
      organizationId,
      type,
      status: "RUNNING",
    },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string): Promise<BackgroundJob | null> {
  return await prisma.backgroundJob.findUnique({
    where: { id: jobId },
  });
}

/**
 * Get recent jobs for an organization
 */
export async function getJobs(
  organizationId: string,
  options: {
    page?: number;
    limit?: number;
    type?: JobType;
    status?: JobStatus;
  } = {}
) {
  const { page = 1, limit = 10, type, status } = options;
  const skip = (page - 1) * limit;

  const where = {
    organizationId,
    ...(type && { type }),
    ...(status && { status }),
  };

  const [jobs, total] = await Promise.all([
    prisma.backgroundJob.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.backgroundJob.count({ where }),
  ]);

  return {
    jobs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Delete jobs older than specified number of days
 */
export async function deleteJobsOlderThan(
  organizationId: string,
  days: number
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const result = await prisma.backgroundJob.deleteMany({
    where: {
      organizationId,
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
