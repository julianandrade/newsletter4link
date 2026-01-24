import { NextResponse } from "next/server";
import { sendNewsletterToAll, sendEmail } from "@/lib/email/sender";
import { prisma } from "@/lib/db";
import { getCurrentEdition, markEditionAsSent } from "@/lib/queries";
import { renderTemplateById } from "@/lib/email/template-renderer";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/email/send-all
 * Send newsletter to all active subscribers
 *
 * Body: { editionId?: string, templateId?: string }
 * - templateId: specific template to use (optional, uses React Email component if omitted)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { editionId, templateId } = body;

    // Get edition
    let edition;
    if (editionId) {
      edition = await prisma.edition.findUnique({
        where: { id: editionId },
        include: {
          articles: {
            include: { article: true },
            orderBy: { order: "asc" },
          },
          projects: {
            include: { project: true },
            orderBy: { order: "asc" },
          },
        },
      });
    } else {
      // Get approved articles and featured projects
      const articles = await prisma.article.findMany({
        where: { status: "APPROVED" },
        orderBy: [
          { relevanceScore: "desc" },
          { publishedAt: "desc" },
        ],
        take: 10,
      });

      const projects = await prisma.project.findMany({
        where: { featured: true },
        orderBy: { projectDate: "desc" },
        take: 3,
      });

      if (articles.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "No approved articles found. Please approve some articles first.",
          },
          { status: 400 }
        );
      }

      // Create edition if doesn't exist
      const now = new Date();
      const week = getWeekNumber(now);
      const year = now.getFullYear();

      edition = await prisma.edition.upsert({
        where: {
          week_year: { week, year },
        },
        create: {
          week,
          year,
          status: "FINALIZED",
          finalizedAt: new Date(),
        },
        update: {},
        include: {
          articles: {
            include: { article: true },
            orderBy: { order: "asc" },
          },
          projects: {
            include: { project: true },
            orderBy: { order: "asc" },
          },
        },
      });

      // Add articles and projects to edition if empty
      if (edition.articles.length === 0) {
        for (let i = 0; i < articles.length; i++) {
          await prisma.editionArticle.create({
            data: {
              editionId: edition.id,
              articleId: articles[i].id,
              order: i,
            },
          });
        }
      }

      if (edition.projects.length === 0) {
        for (let i = 0; i < projects.length; i++) {
          await prisma.editionProject.create({
            data: {
              editionId: edition.id,
              projectId: projects[i].id,
              order: i,
            },
          });
        }
      }

      // Reload edition with articles and projects
      edition = await prisma.edition.findUnique({
        where: { id: edition.id },
        include: {
          articles: {
            include: { article: true },
            orderBy: { order: "asc" },
          },
          projects: {
            include: { project: true },
            orderBy: { order: "asc" },
          },
        },
      });
    }

    if (!edition) {
      return NextResponse.json(
        {
          success: false,
          error: "Edition not found",
        },
        { status: 404 }
      );
    }

    // Check if already sent
    if (edition.status === "SENT") {
      return NextResponse.json(
        {
          success: false,
          error: "This edition has already been sent",
        },
        { status: 400 }
      );
    }

    // Get subscriber count
    const subscriberCount = await prisma.subscriber.count({
      where: { active: true },
    });

    if (subscriberCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No active subscribers found",
        },
        { status: 400 }
      );
    }

    // Prepare email data
    const emailData = {
      articles: edition.articles.map((ea: any) => ({
        id: ea.article.id,
        title: ea.article.title,
        summary: ea.article.summary || "",
        sourceUrl: ea.article.sourceUrl,
        category: ea.article.category,
        relevanceScore: ea.article.relevanceScore,
      })),
      projects: edition.projects.map((ep: any) => ({
        id: ep.project.id,
        name: ep.project.name,
        description: ep.project.description,
        team: ep.project.team,
        impact: ep.project.impact || null,
        projectDate: ep.project.projectDate.toISOString(),
      })),
      week: edition.week,
      year: edition.year,
    };

    console.log(
      `Starting batch send to ${subscriberCount} subscribers for Week ${edition.week}, ${edition.year}...`
    );

    // Check if using a custom template
    let templateHtml: string | null = null;
    if (templateId) {
      const templateResult = await renderTemplateById(templateId, emailData);
      if (!templateResult) {
        return NextResponse.json(
          { success: false, error: "Template not found" },
          { status: 404 }
        );
      }
      templateHtml = templateResult.html;
    }

    // Send to all subscribers
    let result;
    if (templateHtml) {
      // Use custom template - send directly with pre-rendered HTML
      result = await sendNewsletterWithTemplate(
        templateHtml,
        emailData,
        edition.id
      );
    } else {
      // Use default React Email component
      result = await sendNewsletterToAll(emailData, edition.id);
    }

    // Mark edition as sent
    if (result.sent > 0) {
      await markEditionAsSent(edition.id);
    }

    return NextResponse.json({
      success: result.success,
      message: `Newsletter sent to ${result.sent}/${result.sent + result.failed} subscribers`,
      data: {
        sent: result.sent,
        failed: result.failed,
        errors: result.errors.slice(0, 10), // Return first 10 errors
      },
    });
  } catch (error) {
    console.error("Error sending newsletter:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

interface EmailData {
  week: number;
  year: number;
  articles: unknown[];
  projects: unknown[];
}

/**
 * Send newsletter to all subscribers using a pre-rendered template HTML
 */
async function sendNewsletterWithTemplate(
  templateHtml: string,
  data: EmailData,
  editionId: string
): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  errors: string[];
}> {
  const result = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // Get all active subscribers
    const subscribers = await prisma.subscriber.findMany({
      where: { active: true },
    });

    const total = subscribers.length;
    console.log(`Sending newsletter with template to ${total} subscribers...`);

    // Send in batches to avoid rate limiting
    const batchSize = config.email.batchSize;
    const batches = [];

    for (let i = 0; i < subscribers.length; i += batchSize) {
      batches.push(subscribers.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      // Send all emails in batch concurrently
      const promises = batch.map(async (subscriber) => {
        try {
          const emailResult = await sendEmail(
            subscriber.email,
            `Link AI Newsletter - Week ${data.week}, ${data.year}`,
            templateHtml
          );

          if (emailResult.success) {
            // Log email event
            await prisma.emailEvent.create({
              data: {
                subscriberId: subscriber.id,
                editionId,
                eventType: "SENT",
                metadata: {
                  messageId: emailResult.messageId,
                },
              },
            });
          }

          return emailResult;
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      });

      const results = await Promise.allSettled(promises);

      // Process results
      results.forEach((res, index) => {
        const subscriber = batch[index];
        if (res.status === "fulfilled" && res.value.success) {
          result.sent++;
        } else {
          result.failed++;
          const error =
            res.status === "rejected"
              ? res.reason
              : res.value.error || "Unknown error";
          result.errors.push(`${subscriber.email}: ${error}`);
        }
      });

      // Update progress
      const current = Math.min((batchIndex + 1) * batchSize, total);
      console.log(
        `Batch ${batchIndex + 1}/${batches.length} complete: ${current}/${total} sent`
      );

      // Wait between batches to respect rate limits
      if (batchIndex < batches.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, config.email.rateLimitDelay)
        );
      }
    }

    console.log(
      `Newsletter sending complete: ${result.sent} sent, ${result.failed} failed`
    );

    return result;
  } catch (error) {
    console.error("Error in batch send with template:", error);
    return {
      ...result,
      success: false,
      errors: [
        ...result.errors,
        error instanceof Error ? error.message : "Unknown error",
      ],
    };
  }
}
