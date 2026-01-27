import { JobType } from "@prisma/client";
import {
  createJob,
  getRunningJob,
  completeJob,
  failJob,
  updateJobProgress,
  isJobCancelled,
} from "./job-manager";

/**
 * Progress callback function signature for job runners.
 * Returns Promise<void> so runners can await it for cancellation checks.
 */
export type ProgressCallback = (
  stage: string,
  progress: number,
  message?: string
) => Promise<void>;

/**
 * Options for creating a job stream
 */
export interface JobStreamOptions {
  organizationId: string;
  jobType: JobType;
  metadata?: Record<string, unknown>;
  runner: (
    jobId: string,
    sendProgress: ProgressCallback
  ) => Promise<Record<string, unknown>>;
}

/**
 * Error thrown when job is cancelled
 */
export class JobCancelledError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} was cancelled`);
    this.name = "JobCancelledError";
  }
}

/**
 * Create a Server-Sent Events stream for a background job
 *
 * This helper:
 * 1. Checks for existing running job of same type (returns error if exists)
 * 2. Creates new job
 * 3. Sends "start" event with jobId
 * 4. Calls the runner function with progress callback
 * 5. Sends "progress" events during execution
 * 6. Sends "complete" event with result or "error"/"cancelled" event
 * 7. Cleans up properly
 */
export function createJobStream(options: JobStreamOptions): Response {
  const { organizationId, jobType, metadata, runner } = options;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: Record<string, unknown>) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      let jobId: string | null = null;

      try {
        // Check if there's already a running job of this type
        const existingJob = await getRunningJob(organizationId, jobType);
        if (existingJob) {
          sendEvent("error", {
            error: `A ${jobType.toLowerCase()} job is already running`,
            jobId: existingJob.id,
          });
          controller.close();
          return;
        }

        // Create a new job
        const job = await createJob(organizationId, jobType, metadata);
        jobId = job.id;

        sendEvent("start", {
          message: `Starting ${jobType.toLowerCase()} job...`,
          jobId: job.id,
        });

        // Create progress callback that checks for cancellation
        const sendProgress: ProgressCallback = async (
          stage: string,
          progress: number,
          message?: string
        ) => {
          // Check if job was cancelled
          const cancelled = await isJobCancelled(jobId!);
          if (cancelled) {
            throw new JobCancelledError(jobId!);
          }

          // Update job in database
          await updateJobProgress(jobId!, stage, progress, message);

          // Send progress event to client
          sendEvent("progress", {
            jobId: jobId!,
            stage,
            progress,
            message,
          });
        };

        // Run the job
        const result = await runner(jobId, sendProgress);

        // Complete the job
        await completeJob(jobId, result);

        sendEvent("complete", {
          message: `${jobType.toLowerCase()} job completed!`,
          jobId,
          result,
        });
      } catch (error) {
        if (error instanceof JobCancelledError) {
          sendEvent("cancelled", {
            message: "Job was cancelled",
            jobId,
          });
        } else {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";

          // Mark job as failed if we have a jobId
          if (jobId) {
            await failJob(jobId, errorMessage).catch(() => {
              // Ignore errors during cleanup
            });
          }

          sendEvent("error", {
            error: errorMessage,
            jobId,
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Create a cancellable progress callback that checks for cancellation
 * before each progress update
 */
export function createCancellableProgress(
  jobId: string,
  onProgress: (stage: string, progress: number, message?: string) => void
): ProgressCallback {
  return async (stage: string, progress: number, message?: string) => {
    // Check if job was cancelled
    const cancelled = await isJobCancelled(jobId);
    if (cancelled) {
      throw new JobCancelledError(jobId);
    }

    // Call the progress handler
    onProgress(stage, progress, message);
  };
}
