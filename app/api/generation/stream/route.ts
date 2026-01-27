/**
 * Newsletter Generation Streaming API
 *
 * GET /api/generation/stream?editionId=...&brandVoiceId=...
 *
 * Streams generation progress using Server-Sent Events.
 * Uses the generic job system from lib/jobs.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/context";
import { createJobStream, JobCancelledError } from "@/lib/jobs";
import { JobType } from "@prisma/client";
import {
  generateNewsletter,
  GeneratedNewsletter,
  GenerationCancelledError,
} from "@/lib/generation/generator";
import { ArticleForPlanning } from "@/lib/generation/content-planner";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * Get ISO week number for a date
 */
function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const editionId = searchParams.get("editionId");
  const brandVoiceId = searchParams.get("brandVoiceId");

  if (!editionId) {
    return new Response(
      JSON.stringify({ error: "editionId is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get org context
  let organizationId: string;
  try {
    const { organization } = await requireOrgContext();
    organizationId = organization.id;
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate edition exists and belongs to org
  const edition = await prisma.edition.findFirst({
    where: {
      id: editionId,
      organizationId,
    },
  });

  if (!edition) {
    return new Response(
      JSON.stringify({ error: "Edition not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  return createJobStream({
    organizationId,
    jobType: JobType.GENERATION,
    metadata: { editionId, brandVoiceId },
    runner: async (jobId, sendProgress) => {
      // Get articles for this edition
      const editionArticles = await prisma.editionArticle.findMany({
        where: { editionId },
        include: { article: true },
        orderBy: { order: "asc" },
      });

      const articles = editionArticles
        .map((ea) => ea.article)
        .filter((a) => a.status === "APPROVED");

      if (articles.length === 0) {
        throw new Error("No approved articles found for generation");
      }

      // Get brand voice if specified (must belong to this organization)
      let brandVoice = null;
      if (brandVoiceId) {
        brandVoice = await prisma.brandVoice.findFirst({
          where: { id: brandVoiceId, organizationId },
        });
      } else {
        brandVoice = await prisma.brandVoice.findFirst({
          where: { organizationId, isDefault: true },
        });
      }

      // Map articles to planning format
      const articlesForPlanning: ArticleForPlanning[] = articles.map(
        (article) => ({
          id: article.id,
          title: article.title,
          content: article.content || "",
          summary: article.summary,
          sourceUrl: article.sourceUrl,
          category: article.category,
          relevanceScore: article.relevanceScore,
        })
      );

      // Get week and year from edition
      const editionDate = edition.scheduledDate || new Date();
      const weekNumber = getWeekNumber(editionDate);
      const year = editionDate.getFullYear();

      // Generate newsletter with progress callback
      let newsletter: GeneratedNewsletter;
      try {
        newsletter = await generateNewsletter(
          articlesForPlanning,
          { week: weekNumber, year },
          brandVoice,
          async (progress) => {
            // Map the stage to a progress percentage (0-100)
            const stageProgress: Record<string, number> = {
              planning: 10,
              opening: 25,
              articles: 50,
              transitions: 70,
              closing: 85,
              subjects: 95,
              complete: 100,
            };

            const progressPercent = stageProgress[progress.stage] || 0;

            // Build message with article progress if applicable
            let message = progress.message;
            if (progress.stage === "articles" && progress.current && progress.total) {
              message = `Summarizing article ${progress.current}/${progress.total}...`;
            }

            await sendProgress(progress.stage, progressPercent, message);
          },
          jobId
        );
      } catch (error) {
        if (error instanceof GenerationCancelledError) {
          throw new JobCancelledError(jobId);
        }
        throw error;
      }

      // Store the generated content in the edition
      const jsonContent = JSON.parse(JSON.stringify(newsletter));
      await prisma.edition.update({
        where: { id: editionId },
        data: {
          generatedContent: jsonContent,
          generatedAt: new Date(),
        },
      });

      return {
        newsletter: jsonContent,
        subjectLines: newsletter.subjectLines,
        articleCount: articles.length,
      };
    },
  });
}
