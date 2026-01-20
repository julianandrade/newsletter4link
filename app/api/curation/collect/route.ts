import { runCurationPipelineWithStreaming } from "@/lib/curation/curator";

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
        sendEvent("start", { message: "Starting curation pipeline..." });

        await runCurationPipelineWithStreaming((update) => {
          sendEvent("progress", update);
        });

        sendEvent("complete", { message: "Curation pipeline completed!" });
        controller.close();
      } catch (error) {
        sendEvent("error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
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
