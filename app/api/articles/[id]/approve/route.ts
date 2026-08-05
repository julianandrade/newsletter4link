import { NextResponse, after } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { rewriteArticle } from "@/lib/rewrite/pipeline";

/**
 * POST /api/articles/:id/approve
 * Approve an article for inclusion in newsletter
 *
 * This route had no authentication and no organization filter: it called
 * `updateArticleStatus(id, "APPROVED")` on the global client, so any authenticated member
 * of any organization could approve any article by id, whatever their role. The
 * middleware required a session and nothing more. It now requires EDITOR and is
 * tenant-scoped, so an id from another organization resolves to nothing and comes back as
 * not found.
 *
 * RQ-006: approval is also where a Link Take gets written. Approval rather than ingestion,
 * because fifty candidates arrive a week and an edition carries eight to twelve, so
 * generating on ingestion spends four times over. Approval is the human act that says
 * somebody intends to publish this.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    const { id } = await params;

    // Tenant-scoped, so this both checks ownership and performs the write. updateMany
    // rather than update: a missing row returns a count instead of throwing, which is the
    // difference between a 404 and a 500.
    const updated = await ctx.db.article.updateMany({
      where: { id },
      data: { status: "APPROVED" },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: "Article not found" },
        { status: 404 }
      );
    }

    const article = await ctx.db.article.findUnique({ where: { id } });

    /**
     * Generated after the response, not before it.
     *
     * A rewrite takes ten to twenty seconds and a retry can double that. Nobody should
     * watch an approve button spin for that long, and the piece is not needed until
     * somebody opens the article or assembles the edition. `after` runs on the same
     * invocation once the response is sent, so this needs no queue and no second service.
     *
     * A failure here never surfaces as an approval error. The approval succeeded, which is
     * what the caller asked for, and the pipeline records its own refusal as a row.
     */
    after(async () => {
      try {
        const outcome = await rewriteArticle(ctx.db, id, "approval");

        if (outcome.status === "refused" || outcome.status === "skipped") {
          console.log(`[REWRITE] ${id}: ${outcome.reason}`);
        }
      } catch (error) {
        console.error(`[REWRITE] ${id} failed after approval:`, error);
      }
    });

    return NextResponse.json({
      success: true,
      data: article,
      message: "Article approved successfully",
    });
  } catch (error) {
    console.error("Error approving article:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { success: false, error: "Failed to approve the article" },
      { status: 500 }
    );
  }
}
