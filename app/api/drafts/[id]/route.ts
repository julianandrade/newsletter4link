import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * GET /api/drafts/[id]
 * Get a single generation draft (tenant-scoped)
 */
export async function GET(
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

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Error fetching draft:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to fetch draft" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/drafts/[id]
 * Save editor changes to a draft's generated copy. Ghost Writer shows the
 * opening, closing and per-article summaries as editable text, so those edits
 * need somewhere to land; without this they were discarded on navigation.
 * Only DRAFT rows are editable: an approved draft is a record of what was signed
 * off, and a used one is already in an edition.
 */
export async function PATCH(
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

    const body = await request.json();
    const incoming = body?.content;

    if (!incoming || typeof incoming !== "object") {
      return NextResponse.json(
        { error: "A content object is required" },
        { status: 400 }
      );
    }

    const existing = await ctx.db.generationDraft.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        {
          error: `A ${existing.status.toLowerCase()} draft cannot be edited. Generate a new one instead.`,
        },
        { status: 409 }
      );
    }

    // Merge rather than replace, so a partial edit cannot drop the plan,
    // the subject lines or the generation timestamp.
    const current =
      existing.content && typeof existing.content === "object"
        ? (existing.content as Record<string, unknown>)
        : {};

    const draft = await ctx.db.generationDraft.update({
      where: { id },
      data: {
        content: { ...current, ...incoming },
      },
    });

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Error updating draft:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to update draft" },
      { status: 500 }
    );
  }
}
