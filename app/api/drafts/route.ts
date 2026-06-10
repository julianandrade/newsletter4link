import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/drafts?editionId=...
 * List generation drafts for an edition (tenant-scoped)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireOrgContext();

    if (!ctx.features.ghostWriter) {
      return NextResponse.json(
        { error: "Ghost Writer requires Starter plan or higher" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const editionId = searchParams.get("editionId");

    if (!editionId) {
      return NextResponse.json(
        { error: "editionId is required" },
        { status: 400 }
      );
    }

    const drafts = await ctx.db.generationDraft.findMany({
      where: { editionId },
      orderBy: { generatedAt: "desc" },
      select: {
        id: true,
        status: true,
        generatedAt: true,
        approvedAt: true,
        brandVoiceId: true,
      },
    });

    return NextResponse.json({ drafts });
  } catch (error) {
    logger.error("Error fetching drafts", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to fetch drafts" },
      { status: 500 }
    );
  }
}
