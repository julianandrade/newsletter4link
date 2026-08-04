import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

/** Above this, a single request is doing too much to stay inside a timeout. */
const MAX_IDS = 1000;

type BulkAction = "approve" | "reject";

const ACTIONS: BulkAction[] = ["approve", "reject"];

/**
 * PATCH /api/articles/bulk
 *
 * Approve or reject a whole selection of the review queue in one statement,
 * rather than one POST per article. A queue after a big collection run is
 * hundreds of items long, and deciding them individually is the reason the
 * queue never gets cleared.
 *
 * Body: { action: "approve" | "reject", ids: string[] }
 */
export async function PATCH(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const body = await request.json();
    const { action, ids } = body ?? {};

    if (!ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of ${ACTIONS.join(", ")}` },
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
        { error: `Cannot act on more than ${MAX_IDS} articles at once` },
        { status: 400 }
      );
    }

    const status = action === "approve" ? "APPROVED" : "REJECTED";

    /**
     * Only articles still awaiting a decision are touched. Without the status
     * guard, a stale selection could flip an article that another reviewer has
     * already decided, and the reported count would hide it.
     *
     * The tenant client scopes this to the organization, so ids from elsewhere
     * never match and are reported as skipped.
     */
    const result = await db.article.updateMany({
      where: { id: { in: unique }, status: "PENDING_REVIEW" },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      action,
      requested: unique.length,
      affected: result.count,
      skipped: unique.length - result.count,
    });
  } catch (error) {
    console.error("Error applying bulk article action:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to apply the bulk action" },
      { status: 500 }
    );
  }
}
