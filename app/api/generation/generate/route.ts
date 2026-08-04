/**
 * Newsletter Generation API
 *
 * POST /api/generation/generate
 * Generates a complete newsletter from approved articles.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/context";
import { resolveAiModels, UnusableModelError } from "@/lib/ai/model";
import { generateNewsletter, GeneratedNewsletter } from "@/lib/generation/generator";
import { ArticleForPlanning } from "@/lib/generation/content-planner";

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
      articles = await prisma.article.findMany({
        where: {
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
    const editionDate = edition.scheduledDate || new Date();
    const weekNumber = getWeekNumber(editionDate);
    const year = editionDate.getFullYear();

    // RQ-002: the organization's selected model governs drafting too.
    const { model } = await resolveAiModels(ctx.organization.id);

    // Generate the newsletter
    const generated = await generateNewsletter(
      articlesForPlanning,
      { week: weekNumber, year },
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
    console.error("Newsletter generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate newsletter" },
      { status: 500 }
    );
  }
}

/**
 * Get ISO week number for a date
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
