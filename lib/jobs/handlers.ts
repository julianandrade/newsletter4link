import { QueueJob, QueueJobType } from "@prisma/client";
import { runCurationPipeline } from "@/lib/curation/curator";

/**
 * Maps each queue job type to the work it performs. A handler returns a
 * JSON-serializable result stored on the job, or throws to trigger a retry.
 */
type JobHandler = (job: QueueJob) => Promise<Record<string, unknown>>;

const handlers: Record<QueueJobType, JobHandler> = {
  CURATION: async (job) => {
    if (!job.organizationId) {
      // Non-retryable: a curation job without an org can never succeed
      throw new Error("CURATION job is missing organizationId");
    }
    const result = await runCurationPipeline(job.organizationId);
    return {
      curated: result.curated,
      duplicates: result.duplicates,
      lowScore: result.lowScore,
      errors: result.errors.length,
    };
  },
};

export async function runJobHandler(
  job: QueueJob
): Promise<Record<string, unknown>> {
  const handler = handlers[job.type];
  if (!handler) {
    throw new Error(`No handler registered for job type ${job.type}`);
  }
  return handler(job);
}
