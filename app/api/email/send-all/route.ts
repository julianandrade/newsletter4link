import { NextResponse } from "next/server";
import {
  sendNewsletterToAll,
  sendEmail,
  renderNewsletterEmail,
  newsletterSubject,
} from "@/lib/email/sender";
import { prisma } from "@/lib/db";
import { markEditionAsSent } from "@/lib/queries";
import {
  renderTemplateById,
  injectCustomBlocks,
  type CustomBlock,
} from "@/lib/email/template-renderer";
import { isBuiltInTemplateId } from "@/lib/email/builtin-template";
import { config } from "@/lib/config";
import { sendEmailWithProvider, isSpecificProviderConfigured, getProviderSettings } from "@/lib/email/provider";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { publishToSharePoint, isSharePointConfigured } from "@/lib/sharepoint";
import type { GeneratedNewsletter } from "@/lib/generation/generator";
import { isoWeekAndYear, isoWeekStart } from "@/lib/radar/week";
import {
  editionEmailLabel,
  editionWriteFields,
  weeklySlotFor,
} from "@/lib/editions/identity";
import { personalizeHtml } from "@/lib/email/personalize";
import { buildSentSnapshot } from "@/lib/editions/sent-snapshot";
import { toEmailAside } from "@/lib/asides/select";
import { markAsideUsed } from "@/lib/asides/mark-used";
import type { EmailAside, EmailLinkTake } from "@/lib/email/edition-template";
import { readLinkTakesFor } from "@/lib/rewrite/usable";
import { linkTakeReadiness, linkTakeBlockReason } from "@/lib/editions/link-take-readiness";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

export type SendRenderChoice = "hand-edited" | "stored-template" | "built-in";

/**
 * Which HTML a send goes out as, and which template the snapshot should record.
 *
 * Extracted so a unit test can reach it, for one specific reason: the defect this replaces
 * was `customHtml` arriving on the request body and never being destructured, so every
 * hand-edited send silently delivered the built-in edition instead. Nothing failed, and no
 * test could have noticed. A rule that lives in a pure function can be asserted; a rule
 * that lives in a destructuring statement cannot.
 *
 * Hand-edited bytes win over everything. They are the stored template, already rendered and
 * then rearranged by hand, so falling back to re-rendering the template would throw away
 * the edit the sender just made.
 */
