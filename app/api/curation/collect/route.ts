import { runCurationPipelineWithStreaming, CurationCancelledError } from "@/lib/curation/curator";
import { createJob, getCurrentJob } from "@/lib/curation/job-manager";
import { requireOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes (only works on Pro plan)

/**
 * GET /api/curation/collect
 * Stream curation progress using Server-Sent Events
 * This prevents timeout by keeping the connection alive
 *
 * Query params:
 * - sourceIds: comma-separated list of RSS source IDs to curate (optional, defaults to all)
 */
export async function GET(request: Request) {
  // Parse sourceIds from query params
  const { searchParams } = new URL(request.url);
  const sourceIdsParam = searchParams.get("sourceIds");
  const sourceIds = sourceIdsParam ? sourceIdsParam.split(",").filter(Boolean) : undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        // Get org context
        const { organization } = await requireOrgContext();
        const organizationId = organization.id;

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
        const job = await createJob(organizationId);
        const feedsDescription = sourceIds && sourceIds.length > 0
          ? `${sourceIds.length} selected feed(s)`
          : "all feeds";
        sendEvent("start", {
          message: `Starting curation pipeline for ${feedsDescription}...`,
          jobId: job.id,
        });

        await runCurationPipelineWithStreaming(
          (update) => {
            sendEvent("progress", { ...update, jobId: job.id });
          },
          organizationId,
          job.id,
          sourceIds
        );

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
export async function POST(request: Request) {
  return GET(request);
}
