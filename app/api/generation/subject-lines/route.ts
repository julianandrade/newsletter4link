/**
 * Subject Line Regeneration API
 *
 * POST /api/generation/subject-lines
 * Regenerates subject line variants for an edition.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { regenerateSubjectLines } from "@/lib/generation/generator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { editionId, heroTitle, heroSummary, brandVoiceId } = body;

    if (!editionId) {
      return NextResponse.json(
        { error: "Edition ID is required" },
        { status: 400 }
      );
    }

    // Get the edition
    const edition = await prisma.edition.findUnique({
      where: { id: editionId },
      include: {
        organization: true,
      },
    });

    if (!edition) {
      return NextResponse.json(
        { error: "Edition not found" },
        { status: 404 }
      );
    }

    // Get brand voice
    let brandVoice = null;
    if (brandVoiceId) {
      brandVoice = await prisma.brandVoice.findUnique({
        where: { id: brandVoiceId },
      });
    } else {
      brandVoice = await prisma.brandVoice.findFirst({
        where: {
          organizationId: edition.organizationId,
          isDefault: true,
        },
      });
    }

    // Get hero article info - either from params or from generated content
    let title = heroTitle;
    let summary = heroSummary;

    if (!title) {
      // Try to get from generated content
      const generatedContent = edition.generatedContent as { plan?: { heroArticle?: { title: string; summary?: string } } } | null;
      if (generatedContent?.plan?.heroArticle) {
        title = generatedContent.plan.heroArticle.title;
        summary = summary || generatedContent.plan.heroArticle.summary;
      }
    }

    if (!title) {
      // Fall back to first approved article from edition
      const firstEditionArticle = await prisma.editionArticle.findFirst({
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

      if (firstEditionArticle?.article && firstEditionArticle.article.status === "APPROVED") {
        title = firstEditionArticle.article.title;
        summary = firstEditionArticle.article.summary;
      }
    }

    if (!title) {
      return NextResponse.json(
        { error: "No hero article found for subject line generation" },
        { status: 400 }
      );
    }

    // Get week number
    const editionDate = edition.scheduledDate || new Date();
    const weekNumber = getWeekNumber(editionDate);
    const year = editionDate.getFullYear();

    // Generate new subject lines
    const subjectLines = await regenerateSubjectLines(
      title,
      summary,
      { week: weekNumber, year },
      brandVoice
    );

    // Update edition with new subject lines
    const generatedContent = (edition.generatedContent || {}) as Record<string, unknown>;
    await prisma.edition.update({
      where: { id: editionId },
      data: {
        generatedContent: {
          ...generatedContent,
          subjectLines,
        },
      },
    });

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
