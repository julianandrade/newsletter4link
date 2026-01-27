import { NextResponse } from "next/server";
import { sendNewsletterToAll, sendEmail, renderNewsletterEmail } from "@/lib/email/sender";
import { prisma } from "@/lib/db";
import { getCurrentEdition, markEditionAsSent } from "@/lib/queries";
import { renderTemplateById } from "@/lib/email/template-renderer";
import { config } from "@/lib/config";
import { sendEmailWithProvider, isSpecificProviderConfigured, getProviderSettings } from "@/lib/email/provider";
import { requireOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

interface CustomBlock {
  id: string;
  type: "text" | "image";
  content: string;
  position: "before-articles" | "after-articles" | "before-projects" | "after-projects";
}

interface CustomData {
  articles: Array<{
    title: string;
    summary: string;
    sourceUrl: string;
    category: string[];
  }>;
  projects: Array<{
    name: string;
    description: string;
    team: string;
    impact?: string;
    projectDate?: string;
  }>;
  customBlocks?: CustomBlock[];
  week: number;
  year: number;
}

/**
 * POST /api/email/send-all
 * Send newsletter to subscribers or ad-hoc email addresses
 *
 * Body: {
 *   editionId?: string,
 *   templateId?: string,
 *   customData?: CustomData,
 *   subscriberIds?: string[],  // Optional: filter to specific subscribers
 *   emails?: string[],         // Optional: send to ad-hoc email addresses instead of subscribers
 *   provider?: "resend" | "graph"  // Optional: override default provider
 * }
 * - templateId: specific template to use (optional, uses React Email component if omitted)
 * - customData: custom edited data to use (optional, overrides database data)
 * - subscriberIds: send only to these subscriber IDs (optional, sends to all if omitted)
 * - emails: send to these email addresses directly (bypasses subscriber list)
 * - provider: override the default email provider (optional)
 */
export async function POST(request: Request) {
  try {
    const { db, organization } = await requireOrgContext();
    const body = await request.json();
    const { editionId, templateId, customData, subscriberIds, emails, provider } = body;

    // Validate provider if specified
    if (provider && !["resend", "graph"].includes(provider)) {
      return NextResponse.json(
        { success: false, error: "Invalid provider. Must be 'resend' or 'graph'." },
        { status: 400 }
      );
    }

    // Check if specified provider is configured
    if (provider && !isSpecificProviderConfigured(provider)) {
      return NextResponse.json(
        { success: false, error: `Provider '${provider}' is not configured.` },
        { status: 400 }
      );
    }

    // Validate and clean ad-hoc emails if provided
    let validEmails: string[] = [];
    if (emails && Array.isArray(emails) && emails.length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      validEmails = emails
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => emailRegex.test(e));

      if (validEmails.length === 0) {
        return NextResponse.json(
          { success: false, error: "No valid email addresses provided" },
          { status: 400 }
        );
      }
    }

    const useAdHocEmails = validEmails.length > 0;

    // Get edition
    let edition: any;
    let editionArticles: any[] = [];
    let editionProjects: any[] = [];

    if (editionId) {
      edition = await db.edition.findUnique({
        where: { id: editionId },
      });
      if (edition) {
        editionArticles = await prisma.editionArticle.findMany({
          where: { editionId: edition.id },
          include: { article: true },
          orderBy: { order: "asc" },
        });
        editionProjects = await prisma.editionProject.findMany({
          where: { editionId: edition.id },
          include: { project: true },
          orderBy: { order: "asc" },
        });
      }
    } else {
      // Get approved articles and featured projects
      const articles = await db.article.findMany({
        where: { status: "APPROVED" },
        orderBy: [
          { relevanceScore: "desc" },
          { publishedAt: "desc" },
        ],
        take: 10,
      });

      const projects = await db.project.findMany({
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

      // Check if edition exists for this week in this org
      edition = await db.edition.findFirst({
        where: { week, year },
      });

      if (!edition) {
        edition = await db.edition.create({
          data: {
            week,
            year,
            status: "FINALIZED",
            finalizedAt: new Date(),
          } as any,
        });
      }

      // Get existing edition data
      editionArticles = await prisma.editionArticle.findMany({
        where: { editionId: edition.id },
        include: { article: true },
        orderBy: { order: "asc" },
      });
      editionProjects = await prisma.editionProject.findMany({
        where: { editionId: edition.id },
        include: { project: true },
        orderBy: { order: "asc" },
      });

      // Add articles and projects to edition if empty
      if (editionArticles.length === 0) {
        for (let i = 0; i < articles.length; i++) {
          await prisma.editionArticle.create({
            data: {
              editionId: edition.id,
              articleId: articles[i].id,
              order: i,
            },
          });
        }
        editionArticles = await prisma.editionArticle.findMany({
          where: { editionId: edition.id },
          include: { article: true },
          orderBy: { order: "asc" },
        });
      }

      if (editionProjects.length === 0 && projects.length > 0) {
        for (let i = 0; i < projects.length; i++) {
          await prisma.editionProject.create({
            data: {
              editionId: edition.id,
              projectId: projects[i].id,
              order: i,
            },
          });
        }
        editionProjects = await prisma.editionProject.findMany({
          where: { editionId: edition.id },
          include: { project: true },
          orderBy: { order: "asc" },
        });
      }
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

    // Build subscriber filter (only used if not using ad-hoc emails)
    const subscriberFilter: { active: true; id?: { in: string[] } } = { active: true };
    if (subscriberIds && Array.isArray(subscriberIds) && subscriberIds.length > 0) {
      subscriberFilter.id = { in: subscriberIds };
    }

    // Get recipient count
    let recipientCount: number;
    if (useAdHocEmails) {
      recipientCount = validEmails.length;
    } else {
      recipientCount = await db.subscriber.count({
        where: subscriberFilter,
      });

      if (recipientCount === 0) {
        return NextResponse.json(
          {
            success: false,
            error: subscriberIds ? "No matching active subscribers found" : "No active subscribers found",
          },
          { status: 400 }
        );
      }
    }

    // Prepare email data - use custom data if provided, otherwise use edition data
    let emailData: any;
    if (customData) {
      emailData = {
        articles: customData.articles,
        projects: customData.projects.map((p: any) => ({
          ...p,
          projectDate: p.projectDate || new Date().toISOString(),
        })),
        week: customData.week,
        year: customData.year,
        customBlocks: customData.customBlocks,
      };
    } else {
      emailData = {
        articles: editionArticles.map((ea: any) => ({
          id: ea.article.id,
          title: ea.article.title,
          summary: ea.article.summary || "",
          sourceUrl: ea.article.sourceUrl,
          category: ea.article.category,
          relevanceScore: ea.article.relevanceScore,
        })),
        projects: editionProjects.map((ep: any) => ({
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
    }

    console.log(
      `Starting batch send to ${recipientCount} ${useAdHocEmails ? "ad-hoc emails" : "subscribers"} for Week ${emailData.week}, ${emailData.year}...`
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

    // Send to recipients (subscribers or ad-hoc emails)
    let result;

    if (useAdHocEmails) {
      // Send to ad-hoc email addresses
      const html = templateHtml || await renderNewsletterEmail(emailData as any);
      result = await sendToAdHocEmails(
        html,
        emailData,
        edition.id,
        validEmails,
        provider
      );
    } else if (templateHtml) {
      // Use custom template - send directly with pre-rendered HTML
      result = await sendNewsletterWithTemplate(
        templateHtml,
        emailData,
        edition.id,
        subscriberFilter,
        provider
      );
    } else {
      // Use default React Email component
      // If we have custom blocks, render with them
      if (customData?.customBlocks && customData.customBlocks.length > 0) {
        const html = await renderNewsletterEmailWithCustomBlocks(emailData);
        result = await sendNewsletterWithTemplate(
          html,
          emailData,
          edition.id,
          subscriberFilter,
          provider
        );
      } else {
        result = await sendNewsletterToAllWithOptions(emailData, edition.id, subscriberFilter, provider);
      }
    }

    // Mark edition as sent
    if (result.sent > 0) {
      await markEditionAsSent(edition.id);
    }

    return NextResponse.json({
      success: result.success,
      message: `Newsletter sent to ${result.sent}/${result.sent + result.failed} ${useAdHocEmails ? "recipients" : "subscribers"}`,
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

/**
 * Render newsletter email HTML with custom blocks support
 */
async function renderNewsletterEmailWithCustomBlocks(data: any): Promise<string> {
  // For now, render the base email and inject custom blocks
  const baseHtml = await renderNewsletterEmail(data);

  if (!data.customBlocks || data.customBlocks.length === 0) {
    return baseHtml;
  }

  // Inject custom blocks into the HTML
  let html = baseHtml;

  // Group blocks by position
  const blocksByPosition: Record<string, CustomBlock[]> = {};
  for (const block of data.customBlocks) {
    if (!blocksByPosition[block.position]) {
      blocksByPosition[block.position] = [];
    }
    blocksByPosition[block.position].push(block);
  }

  // Render and inject blocks at each position
  for (const [position, blocks] of Object.entries(blocksByPosition)) {
    const blocksHtml = blocks.map(block => {
      if (block.type === 'text') {
        return `
          <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px; border-left: 3px solid #3b82f6;">
            ${block.content}
          </div>
        `;
      } else if (block.type === 'image') {
        return `
          <div style="margin: 24px 0; text-align: center;">
            <img src="${escapeHtml(block.content)}" alt="Custom image" style="max-width: 100%; height: auto; border-radius: 8px;" />
          </div>
        `;
      }
      return '';
    }).join('');

    // Find and inject blocks based on position
    if (position === 'before-articles') {
      html = html.replace(/(<h2[^>]*>.*This Week.*<\/h2>)/i, blocksHtml + '$1');
    } else if (position === 'after-articles' || position === 'before-projects') {
      html = html.replace(/(<h2[^>]*>.*Project.*<\/h2>)/i, blocksHtml + '$1');
    } else if (position === 'after-projects') {
      html = html.replace(/(<div[^>]*style="[^"]*border-top[^"]*"[^>]*>)/i, blocksHtml + '$1');
    }
  }

  return html;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

interface EmailData {
  week: number;
  year: number;
  articles: unknown[];
  projects: unknown[];
}

interface SubscriberFilter {
  active: true;
  id?: { in: string[] };
}

/**
 * Send newsletter to all subscribers using a pre-rendered template HTML
 * Supports filtering by subscriber IDs and overriding the email provider
 */
async function sendNewsletterWithTemplate(
  templateHtml: string,
  data: EmailData,
  editionId: string,
  subscriberFilter: SubscriberFilter = { active: true },
  providerOverride?: "resend" | "graph"
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
    // Get subscribers based on filter
    const subscribers = await prisma.subscriber.findMany({
      where: subscriberFilter,
    });

    const total = subscribers.length;
    console.log(`Sending newsletter with template to ${total} subscribers${providerOverride ? ` via ${providerOverride}` : ""}...`);

    // Get batch settings (use provider-specific settings if provider is overridden)
    const { batchSize, rateLimitDelay } = providerOverride
      ? getProviderSettings()
      : { batchSize: config.email.batchSize, rateLimitDelay: config.email.rateLimitDelay };

    const batches = [];

    for (let i = 0; i < subscribers.length; i += batchSize) {
      batches.push(subscribers.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      // Send all emails in batch concurrently
      const promises = batch.map(async (subscriber) => {
        try {
          // Use provider override if specified, otherwise use default sendEmail
          const emailResult = providerOverride
            ? await sendEmailWithProvider(
                providerOverride,
                subscriber.email,
                `Link AI Newsletter - Week ${data.week}, ${data.year}`,
                templateHtml
              )
            : await sendEmail(
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
                  provider: providerOverride || config.email.provider,
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
          setTimeout(resolve, rateLimitDelay)
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

/**
 * Send newsletter to subscribers with filtering and provider options
 * Wraps sendNewsletterToAll with additional options
 */
async function sendNewsletterToAllWithOptions(
  data: EmailData,
  editionId: string,
  subscriberFilter: SubscriberFilter = { active: true },
  providerOverride?: "resend" | "graph"
): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  errors: string[];
}> {
  // If no special options, use the standard function
  if (!subscriberFilter.id && !providerOverride) {
    return sendNewsletterToAll(data as any, editionId);
  }

  // Otherwise, render the email and use the template sender with options
  const html = await renderNewsletterEmail(data as any);
  return sendNewsletterWithTemplate(html, data, editionId, subscriberFilter, providerOverride);
}

/**
 * Send newsletter to ad-hoc email addresses (not stored as subscribers)
 */
async function sendToAdHocEmails(
  html: string,
  data: EmailData,
  editionId: string,
  emails: string[],
  providerOverride?: "resend" | "graph"
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
    const total = emails.length;
    console.log(`Sending newsletter to ${total} ad-hoc emails${providerOverride ? ` via ${providerOverride}` : ""}...`);

    // Get batch settings
    const { batchSize, rateLimitDelay } = providerOverride
      ? getProviderSettings()
      : { batchSize: config.email.batchSize, rateLimitDelay: config.email.rateLimitDelay };

    const batches: string[][] = [];
    for (let i = 0; i < emails.length; i += batchSize) {
      batches.push(emails.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      const promises = batch.map(async (email) => {
        try {
          const emailResult = providerOverride
            ? await sendEmailWithProvider(
                providerOverride,
                email,
                `Link AI Newsletter - Week ${data.week}, ${data.year}`,
                html
              )
            : await sendEmail(
                email,
                `Link AI Newsletter - Week ${data.week}, ${data.year}`,
                html
              );

          // Note: We don't log email events for ad-hoc sends since the schema requires a subscriber reference
          // The metadata still gets logged via console for debugging

          return emailResult;
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      });

      const results = await Promise.allSettled(promises);

      results.forEach((res, index) => {
        const email = batch[index];
        if (res.status === "fulfilled" && res.value.success) {
          result.sent++;
        } else {
          result.failed++;
          const error =
            res.status === "rejected"
              ? res.reason
              : res.value.error || "Unknown error";
          result.errors.push(`${email}: ${error}`);
        }
      });

      const current = Math.min((batchIndex + 1) * batchSize, total);
      console.log(
        `Batch ${batchIndex + 1}/${batches.length} complete: ${current}/${total} sent`
      );

      if (batchIndex < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, rateLimitDelay));
      }
    }

    console.log(
      `Ad-hoc email sending complete: ${result.sent} sent, ${result.failed} failed`
    );

    return result;
  } catch (error) {
    console.error("Error in ad-hoc email send:", error);
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
