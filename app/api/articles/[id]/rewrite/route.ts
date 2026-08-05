import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { rewriteArticle, publicationOf } from "@/lib/rewrite/pipeline";
import { readCurrentRewrite, readRewriteHistory } from "@/lib/rewrite/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * RQ-006: the Link Take for one article.
 *
 * GET returns what exists and generates on first open when nothing does, which is the
 * lazy half of the trigger. The eager half happens on approval, in the approve route.
 *
 * A rewrite that failed its checks is never returned as readable content. It is returned
 * as a reason, because "why is there no Link Take here" is a question an editor will ask
 * and silence is a bad answer.
 */

function attribution(article: { sourceUrl: string; publishedAt: Date; title: string }) {
  // Rule 5: the source attribution is not optional and not a footnote. Every response
  // carries it, so no surface can render the prose without it.
  return {
    publication: publicationOf(article.sourceUrl),
    url: article.sourceUrl,
    publishedAt: article.publishedAt.toISOString(),
    originalTitle: article.title,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requireOrgContext();
    const { id } = await params;

    const article = await db.article.findUnique({ where: { id } });
    if (!article) {
      return NextResponse.json(
        { success: false, error: "Article not found" },
        { status: 404 }
      );
    }

    const generate = new URL(request.url).searchParams.get("generate") !== "false";

    let current = await readCurrentRewrite(db, id);

    // Generated on open only when there is nothing usable yet. `rewriteArticle` decides
    // whether that is worth doing, and records the answer either way.
    if (generate && (!current.rewrite || current.stale)) {
      await rewriteArticle(db, id, "on-open");
      current = await readCurrentRewrite(db, id);
    }

    const usable =
      current.rewrite?.status === "GENERATED" && current.rewrite.checksPassed;

    return NextResponse.json({
      success: true,
      data: {
        attribution: attribution(article),
        /** Only ever a piece that passed. Null means show the summary and the link. */
        rewrite: usable
          ? {
              id: current.rewrite!.id,
              title: current.rewrite!.title,
              body: current.rewrite!.body,
              language: current.rewrite!.language,
              inputMode: current.rewrite!.inputMode,
              generatedAt: current.rewrite!.generatedAt,
              model: current.rewrite!.model,
              // The evidence, on the record and on the screen if anyone wants it.
              checkSummary: current.rewrite!.checkSummary,
              longestSharedRun: current.rewrite!.longestSharedRun,
              wordCount: current.rewrite!.wordCount,
            }
          : null,
        /** Why there is nothing, when there is nothing. */
        unavailableReason: usable
          ? null
          : (current.rewrite?.error ??
            "No Link Take has been written for this article yet."),
        stale: current.stale,
        // The fallback a surface must render when `rewrite` is null.
        summary: article.summary,
      },
    });
  } catch (error) {
    return errorResponse(error, "reading the Link Take");
  }
}

/**
 * POST /api/articles/[id]/rewrite
 *
 * Regenerate, for an EDITOR and above. The case it exists for is an editor changing the
 * organization description and wanting the relevance section rewritten against it.
 *
 * Forced, so it supersedes a passing rewrite rather than reusing it. The old row stays.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    const { id } = await params;
    const outcome = await rewriteArticle(ctx.db, id, "on-open", { force: true });

    if (outcome.status === "skipped") {
      return NextResponse.json(
        { success: false, error: outcome.reason },
        { status: 409 }
      );
    }

    if (outcome.status === "refused") {
      // 200, not an error: the checks did their job, and the caller needs to know that
      // rather than to retry.
      return NextResponse.json({
        success: true,
        generated: false,
        reason: outcome.reason,
      });
    }

    return NextResponse.json({
      success: true,
      generated: true,
      rewrite:
        outcome.status === "generated"
          ? { id: outcome.rewrite.id, title: outcome.rewrite.title }
          : null,
    });
  } catch (error) {
    return errorResponse(error, "regenerating the Link Take");
  }
}

/** GET /api/articles/[id]/rewrite?history=true is served by the same handler below. */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    const { id } = await params;
    const history = await readRewriteHistory(ctx.db, id);

    // The audit trail, which is the reason nothing is overwritten. Every version, with
    // its model, its mode and its check result.
    return NextResponse.json({
      success: true,
      data: history.map((row) => ({
        id: row.id,
        status: row.status,
        checksPassed: row.checksPassed,
        checkSummary: row.checkSummary,
        longestSharedRun: row.longestSharedRun,
        wordCount: row.wordCount,
        inputMode: row.inputMode,
        model: row.model,
        generatedAt: row.generatedAt,
        error: row.error,
      })),
    });
  } catch (error) {
    return errorResponse(error, "reading the Link Take history");
  }
}

function errorResponse(error: unknown, what: string) {
  console.error(`Error ${what}:`, error);

  if (error instanceof Error && error.message.startsWith("Unauthorized")) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }

  if (error instanceof Error && error.message.startsWith("Forbidden")) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }

  return NextResponse.json(
    { success: false, error: `Failed ${what}` },
    { status: 500 }
  );
}
