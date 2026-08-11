import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { parseAsidePatch } from "@/lib/asides/input";

export const dynamic = "force-dynamic";

/**
 * GET /api/asides/:id
 *
 * One aside, whatever state it is in. VIEWER or above, this organization only.
 *
 * The reason it exists rather than the caller filtering the library: `?offerable=true`
 * answers "what may still be chosen", and an edition can carry a row that question excludes.
 * A one-off is written `reusable: false`, a line can be retired after an edition picked it,
 * and the send screen's kind tab opens on Joke whatever the edition is carrying. Resolving
 * the attachment by searching the library made all three read as an edition carrying
 * something the product could not show.
 *
 * Scoped through the tenant client, so an aside in another organization answers 404 rather
 * than the row. Never 403: a refusal that separates "not yours" from "does not exist" tells
 * a caller which ids are real elsewhere.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requireOrgContext();
    const { id } = await params;

    const aside = await db.aside.findFirst({ where: { id } });

    if (!aside) {
      return NextResponse.json(
        { success: false, error: "Aside not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: aside });
  } catch (error) {
    console.error("Error reading aside:", error);

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/asides/:id
 *
 * Edit an aside, or move it between PENDING, APPROVED and RETIRED. EDITOR or above,
 * this organization only.
 *
 * Approving a model suggestion is this route with `{ status: "APPROVED" }`. That is the
 * only way anything a model wrote can reach a send.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");
    const { db } = ctx;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = parseAsidePatch(body);

    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    /**
     * Read it first, scoped, so an aside in another organization answers 404 rather than
     * the P2025 the scoped update would raise. Never 403 and never the row: a refusal
     * that distinguishes "not yours" from "does not exist" tells a caller which ids are
     * real elsewhere.
     */
    const existing = await db.aside.findFirst({ where: { id }, select: { id: true } });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Aside not found" },
        { status: 404 }
      );
    }

    const aside = await db.aside.update({ where: { id }, data: parsed.value });

    return NextResponse.json({ success: true, data: aside });
  } catch (error) {
    console.error("Error updating aside:", error);

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/asides/:id
 *
 * ADMIN or above. Prefer RETIRED for anything that has been sent: this destroys the record
 * of a line the company published, and `Edition.asideId` is SetNull, so an edition that
 * used it loses the pointer.
 *
 * It deliberately does not delete the stored image. The same file can sit in the frozen
 * snapshot of an edition already delivered, and the signed archive still renders it.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "ADMIN");
    const { db } = ctx;

    const { id } = await params;
    const existing = await db.aside.findFirst({ where: { id }, select: { id: true } });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Aside not found" },
        { status: 404 }
      );
    }

    await db.aside.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Aside deleted" });
  } catch (error) {
    console.error("Error deleting aside:", error);

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
