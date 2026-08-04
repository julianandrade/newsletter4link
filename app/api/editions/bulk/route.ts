import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

/** Above this, a single request is doing too much to stay inside a timeout. */
const MAX_IDS = 500;

/**
 * PATCH /api/editions/bulk
 *
 * RQ-005 action 7: the editions list gains the selection and delete the other
 * lists already have.
 *
 * Body: { action: "delete", ids: string[], includeSent?: boolean }
 *
 * A sent edition is refused unless includeSent is set, because it is the record
 * of something that went to subscribers. Deleting it does not unsend the mail; it
 * only removes the evidence that it was sent, which is rarely what someone means
 * when they select a row.
 */
export async function PATCH(request: Request) {
  try {
    const { db } = await requireOrgContext();

    const body = await request.json();
    const { action, ids, includeSent } = body ?? {};

    if (action !== "delete") {
      return NextResponse.json(
        { error: 'action must be "delete"' },
        { status: 400 }
      );
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!ids.every((id) => typeof id === "string" && id.length > 0)) {
      return NextResponse.json(
        { error: "every id must be a non-empty string" },
        { status: 400 }
      );
    }

    const unique = [...new Set<string>(ids)];

    if (unique.length > MAX_IDS) {
      return NextResponse.json(
        { error: `Cannot act on more than ${MAX_IDS} editions at once` },
        { status: 400 }
      );
    }

    // Refuse the sent ones by default, and say how many were held back rather
    // than deleting them quietly.
    const targets = await db.edition.findMany({
      where: { id: { in: unique } },
      select: { id: true, status: true },
    });

    const sent = targets.filter((edition) => edition.status === "SENT");
    const deletable = includeSent
      ? targets
      : targets.filter((edition) => edition.status !== "SENT");

    if (deletable.length === 0) {
      return NextResponse.json({
        success: true,
        action,
        requested: unique.length,
        affected: 0,
        skipped: unique.length,
        heldBackSent: sent.length,
        message:
          sent.length > 0
            ? "Nothing deleted: every selected edition has been sent"
            : "Nothing deleted: none of those editions exist here",
      });
    }

    const result = await db.edition.deleteMany({
      where: { id: { in: deletable.map((edition) => edition.id) } },
    });

    return NextResponse.json({
      success: true,
      action,
      requested: unique.length,
      affected: result.count,
      skipped: unique.length - result.count,
      heldBackSent: includeSent ? 0 : sent.length,
    });
  } catch (error) {
    console.error("Error applying bulk edition action:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to apply the bulk action" },
      { status: 500 }
    );
  }
}
