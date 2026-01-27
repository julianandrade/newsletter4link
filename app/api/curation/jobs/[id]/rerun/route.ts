import { NextResponse } from "next/server";
import { getJob, getCurrentJob, createJob } from "@/lib/curation/job-manager";
import { runCurationPipelineWithStreaming, CurationCancelledError } from "@/lib/curation/curator";
import { requireOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/curation/jobs/[id]/rerun
 * Re-run a failed or completed curation job
 * Returns a streaming response with the new job progress
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check if original job exists
  const originalJob = await getJob(id);

  if (!originalJob) {
    return NextResponse.json(
      { error: "Original curation job not found" },
      { status: 404 }
    );
  }

  // Only allow re-run for FAILED or COMPLETED jobs
  if (!["FAILED", "COMPLETED", "CANCELLED"].includes(originalJob.status)) {
    return NextResponse.json(
      { error: `Cannot re-run a job with status: ${originalJob.status}. Only FAILED, COMPLETED, or CANCELLED jobs can be re-run.` },
      { status: 400 }
    );
  }

  // Check if there's already a running job
  const existingRunningJob = await getCurrentJob();
  if (existingRunningJob) {
    return NextResponse.json(
      { error: "A curation job is already running", jobId: existingRunningJob.id },
      { status: 409 }
    );
  }

  // Stream the new job progress
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

        // Create a new job
        const newJob = await createJob(organizationId);
        sendEvent("start", {
          message: "Re-running curation pipeline...",
          jobId: newJob.id,
          originalJobId: id,
        });

        await runCurationPipelineWithStreaming(
          (update) => {
            sendEvent("progress", { ...update, jobId: newJob.id });
          },
          organizationId,
          newJob.id
        );

        sendEvent("complete", {
          message: "Curation pipeline completed!",
          jobId: newJob.id,
          originalJobId: id,
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
