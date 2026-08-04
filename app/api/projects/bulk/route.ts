import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

/** Above this, a single request is doing too much to stay inside a timeout. */
const MAX_IDS = 1000;

type BulkAction = "feature" | "unfeature" | "delete";

const ACTIONS: BulkAction[] = ["feature", "unfeature", "delete"];

/**
 * PATCH /api/projects/bulk
 *
 * Feature, unfeature or delete many projects in one statement.
 *
 * Body: { action: "feature" | "unfeature" | "delete", ids: string[] }
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
        { error: `Cannot act on more than ${MAX_IDS} projects at once` },
        { status: 400 }
      );
    }

    // The tenant client scopes every query to this organization, so ids from
    // elsewhere never match and come back as skipped.
    if (action === "delete") {
      const result = await db.project.deleteMany({
        where: { id: { in: unique } },
      });
      return NextResponse.json({
        success: true,
        action,
        requested: unique.length,
        affected: result.count,
        skipped: unique.length - result.count,
      });
    }

    const result = await db.project.updateMany({
      where: { id: { in: unique } },
      data: { featured: action === "feature" },
    });

    return NextResponse.json({
      success: true,
      action,
      requested: unique.length,
      affected: result.count,
      skipped: unique.length - result.count,
    });
  } catch (error) {
    console.error("Error applying bulk project action:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to apply the bulk action" },
      { status: 500 }
    );
  }
}
