import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import {
  archiveEditions,
  countDeliveryImpact,
  deleteNeverSentEditions,
  describeBulkOutcome,
  forceDeleteEditions,
  MAX_BULK_EDITIONS,
  overCapMessage,
  planEditionBulk,
  unarchiveEditions,
  type BulkTarget,
  type EditionBulkAction,
} from "@/lib/editions/lifecycle";

const ACTIONS: EditionBulkAction[] = [
  "archive",
  "unarchive",
  "delete",
  "forceDelete",
];

/**
 * PATCH /api/editions/bulk
 *
 * RQ-005 action 7 and 8, D5: the editions list gets the selection the other
 * lists already have, and the actions behind it stop being able to lose a send
 * record.
 *
 * Body: { action: "archive" | "unarchive" | "delete" | "forceDelete",
 *         ids: string[], dryRun?: boolean }
 *
 * Anything sent is archived, not deleted: archiving keeps the contents, the send
 * record and the delivery history. Delete is for an edition that never went out.
 * Force delete is an OWNER's decision and removes that edition's EmailEvent rows
 * in the same transaction, because EmailEvent.editionId has no cascade and a
 * plain delete leaves the delivery history pointing at nothing (BR-013).
 *
 * A mixed selection is handled by outcome rather than refused, and the response
 * says what was affected, what was held back and why (AC-7.5, AC-7.6).
 */
export async function PATCH(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const body = await request.json();
    const { action, ids, includeSent, dryRun } = body ?? {};

    if (!ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of ${ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    // Force delete destroys delivery history, so it is an OWNER's decision, dry
    // run included: the numbers it returns are about mail that went out.
    // Checked as soon as the action is known, before anything else is read.
    requireRole(ctx, action === "forceDelete" ? "OWNER" : "EDITOR");

    // includeSent used to mean "delete a sent edition anyway", which is the path
    // that created orphaned delivery history. A client still asking for it is
    // refused loudly rather than served quietly. Sent false is harmless: it asked
    // for exactly what delete now means on its own.
    if (includeSent === true) {
      return NextResponse.json(
        {
          error:
            'includeSent is gone: archive a sent edition, or use action "forceDelete" as an OWNER to remove it and its delivery events',
        },
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

    if (unique.length > MAX_BULK_EDITIONS) {
      return NextResponse.json(
        { error: overCapMessage(unique.length) },
        { status: 400 }
      );
    }

    // Tenant-scoped, so another organization's id resolves to nothing and comes
    // back as not-found: never 403, and never the row (AC-7.8).
    const targets = (await db.edition.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        status: true,
        sentAt: true,
        archivedAt: true,
        week: true,
        year: true,
      },
    })) as BulkTarget[];

    const plan = planEditionBulk(action, unique, targets);

    // AC-8.6: the confirmation states the real numbers, read at the moment of
    // asking rather than as a generic warning. No writes happen here.
    if (dryRun === true) {
      if (action !== "forceDelete") {
        return NextResponse.json(
          { error: "dryRun is only available for forceDelete" },
          { status: 400 }
        );
      }

      const impact = await countDeliveryImpact(db, plan.apply);

      return NextResponse.json({
        success: true,
        dryRun: true,
        action,
        editions: plan.apply.length,
        events: impact.events,
        recipients: impact.recipients,
        heldBack: plan.heldBack,
      });
    }

    let affected = 0;
    let deletedEvents: number | undefined;
    let recipientsAffected: number | undefined;

    switch (action) {
      case "archive":
        affected = await archiveEditions(db, plan.apply);
        break;
      case "unarchive":
        affected = await unarchiveEditions(db, plan.apply);
        break;
      case "delete": {
        const result = await deleteNeverSentEditions(db, plan.apply);
        affected = result.editions;
        deletedEvents = result.events;
        break;
      }
      case "forceDelete": {
        const result = await forceDeleteEditions(db, plan.apply);
        affected = result.editions;
        deletedEvents = result.events;
        recipientsAffected = result.recipients;
        break;
      }
    }

    const message = describeBulkOutcome(action, {
      requested: unique.length,
      affected,
      heldBack: plan.heldBack,
      deletedEvents,
      recipients: recipientsAffected,
    });

    return NextResponse.json({
      success: true,
      action,
      requested: unique.length,
      affected,
      // The ids the action was applied to. `affected` is what the database
      // actually changed, and the two agree unless a row moved underneath us.
      affectedIds: plan.apply,
      heldBack: plan.heldBack,
      deletedEvents,
      recipientsAffected,
      message,
      // Kept for the editions screen, which still reads these two while its own
      // revision (the archive filter and the three-action bar) is in flight.
      skipped: unique.length - affected,
      heldBackSent: plan.heldBack.filter((entry) => entry.reason === "already-sent")
        .length,
    });
  } catch (error) {
    console.error("Error applying bulk edition action:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Failed to apply the bulk action" },
      { status: 500 }
    );
  }
}
