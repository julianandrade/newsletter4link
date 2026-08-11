/**
 * Newsletter Generation API
 *
 * POST /api/generation/generate
 * Generates a complete newsletter from approved articles.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/context";
import { resolveAiModels } from "@/lib/ai/model";
import { modelRejectionResponse } from "@/lib/ai/model-http";
import { generateNewsletter } from "@/lib/generation/generator";
import { ArticleForPlanning } from "@/lib/generation/content-planner";
import { isoWeekAndYear } from "@/lib/radar/week";
import { editionLabel } from "@/lib/editions/identity";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    if (!ctx.features.ghostWriter) {
      return NextResponse.json(
        { error: "Ghost Writer requires Starter plan or higher" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { editionId, articleIds, brandVoiceId } = body;

    if (!editionId) {
      return NextResponse.json(
        { error: "Edition ID is required" },
        { status: 400 }
      );
    }

    // Get the edition
    const edition = await prisma.edition.findFirst({
      where: {
        id: editionId,
        organizationId: ctx.organization.id,
      },
      include: { organization: true },
    });

    if (!edition) {
      return NextResponse.json(
        { error: "Edition not found" },
        { status: 404 }
      );
    }

    // Get articles - either specified or all approved for edition
    let articles;
    if (articleIds && articleIds.length > 0) {
      // Discarded rows are out. See lib/db/tenant.ts.
      articles = await prisma.article.findMany({
        where: {
          discardedAt: null,
          id: { in: articleIds },
          organizationId: edition.organizationId,
        },
      });
    } else {
      // Get approved articles linked to this edition via join table
      const editionArticles = await prisma.editionArticle.findMany({
        where: {
          editionId: editionId,
        },
        include: {
          article: true,
        },
        orderBy: {
          order: "asc",
        },
      });

      articles = editionArticles
        .map(ea => ea.article)
        .filter(a => a.status === "APPROVED");
    }

    if (articles.length === 0) {
      return NextResponse.json(
        { error: "No articles found for generation" },
        { status: 400 }
      );
    }

    // Get brand voice if specified
    let brandVoice = null;
    if (brandVoiceId) {
      brandVoice = await prisma.brandVoice.findUnique({
        where: { id: brandVoiceId, organizationId: edition.organizationId },
      });
    } else {
      // Try to get the default brand voice for the organization
      brandVoice = await prisma.brandVoice.findFirst({
        where: {
          organizationId: edition.organizationId,
          isDefault: true,
        },
      });
    }

    // Map articles to planning format
    const articlesForPlanning: ArticleForPlanning[] = articles.map((article) => ({
      id: article.id,
      title: article.title,
      content: article.content || "",
      summary: article.summary,
      sourceUrl: article.sourceUrl,
      category: article.category,
      relevanceScore: article.relevanceScore,
    }));

    // Get week and year from edition
    /**
     * RQ-008: the edition's own publication date and name.
     *
     * This read `edition.scheduledDate || new Date()`, and `scheduledDate` has never been
     * written by anything, so the week was always the current one no matter which edition
     * was being drafted. `publishDate` is always set, and the label is what a special
     * edition needs so its subject lines do not name a week it does not belong to.
     */
    const { week: weekNumber, year } = isoWeekAndYear(edition.publishDate);
    const label = editionLabel(edition);

    // RQ-002: the organization's selected model governs drafting too.
    const { model } = await resolveAiModels(ctx.organization.id);

    // Generate the newsletter
    const generated = await generateNewsletter(
      articlesForPlanning,
      { week: weekNumber, year, label },
      brandVoice,
      undefined,
      undefined,
      model
    );

    // Store as a generation draft instead of writing directly to edition
    const jsonContent = JSON.parse(JSON.stringify(generated));
    const draft = await prisma.generationDraft.create({
      data: {
        content: jsonContent,
        brandVoiceId: brandVoice?.id || null,
        editionId,
        organizationId: edition.organizationId,
        status: "DRAFT",
      },
    });

    return NextResponse.json({
      success: true,
      newsletter: generated,
      articleCount: articles.length,
      draftId: draft.id,
    });
  } catch (error) {
    // RQ-002: the organization's model was refused, which is a setting to change
    // rather than a failure to retry. Before this the answer was a 500.
    const refused = modelRejectionResponse(error);
    if (refused) return refused;

    console.error("Newsletter generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate newsletter" },
      { status: 500 }
    );
  }
}

