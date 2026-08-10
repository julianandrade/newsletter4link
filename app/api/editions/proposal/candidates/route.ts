import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import {
  CANDIDATE_POOL_SORT_DEFAULT,
  clampPoolLimit,
  readCandidatePool,
} from "@/lib/editions/proposal";
import { parseSort } from "@/lib/list-sort";
import { ARTICLE_SORT_ALIASES, ARTICLE_SORT_FIELDS } from "@/lib/articles/sort";

export const dynamic = "force-dynamic";

/** A bound that survives a stale bookmark: unreadable means "not set", not zero. */
function numberOr(raw: string | null, fallback: number): number {
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * GET /api/editions/proposal/candidates
 *
 * RQ-005 AC-6.1: the pool the "add to this edition" picker reads.
 *
 * Query params, the same set `/api/articles/pending` accepts so the picker and the
 * queue answer a filter the same way:
 * - search: title or summary
 * - categories: comma-separated
 * - scoreMin, scoreMax: 0 to 10
 * - dateFrom, dateTo: over the date the cell shows, not `publishedAt` alone
 * - sortBy: date, relevanceScore, title, source, capturedAt
 *           (`publishedAt` is accepted and means `date`)
 * - sortOrder: asc or desc
 * - limit: clamped, never refused
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

    const categories = params.get("categories");
    const exclude = params.get("exclude");

    const pool = await readCandidatePool(db, {
      search: params.get("search"),
      categories: categories ? categories.split(",").filter(Boolean) : [],
      excludeIds: exclude ? exclude.split(",").filter(Boolean) : [],
      // NaN from a hand-edited URL falls through to the pool's own default rather
      // than reaching Prisma, where it would match nothing and read as an empty pool.
      scoreMin: numberOr(params.get("scoreMin"), 0),
      scoreMax: numberOr(params.get("scoreMax"), 10),
      dateFrom: params.get("dateFrom"),
      dateTo: params.get("dateTo"),
      sort: parseSort(
        params,
        ARTICLE_SORT_FIELDS,
        CANDIDATE_POOL_SORT_DEFAULT,
        ARTICLE_SORT_ALIASES
      ),
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
