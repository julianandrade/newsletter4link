import { NextResponse } from "next/server";
import { runCurationPipeline } from "@/lib/curation/curator";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/curation/collect
 * Manually trigger the content curation pipeline
 */
export async function POST() {
  try {
    console.log("API: Starting curation collection...");

    const result = await runCurationPipeline();

    return NextResponse.json(
      {
        success: true,
        message: "Curation pipeline completed",
        result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("API: Curation collection failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/curation/collect
 * Trigger curation via GET (for manual browser testing)
 */
export async function GET() {
  return POST();
}
