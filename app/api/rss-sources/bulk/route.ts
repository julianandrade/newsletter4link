import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

/** Above this, a single request is doing too much to stay inside a timeout. */
const MAX_IDS = 1000;

type BulkAction = "activate" | "deactivate" | "delete";

const ACTIONS: BulkAction[] = ["activate", "deactivate", "delete"];

/**
 * PATCH /api/rss-sources/bulk
 *
 * Enable, disable or delete many feeds in one statement. With 434 sources
 * configured, the alternative is 434 round trips: slow, rate-limited, and
 * impossible to report on when one of them fails halfway.
 *
 * Body: { action: "activate" | "deactivate" | "delete", ids: string[] }
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

    // De-duplicated, since the client can send the same id twice when a
    // selection spans overlapping groups.
    const unique = [...new Set<string>(ids)];

    if (unique.length > MAX_IDS) {
      return NextResponse.json(
        { error: `Cannot act on more than ${MAX_IDS} sources at once` },
        { status: 400 }
      );
    }

    // The tenant client scopes every query to this organization, so ids
    // belonging to another org simply do not match and are reported as skipped
    // rather than acted on.
    if (action === "delete") {
      const result = await db.rSSSource.deleteMany({
        where: { id: { in: unique } },
      });
      return NextResponse.json({
        action,
        requested: unique.length,
        affected: result.count,
        skipped: unique.length - result.count,
      });
    }

    const active = action === "activate";
    const result = await db.rSSSource.updateMany({
      where: { id: { in: unique } },
      data: { active },
    });

    return NextResponse.json({
      action,
      requested: unique.length,
      affected: result.count,
      skipped: unique.length - result.count,
    });
  } catch (error) {
    console.error("Error applying bulk source action:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to apply the bulk action" },
      { status: 500 }
    );
  }
}
