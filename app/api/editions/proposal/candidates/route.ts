import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { clampPoolLimit, readCandidatePool } from "@/lib/editions/proposal";

export const dynamic = "force-dynamic";

/**
 * GET /api/editions/proposal/candidates?search=&limit=
 *
 * RQ-005 AC-6.1: the pool the "add to this edition" picker reads.
 *
 * Separate from `GET /api/editions/proposal` on purpose. The pool runs to
 * hundreds of rows and the proposal screen only needs it when someone opens the
 * picker, so sending it with every proposal read would pay for it on every visit.
 *
 * Any member may read it, VIEWER included, on the same reasoning as the proposal
 * itself: listing what is waiting for an edition is not editing one. Adding is a
 * separate call and carries its own guard.
 */
export async function GET(request: Request) {
  try {
    const { db } = await requireOrgContext();
    const params = new URL(request.url).searchParams;

    const pool = await readCandidatePool(db, {
      search: params.get("search"),
      limit: clampPoolLimit(params.get("limit")),
    });

    return NextResponse.json({ success: true, data: pool });
  } catch (error) {
    console.error("Error reading the candidate pool:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Could not load what is waiting for an edition" },
      { status: 500 }
    );
  }
}
