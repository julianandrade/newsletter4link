/**
 * Subject Line Regeneration API
 *
 * POST /api/generation/subject-lines
 * Regenerates subject line variants for an edition.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/context";
import { regenerateSubjectLines } from "@/lib/generation/generator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { editionId, draftId, heroTitle, heroSummary, brandVoiceId } = body;

    if (!editionId && !draftId) {
      return NextResponse.json(
        { error: "Edition ID or Draft ID is required" },
        { status: 400 }
      );
    }

    const ctx = await requireOrgContext();

    if (!ctx.features.ghostWriter) {
      return NextResponse.json(
        { error: "Ghost Writer requires Starter plan or higher" },
        { status: 403 }
      );
    }

    // Get the edition (if provided)
    const edition = editionId
      ? await prisma.edition.findFirst({
          where: {
            id: editionId,
            organizationId: ctx.organization.id,
          },
          include: { organization: true },
        })
      : null;

    if (editionId && !edition) {
      return NextResponse.json({ error: "Edition not found" }, { status: 404 });
    }

    // Get brand voice
    let brandVoice = null;
    if (brandVoiceId) {
      brandVoice = await prisma.brandVoice.findUnique({
        where: {
          id: brandVoiceId,
          organizationId: ctx.organization.id,
        },
      });
    } else if (edition) {
      brandVoice = await prisma.brandVoice.findFirst({
        where: {
          organizationId: edition.organizationId,
          isDefault: true,
        },
      });
    }

    // Get draft content (preferred) or fall back to edition content
    const draft = draftId
      ? await ctx.db.generationDraft.findUnique({ where: { id: draftId } })
      : edition
        ? await ctx.db.generationDraft.findFirst({
            where: { editionId: edition.id },
            orderBy: { generatedAt: "desc" },
          })
        : null;

    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    // Get hero article info - either from params or from draft content
    let title = heroTitle;
    let summary = heroSummary;

    if (!title) {
      const generatedContent = (draft?.content || {}) as {
        plan?: { heroArticle?: { title: string; summary?: string } };
      };
      if (generatedContent?.plan?.heroArticle) {
        title = generatedContent.plan.heroArticle.title;
        summary = summary || generatedContent.plan.heroArticle.summary;
      }
    }

    if (!title) {
      // Fall back to first approved article from edition
      const editionForFallback = edition || (draft ? await prisma.edition.findFirst({
        where: { id: draft.editionId, organizationId: ctx.organization.id },
      }) : null);
      if (editionForFallback) {
        const firstEditionArticle = await prisma.editionArticle.findFirst({
          where: {
            editionId: editionForFallback.id,
          },
          include: {
            article: true,
          },
          orderBy: {
            order: "asc",
          },
        });

        if (firstEditionArticle?.article && firstEditionArticle.article.status === "APPROVED") {
          title = firstEditionArticle.article.title;
          summary = firstEditionArticle.article.summary;
        }
      }
    }

    if (!title) {
      return NextResponse.json(
        { error: "No hero article found for subject line generation" },
        { status: 400 }
      );
    }

    // Get week number
    const editionForDate = edition
      ? edition
      : await prisma.edition.findFirst({
          where: { id: draft.editionId, organizationId: ctx.organization.id },
        });
    const editionDate = editionForDate?.scheduledDate || new Date();
    const weekNumber = getWeekNumber(editionDate);
    const year = editionDate.getFullYear();

    // Generate new subject lines
    const subjectLines = await regenerateSubjectLines(
      title,
      summary,
      { week: weekNumber, year },
      brandVoice
    );

    if (draft) {
      const generatedContent = (draft.content || {}) as Record<string, unknown>;
      await ctx.db.generationDraft.update({
        where: { id: draft.id },
        data: {
          content: {
            ...generatedContent,
            subjectLines,
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      subjectLines,
    });
  } catch (error) {
    console.error("Subject line generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate subject lines" },
      { status: 500 }
    );
  }
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
