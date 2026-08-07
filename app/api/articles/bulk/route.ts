import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { parseBulkRequest } from "@/lib/articles/bulk-action";
import { applyBulk } from "@/lib/articles/bulk-apply";

/**
 * PATCH /api/articles/bulk
 *
 * Approve, reject, reset, discard or restore a whole selection in one request. A queue
 * after a big collection run is hundreds of items long, and deciding them individually is
 * the reason the queue never gets cleared.
 *
 * Body: { action: "approve" | "reject" | "reset" | "discard" | "restore", ids: string[] }
 *
 * Two defects this replaces. `reset` was specified by RQ-005, implemented on the client and
 * never added here, so every Undo in the product answered 400 from the day it shipped. And
 * the route required only organization membership, so a VIEWER, whose whole definition is
 * that they decide nothing, could approve or reject the entire queue.
 *
 * The vocabulary and the writes live in `lib/articles/bulk-action.ts` and
 * `lib/articles/bulk-apply.ts`, where they are unit tested. This handler is the HTTP shell.
 */
export async function PATCH(request: Request) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    const body = await request.json().catch(() => null);
    const parsed = parseBulkRequest(body);

    if ("error" in parsed) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const outcome = await applyBulk(ctx.db, parsed, new Date());

    return NextResponse.json({
      success: true,
      action: parsed.action,
      requested: parsed.ids.length,
      ...outcome,
    });
  } catch (error) {
    console.error("Error applying bulk article action:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { success: false, error: "Failed to apply the bulk action" },
      { status: 500 }
    );
  }
}