export function sendRenderChoice(input: {
  customHtml: unknown;
  effectiveTemplateId: string | null;
}): {
  use: SendRenderChoice;
  /** The hand-edited bytes, narrowed to a string here so no caller has to cast. */
  html: string | null;
  snapshotTemplateId: string | null;
} {
  if (typeof input.customHtml === "string" && input.customHtml.trim().length > 0) {
    // Null template on this path: no stored template framed what actually went out.
    return { use: "hand-edited", html: input.customHtml, snapshotTemplateId: null };
  }
  if (input.effectiveTemplateId) {
    return {
      use: "stored-template",
      html: null,
      snapshotTemplateId: input.effectiveTemplateId,
    };
  }
  return { use: "built-in", html: null, snapshotTemplateId: null };
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
    const ctx = await requireOrgContext();
    const { db } = ctx;

    // RQ-005 BR-011: this route mails every active subscriber, so membership alone
    // is not enough to reach it. It previously required only that the caller belong
    // to the organization, which let a VIEWER send the newsletter.
    requireRole(ctx, "EDITOR");

    const body = await request.json();
    const {
      editionId,
      templateId,
      customHtml,
      subscriberIds,
      emails,
      provider,
      draftId,
    } = body;
    const customData: CustomData | undefined = body.customData;

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
          // Finding C1: nulls last, so an undated article does not head the list.
          { publishedAt: { sort: "desc", nulls: "last" } },
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
      const { week, year } = isoWeekAndYear(now);

      /**
       * RQ-008: found by its weekly slot, not by the week columns.
       *
       * The lookup and the write both have to use the slot. A create that left
       * `weeklySlot` null would not collide with anything, so the weekly schedule would
       * happily add a second weekly edition for a week this route had already sent.
       */
      const slot = weeklySlotFor(week, year);

      edition = await db.edition.findFirst({
        where: { weeklySlot: slot },
      });

      if (!edition) {
        edition = await db.edition.create({
          data: {
            ...editionWriteFields({
              publishDate: isoWeekStart(week, year),
              kind: "WEEKLY",
            }),
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

    // Resolve approved draft if any exist
    let approvedDraft: { id: string; content: GeneratedNewsletter } | null = null;
    const draftCount = await db.generationDraft.count({
      where: { editionId: edition.id },
    });

    if (draftId) {
      const draft = await db.generationDraft.findUnique({ where: { id: draftId } });
      if (!draft || draft.status !== "APPROVED") {
        return NextResponse.json(
          { success: false, error: "Approved draft not found" },
          { status: 400 }
        );
      }
      approvedDraft = { id: draft.id, content: draft.content as unknown as GeneratedNewsletter };
    } else if (draftCount > 0) {
      const draft = await db.generationDraft.findFirst({
        where: { editionId: edition.id, status: "APPROVED" },
        orderBy: { approvedAt: "desc" },
      });

      if (!draft) {
        return NextResponse.json(
          { success: false, error: "No approved draft found. Approve a draft first." },
          { status: 400 }
        );
      }

      approvedDraft = { id: draft.id, content: draft.content as unknown as GeneratedNewsletter };
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

    /**
     * Loaded only for flagged stories, so an edition with nothing flagged issues no extra
     * query. `customData` carries no article ids at all, so this has nothing to attach to on
     * that path, and does not even ask: only the draft and default branches below use it.
     */
    const takes: Map<string, EmailLinkTake> = customData
      ? new Map()
      : await readLinkTakesFor(
          db,
          editionArticles.filter((row) => row.useLinkTake).map((row) => row.articleId)
        );

    /**
     * A flag is a promise. `customData` carries no edition article rows at all, so there is
     * nothing here to check on that branch: an editor who hand-edits the payload is not
     * choosing to flag a story, and `takes` above is deliberately empty for that path.
     */
    if (!customData) {
      const readiness = linkTakeReadiness(
        editionArticles.map((row) => ({
          articleId: row.articleId,
          title: row.article.title,
          useLinkTake: row.useLinkTake,
          hasUsableTake: takes.has(row.articleId),
        }))
      );

      if (!readiness.ready) {
        // 409, not 400 and not 500. The request is well formed and nothing broke on our side:
        // the edition is in a state that forbids sending, and the fix is one toggle away.
        return NextResponse.json(
          { success: false, error: linkTakeBlockReason(readiness) },
          { status: 409 }
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
    } else if (approvedDraft?.content?.sections?.length) {
      const articleById = new Map(
        editionArticles.map((ea) => [ea.article.id, ea.article])
      );

      const draftArticles = approvedDraft.content.sections.flatMap((section) =>
        section.articles.map((article) => {
          const source = articleById.get(article.id);
          return {
            id: article.id,
            title: article.title,
            summary: article.summary,
            sourceUrl: article.sourceUrl,
            category: source?.category || [],
            linkTake: takes.get(article.id) ?? null,
          };
        })
      );

      emailData = {
        articles: draftArticles,
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
        // RQ-008: the edition names itself in the eyebrow and the subject. The email's label
        // carries no year, because the masthead prints it beside the week's date range.
        label: editionEmailLabel(edition),
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
          // Only the lead's is read, to find the top story's image. See content-image.ts.
          content: ea.article.content,
          linkTake: takes.get(ea.article.id) ?? null,
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
        label: editionEmailLabel(edition),
      };
    }

    /**
     * The closing block belongs to the edition, not to whichever of the three branches
     * above produced the body, so it is attached once here rather than in each of them.
     *
     * Read through the tenant client, so an asideId pointing at another organization's row
     * resolves to null rather than sending it.
     */
    let sentAside: EmailAside | null = null;
    if (edition?.asideId) {
      const aside = await db.aside.findUnique({ where: { id: edition.asideId } });
      if (aside) {
        sentAside = toEmailAside(aside);
        emailData.oneMoreThing = sentAside;
      }
    }

    console.log(
      `Starting batch send to ${recipientCount} ${useAdHocEmails ? "ad-hoc emails" : "subscribers"} for Week ${emailData.week}, ${emailData.year}...`
    );

    // Check if using a custom template
    let templateHtml: string | null = null;
    /**
     * RQ-003: honour which template is active.
     *
     * A send that names no template used the built-in edition unconditionally,
     * which is why the "Use this one" switch on the Templates screen did
     * nothing. The active stored template now wins; the built-in is used when
     * none is active, and when the built-in is explicitly named.
     */
    let effectiveTemplateId: string | null = templateId ?? null;
    if (!effectiveTemplateId) {
      const active = await db.emailTemplate.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      effectiveTemplateId = active?.id ?? null;
    }
    if (isBuiltInTemplateId(effectiveTemplateId)) {
      effectiveTemplateId = null;
    }

    /**
     * The rule itself lives in sendRenderChoice, where a unit test can reach it.
     *
     * Hand-edited HTML arrives with the three subscriber-bound tags still standing, so it
     * takes exactly the same path a stored template's HTML takes and is personalised per
     * recipient inside the batch loop.
     */
    const choice = sendRenderChoice({ customHtml, effectiveTemplateId });

    if (choice.html) {
      templateHtml = choice.html;
    } else if (choice.use === "stored-template" && effectiveTemplateId) {
      // keepPerRecipient: the three signed URLs stay as merge tags here and are resolved once
      // per subscriber inside the batch loop. Rendering them now would give every recipient
      // the same links, which is the bug this replaces.
      const templateResult = await renderTemplateById(effectiveTemplateId, emailData, {
        keepPerRecipient: true,
      });
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
      // Send to ad-hoc email addresses. Still keepPerRecipient, so sendToAdHocEmails can run
      // the same substitution with no subscriber and get unsigned URLs.
      const html =
        templateHtml ||
        (await renderNewsletterEmail(emailData as any, undefined, undefined, {
          keepPerRecipient: true,
        }));
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
        const html = injectCustomBlocks(
          await renderNewsletterEmail(emailData as any, undefined, undefined, {
            keepPerRecipient: true,
          }),
          customData.customBlocks
        );
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

    // Mark edition and draft as sent/used
    if (result.sent > 0) {
      /**
       * The snapshot is built from `emailData`, which is exactly what the renderer was
       * given, whichever of the three branches above produced it: custom data from the
       * editor, an approved draft, or the edition's own rows. Rebuilding it from the
       * database here would record something other than what went out on two of those
       * three paths.
       */
      const snapshot = buildSentSnapshot({
        articles: emailData.articles ?? [],
        projects: emailData.projects ?? [],
        week: emailData.week,
        year: emailData.year,
        label: emailData.label ?? `Week ${emailData.week}`,
        subject: newsletterSubject(emailData as any),
        templateId: choice.snapshotTemplateId,
        customBlocks: emailData.customBlocks ?? null,
        /**
         * The bytes, but only for the one path whose data cannot reproduce them. A frame
         * somebody rearranged by hand is not recoverable from an article list, so the
         * archive would otherwise show a different newsletter than the one delivered.
         */
        frozenHtml: choice.html,
        /**
         * Frozen, rather than left to be followed through `Edition.asideId` later. The row
         * can be edited or retired after the send, and the archive has to show what was
         * actually delivered.
         */
        aside: sentAside,
      });

      // RQ-005 BR-011: a sent edition must be able to say who approved the send
      // and when. The columns existed and nothing wrote them, so every edition
      // sent so far answers "unknown". Written in the same step that marks it
      // sent, and only if it is not already set, because an approval is a fact
      // about the first send rather than the latest one.
      await markEditionAsSent(edition.id, snapshot);
      await db.edition.updateMany({
        where: { id: edition.id, approvedAt: null },
        data: {
          approvedAt: new Date(),
          approvedByEmail: ctx.membership.email,
          approvedById: ctx.membership.supabaseUserId,
        },
      });
      if (approvedDraft) {
        await db.generationDraft.update({
          where: { id: approvedDraft.id },
          data: { status: "USED" },
        });
      }

      /**
       * After the snapshot, not before: a send that dies between choosing and delivering
       * must not burn the aside. Choosing one in the picker does not touch this either,
       * or the least-recently-used ordering would reshuffle every time somebody browsed.
       */
      await markAsideUsed(db, edition.asideId);
    }

    // Publish to SharePoint (non-blocking - don't fail email send if SharePoint fails)
    let sharePointResult = null;
    if (result.sent > 0 && !useAdHocEmails && isSharePointConfigured()) {
      try {
        sharePointResult = await publishToSharePoint(edition.id);
        if (sharePointResult.success) {
          console.log(`SharePoint: Published to ${sharePointResult.sharePointUrl}`);
        } else {
          console.warn(`SharePoint publish failed: ${sharePointResult.error}`);
        }
      } catch (spError) {
        console.error("SharePoint publish error (non-fatal):", spError);
      }
    }

    return NextResponse.json({
      success: result.success,
      message: `Newsletter sent to ${result.sent}/${result.sent + result.failed} ${useAdHocEmails ? "recipients" : "subscribers"}`,
      data: {
        sent: result.sent,
        failed: result.failed,
        errors: result.errors.slice(0, 10), // Return first 10 errors
        sharePoint: sharePointResult ? {
          published: sharePointResult.success,
          url: sharePointResult.sharePointUrl,
          error: sharePointResult.error,
        } : null,
      },
    });
  } catch (error) {
    console.error("Error sending newsletter:", error);

    // A refused caller is 401 or 403, not 500. Every failure here used to come
    // back as a server error carrying the thrown message, which told the client
    // it could retry and told a log reader nothing about what actually happened.
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
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
          /**
           * The signed links are resolved here, per subscriber, and nowhere earlier.
           *
           * templateHtml arrives with {{unsubscribe_url}}, {{archive_url}} and {{portal_url}}
           * still standing. Before this, the same finished string went to everyone, so every
           * recipient got the generic unsubscribe page rather than their own signed link.
           */
          const html = personalizeHtml(templateHtml, {
            subscriberId: subscriber.id,
            editionId,
          });

          // Use provider override if specified, otherwise use default sendEmail
          const emailResult = providerOverride
            ? await sendEmailWithProvider(
                providerOverride,
                subscriber.email,
                newsletterSubject(data as any),
                html
              )
            : await sendEmail(
                subscriber.email,
                newsletterSubject(data as any),
                html
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

  // Otherwise, render the email and use the template sender with options. keepPerRecipient,
  // because this path also fanned one identical string out to every subscriber: whenever a
  // subscriber filter or a provider override was in play, the built-in edition lost its signed
  // unsubscribe link the same way a stored template did.
  const html = await renderNewsletterEmail(data as any, undefined, undefined, {
    keepPerRecipient: true,
  });
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

    /**
     * Resolved once, not per recipient: an ad-hoc address has no subscriber row, so all of
     * these get the same unsigned URLs. The archive page answers 404 for an unsigned link,
     * which is correct, because an ad-hoc recipient has no archive to read.
     */
    const adHocHtml = personalizeHtml(html, { subscriberId: "", editionId });

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      const promises = batch.map(async (email) => {
        try {
          const emailResult = providerOverride
            ? await sendEmailWithProvider(
                providerOverride,
                email,
                newsletterSubject(data as any),
                adHocHtml
              )
            : await sendEmail(
                email,
                newsletterSubject(data as any),
                adHocHtml
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
