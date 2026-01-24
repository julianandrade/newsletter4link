import { runCurationPipelineWithStreaming, CurationCancelledError } from "@/lib/curation/curator";
import { createJob, getCurrentJob } from "@/lib/curation/job-manager";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes (only works on Pro plan)

/**
 * GET /api/curation/collect
 * Stream curation progress using Server-Sent Events
 * This prevents timeout by keeping the connection alive
 */
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        // Check if there's already a running job
        const existingJob = await getCurrentJob();
        if (existingJob) {
          sendEvent("error", {
            error: "A curation job is already running",
            jobId: existingJob.id,
          });
          controller.close();
          return;
        }

        // Create a new job
        const job = await createJob();
        sendEvent("start", {
          message: "Starting curation pipeline...",
          jobId: job.id,
        });

        await runCurationPipelineWithStreaming((update) => {
          sendEvent("progress", { ...update, jobId: job.id });
        }, job.id);

        sendEvent("complete", {
          message: "Curation pipeline completed!",
          jobId: job.id,
        });
        controller.close();
      } catch (error) {
        if (error instanceof CurationCancelledError) {
          sendEvent("cancelled", {
            message: "Curation job was cancelled",
          });
        } else {
          sendEvent("error", {
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
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
 * POST /api/curation/collect
 * Same as GET but supports POST requests
 */
export async function POST() {
  return GET();
}
