/**
 * Subject Line Regeneration API
 *
 * POST /api/generation/subject-lines
 * Regenerates subject line variants for an edition.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/context";
import { resolveAiModels } from "@/lib/ai/model";
import { modelRejectionResponse } from "@/lib/ai/model-http";
import { regenerateSubjectLines } from "@/lib/generation/generator";
import { isoWeekAndYear } from "@/lib/radar/week";
import { editionLabel } from "@/lib/editions/identity";

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
    /**
     * RQ-008: the edition's own publication date and name.
     *
     * This read `edition.scheduledDate || new Date()`, and `scheduledDate` has never been
     * written by anything, so the week was always the current one no matter which edition
     * was being drafted. `publishDate` is always set, and the label is what a special
     * edition needs so its subject lines do not name a week it does not belong to.
     */
    const { week: weekNumber, year } = isoWeekAndYear(
      editionForDate?.publishDate ?? new Date()
    );
    const label = editionForDate
      ? editionLabel(editionForDate)
      : `Week ${weekNumber} · ${year}`;

    // Generate new subject lines
    // RQ-002
    const { model } = await resolveAiModels(ctx.organization.id);

    const subjectLines = await regenerateSubjectLines(
      title,
      summary,
      { week: weekNumber, year, label },
      brandVoice,
      model
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
    // RQ-002: the organization's model was refused, which is a setting to change
    // rather than a failure to retry. Before this the answer was a 500.
    const refused = modelRejectionResponse(error);
    if (refused) return refused;

    console.error("Subject line generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate subject lines" },
      { status: 500 }
    );
  }
}

