import { NextResponse } from "next/server";
import { getArticleById } from "@/lib/queries";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { parseArticlePatch } from "@/lib/articles/patch-input";

/**
 * GET /api/articles/:id
 * Get single article by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireOrgContext();

    const article = await getArticleById(db, id);

    if (!article) {
      return NextResponse.json(
        {
          success: false,
          error: "Article not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: article,
    });
  } catch (error) {
    console.error("Error fetching article:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/articles/:id
 *
 * Update an article's editable fields. EDITOR or above, this organization only.
 *
 * Six fields, not the two it started with: title, summary, sourceUrl, author, publishedAt
 * and category. All six reach the newsletter, and none of the four added here was editable
 * anywhere in the product. Validation lives in `lib/articles/patch-input.ts`.
 *
 * This handler had neither guard. It called no auth at all and wrote with the bare
 * `prisma` client, so any authenticated member of any organization could rewrite the
 * summary and categories of any article in any tenant, and a VIEWER could too. It is the
 * same defect RQ-005 recorded as conflict C2 and fixed on the edition routes, left behind
 * here. Finding B4 of 6 August 2026.
 *
 * The tenant client is what scopes the write now, and its `update` was itself unscoped
 * until the same day; see `lib/db/tenant.ts`.
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
    const parsed = parseArticlePatch(body);

    if ("error" in parsed) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    /**
     * Read it first, scoped, so an article in another organization answers 404 rather
     * than the P2025 the scoped update would raise. Never 403 and never the row: a
     * refusal that distinguishes "not yours" from "does not exist" tells a caller which
     * ids are real elsewhere.
     */
    const existing = await db.article.findFirst({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Article not found" },
        { status: 404 }
      );
    }

    const article = await db.article.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({
      success: true,
      data: article,
      message: "Article updated successfully",
    });
  } catch (error) {
    console.error("Error updating article:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
