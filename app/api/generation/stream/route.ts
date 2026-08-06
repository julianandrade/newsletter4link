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
import { resolveAiModels, UnusableModelError } from "@/lib/ai/model";
import { createJobStream, JobCancelledError } from "@/lib/jobs";
import { JobType } from "@prisma/client";
import {
  generateNewsletter,
  GeneratedNewsletter,
  GenerationCancelledError,
} from "@/lib/generation/generator";
import { ArticleForPlanning } from "@/lib/generation/content-planner";
import { isoWeekAndYear } from "@/lib/radar/week";
import { editionLabel } from "@/lib/editions/identity";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes


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
    const { organization, features } = await requireOrgContext();
    if (!features.ghostWriter) {
      return new Response(
        JSON.stringify({ error: "Ghost Writer requires Starter plan or higher" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
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
      const { model } = await resolveAiModels(organizationId);

      // Generate newsletter with progress callback
      let newsletter: GeneratedNewsletter;
      try {
        newsletter = await generateNewsletter(
          articlesForPlanning,
          { week: weekNumber, year, label },
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
          jobId,
          model
        );
      } catch (error) {
        if (error instanceof GenerationCancelledError) {
          throw new JobCancelledError(jobId);
        }
        throw error;
      }

      // Create a generation draft instead of storing directly on edition
      const jsonContent = JSON.parse(JSON.stringify(newsletter));
      const draft = await prisma.generationDraft.create({
        data: {
          content: jsonContent,
          brandVoiceId: brandVoice?.id || null,
          editionId,
          organizationId,
          status: "DRAFT",
        },
      });

      return {
        newsletter: jsonContent,
        subjectLines: newsletter.subjectLines,
        articleCount: articles.length,
        draftId: draft.id,
      };
    },
  });
}
