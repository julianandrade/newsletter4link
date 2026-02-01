import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * POST /api/drafts/[id]/discard
 * Discard a generation draft
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    const { id } = await params;

    if (!ctx.features.ghostWriter) {
      return NextResponse.json(
        { error: "Ghost Writer requires Starter plan or higher" },
        { status: 403 }
      );
    }

    const draft = await ctx.db.generationDraft.findUnique({
      where: { id },
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      );
    }

    if (draft.status === "USED") {
      return NextResponse.json(
        { error: "Used drafts cannot be discarded" },
        { status: 400 }
      );
    }

    const updated = await ctx.db.generationDraft.update({
      where: { id },
      data: {
        status: "DISCARDED",
      },
    });

    return NextResponse.json({ draft: updated });
  } catch (error) {
    console.error("Error discarding draft:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to discard draft" },
      { status: 500 }
    );
  }
}
