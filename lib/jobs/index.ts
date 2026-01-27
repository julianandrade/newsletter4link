// Re-export Prisma types for convenience
export { JobType, JobStatus } from "@prisma/client";

// Job Manager - Generic background job management
export {
  createJob,
  updateJobProgress,
  addJobLog,
  completeJob,
  failJob,
  cancelJob,
  isJobCancelled,
  getRunningJob,
  getJob,
  getJobs,
  deleteJobsOlderThan,
  type JobLogEntry,
} from "./job-manager";

// SSE Stream Helper - Server-Sent Events for job progress
export {
  createJobStream,
  createCancellableProgress,
  JobCancelledError,
  type ProgressCallback,
  type JobStreamOptions,
} from "./sse-stream";
