import { NextResponse } from "next/server";
import { runCurationPipelineWithStreaming, CurationCancelledError } from "@/lib/curation/curator";
import { createJob, getCurrentJob } from "@/lib/curation/job-manager";
import { requireOrgContext } from "@/lib/auth/context";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes (only works on Pro plan)

// Full curation pipeline (RSS fetch + embeddings + LLM scoring) is the most expensive op.
const RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

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

  // Resolve auth/org context and enforce rate limit BEFORE opening the SSE
  // stream, so an over-limit caller gets a plain 429 JSON response.
  let organizationId: string;
  try {
    const { organization, membership } = await requireOrgContext();
    organizationId = organization.id;

    const rl = checkRateLimit(
      rateLimitKey([
        organization.id,
        membership.id,
        "curation:collect",
      ]),
      RATE_LIMIT
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Please retry shortly." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        // org context + rate limit already validated above

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
