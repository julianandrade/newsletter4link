import { NextResponse } from "next/server";
import { renderNewsletterEmail } from "@/lib/email/sender";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/context";
import type { GeneratedNewsletter } from "@/lib/generation/generator";
import {
  injectCustomBlocks,
  renderTemplateWithData,
  type CustomBlock,
  type TemplateData,
} from "@/lib/email/template-renderer";
import { isBuiltInTemplateId } from "@/lib/email/builtin-template";
import { isoWeekAndYear } from "@/lib/radar/week";
import { editionEmailLabel } from "@/lib/editions/identity";
import {
  frozenAsideFor,
  frozenCustomBlocksFor,
  frozenHtmlFor,
  frozenTemplateIdFor,
  renderSourceFor,
  type RenderSource,
} from "@/lib/editions/sent-snapshot";
import { personalizeHtml } from "@/lib/email/personalize";
import { toEmailAside } from "@/lib/asides/select";
import { readLinkTakesFor } from "@/lib/rewrite/usable";

export const dynamic = "force-dynamic";

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

/** Which of the three bodies a preview of a real edition renders. */
export type PreviewSourceChoice = "frozen" | "approved-draft" | "live";

/**
 * The precedence between the frozen record of a send and an approved draft.
 *
 * Frozen wins, and it wins first. A draft approved after the edition went out would
 * otherwise take the draft branch and pair its titles with categories read from the
 * current article rows, producing the half-frozen edition
 * `lib/editions/sent-snapshot.ts` warns against: historical text, live metadata, and no
 * way for a reader to tell which is which. Once an edition is sent its preview is the
 * record of what went out, full stop.
 *
 * Pure and exported so the ordering is covered without a route harness, which this repo
 * does not have. Keep the handler's branches in this order and reading from this value.
 */
export function previewSourceChoice(input: {
  frozen: boolean;
  approvedDraftSections: number;
}): PreviewSourceChoice {
  if (input.frozen) return "frozen";
  if (input.approvedDraftSections > 0) return "approved-draft";
  return "live";
}

/**
 * POST /api/email/preview
 * Generate preview HTML for the newsletter
 *
 * Body: { editionId?: string, templateId?: string, customData?: CustomData }
 * - editionId: specific edition to preview (optional, uses current approved articles if omitted)
 * - templateId: specific template to use (optional, uses React Email component if omitted)
 * - customData: custom edited data to use for preview (optional, overrides database data)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { editionId, templateId, draftId } = body;
    const customData: CustomData | undefined = body.customData;
    const ctx = await requireOrgContext();

    let emailData: TemplateData;
    // Set only on the real-edition path, so the response can report whether this
    // preview is the frozen record of a send or a live render. Stays null for the
    // customData branch, which has no edition and therefore no snapshot.
    let source: RenderSource | null = null;
    /**
     * What a frozen edition recorded about how it was rendered. The three nullable ones
     * stay null for an edition that was never sent and for the customData branch. The id
     * stays empty on those same paths, and is only read when frozenBytes is non-null,
     * which cannot happen without an edition.
     */
    let frozenBytes: string | null = null;
    let frozenTemplateId: string | null = null;
    let frozenBlocks: unknown[] | null = null;
    let frozenEditionId = "";

    // Use custom data if provided (from editor), otherwise fetch from database
    if (customData) {
      // Using edited data from the email editor
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
      // Get edition (use provided ID or get current)
      let edition;
      if (editionId) {
        edition = await prisma.edition.findFirst({
          where: { id: editionId, organizationId: ctx.organization.id },
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
        // Get approved articles
        const articles = await ctx.db.article.findMany({
          where: { status: "APPROVED" },
          orderBy: [
            { relevanceScore: "desc" },
            // Finding C1: nulls last, so an undated article does not head the list.
            { publishedAt: { sort: "desc", nulls: "last" } },
          ],
          take: 10,
        });

        // Get featured projects
        const projects = await ctx.db.project.findMany({
          where: { featured: true },
          orderBy: { projectDate: "desc" },
          take: 3,
        });

        // Create temporary edition data
        const now = new Date();
        const { week, year } = isoWeekAndYear(now);

        edition = {
          week,
          year,
          // RQ-008: an ad-hoc preview has no edition behind it, so there is no name to
          // show and the label falls back to the week.
          title: null,
          articles: articles.map((article: any, index: number) => ({
            article,
            order: index,
          })),
          projects: projects.map((project: any, index: number) => ({
            project,
            order: index,
          })),
        };
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

      /**
       * A sent edition previews as it was sent.
       *
       * Same reasoning as the subscriber archive: this screen is how an editor checks what
       * went out, and rebuilding it from the current article rows makes it a preview of
       * what would go out today instead. `edition` also covers the ad-hoc, no-editionId
       * case built above from live rows; that object never carries a `sentSnapshot`, so it
       * always resolves to `frozen: false` and the branches below leave it untouched.
       */
      source = renderSourceFor(edition as never);

      /**
       * Lifted out of this block because `edition` is scoped to it and the rendering
       * decisions below are not. All four resolve to their empty value for an edition that
       * was never sent, and for the ad-hoc object built above, which carries no snapshot.
       */
      const snapshot = (edition as never as { sentSnapshot?: unknown }).sentSnapshot;
      frozenBytes = frozenHtmlFor(snapshot);
      frozenTemplateId = frozenTemplateIdFor(snapshot);
      frozenBlocks = frozenCustomBlocksFor(snapshot);
      frozenEditionId = (edition as never as { id?: string }).id ?? "";

      // Draft-aware preview (optional)
      let approvedDraft: { content: GeneratedNewsletter } | null = null;
      if (draftId) {
        const draft = await ctx.db.generationDraft.findUnique({ where: { id: draftId } });
        if (!draft) {
          return NextResponse.json(
            { success: false, error: "Draft not found" },
            { status: 404 }
          );
        }
        approvedDraft = { content: draft.content as unknown as GeneratedNewsletter };
      } else {
        const draft = await ctx.db.generationDraft.findFirst({
          where: { editionId: edition.id, status: "APPROVED" },
          orderBy: { approvedAt: "desc" },
        });
        if (draft) {
          approvedDraft = { content: draft.content as unknown as GeneratedNewsletter };
        }
      }

      // The ordering itself lives in previewSourceChoice, where a unit test can reach it.
      const choice = previewSourceChoice({
        frozen: source.frozen,
        approvedDraftSections: approvedDraft?.content?.sections?.length ?? 0,
      });

      /**
       * Loaded only for flagged stories, and only needed by the two branches that render
       * live rows. A frozen edition previews the take it actually sent, from the snapshot,
       * not a take regenerated since.
       */
      const flaggedIds = edition.articles
        .filter((ea: any) => ea.useLinkTake)
        .map((ea: any) => ea.article.id);
      const takes = await readLinkTakesFor(ctx.db, flaggedIds);

      if (choice === "frozen") {
        emailData = {
          // Template's Article requires summary as string | null; SourceArticle
          // leaves it optional, so the shape needs pinning down field by field.
          articles: source.articles.map((article) => ({
            title: article.title,
            summary: article.summary ?? null,
            sourceUrl: article.sourceUrl,
            category: article.category,
            relevanceScore: article.relevanceScore,
            content: article.content,
            linkTake: article.linkTake,
          })),
          projects: source.projects,
          week: source.week,
          year: source.year,
          label: source.label,
        };
      } else if (choice === "approved-draft" && approvedDraft?.content?.sections) {
        const articleById = new Map(
          edition.articles.map((ea: any) => [ea.article.id, ea.article])
        );
        const draftArticles = approvedDraft.content.sections.flatMap((section) =>
          section.articles.map((article) => {
            const matched = articleById.get(article.id);
            return {
              title: article.title,
              summary: article.summary,
              sourceUrl: article.sourceUrl,
              category: matched?.category || [],
              linkTake: takes.get(article.id) ?? null,
            };
          })
        );

        emailData = {
          articles: draftArticles,
          projects: edition.projects.map((ep: any) => ({
            name: ep.project.name,
            description: ep.project.description,
            team: ep.project.team,
            impact: ep.project.impact,
            projectDate: ep.project.projectDate instanceof Date
              ? ep.project.projectDate.toISOString()
              : String(ep.project.projectDate),
          })),
          week: edition.week,
          year: edition.year,
          // RQ-008: the edition names itself in the eyebrow and the subject.
          label: editionEmailLabel({
            title: edition.title,
            week: edition.week,
          }),
        };
      } else {
        // Prepare data for email
        emailData = {
          articles: edition.articles.map((ea: any) => ({
            title: ea.article.title,
            summary: ea.article.summary || "",
            sourceUrl: ea.article.sourceUrl,
            category: ea.article.category,
            linkTake: takes.get(ea.article.id) ?? null,
          })),
          projects: edition.projects.map((ep: any) => ({
            name: ep.project.name,
            description: ep.project.description,
            team: ep.project.team,
            impact: ep.project.impact,
            projectDate: ep.project.projectDate instanceof Date
              ? ep.project.projectDate.toISOString()
              : String(ep.project.projectDate),
          })),
          week: edition.week,
          year: edition.year,
          label: editionEmailLabel({
            title: edition.title,
            week: edition.week,
          }),
        };
      }

      /**
       * The closing block, from the same place the rest of the body came from.
       *
       * A sent edition previews the aside it actually sent, frozen in the snapshot, for
       * the same reason it previews the articles it sent: this screen is how an editor
       * checks what went out, and the row can have been edited or retired since. A draft
       * edition previews the row it currently points at.
       */
      const frozenAside = frozenAsideFor(
        (edition as never as { sentSnapshot?: unknown }).sentSnapshot
      );

      if (choice === "frozen" && frozenAside) {
        emailData.oneMoreThing = frozenAside;
      } else if (!source.frozen && edition?.asideId) {
        const aside = await ctx.db.aside.findUnique({ where: { id: edition.asideId } });
        if (aside) emailData.oneMoreThing = toEmailAside(aside);
      }
    }

    // Render HTML - use custom template if specified, otherwise use React Email component
    let html: string;
    let usedTemplate: { id: string; name: string } | null = null;

    /**
     * A hand-edited send previews as the bytes that went out.
     *
     * Same reasoning as the subscriber archive: no article list reproduces a frame somebody
     * arranged in the editor, so re-rendering here would show a different newsletter than
     * the one delivered. The three subscriber-bound tags are resolved to their unsigned
     * form, which is correct for a preview: there is no subscriber to sign for.
     */
    if (frozenBytes) {
      return NextResponse.json({
        success: true,
        html: personalizeHtml(frozenBytes, {
          subscriberId: "",
          editionId: frozenEditionId,
        }),
        data: emailData,
        template: null,
        frozen: true,
      });
    }

    /**
     * RQ-003: honour which template is active.
     *
     * A send that names no template used the built-in edition unconditionally,
     * which is why the "Use this one" switch on the Templates screen did
     * nothing. The active stored template now wins; the built-in is used when
     * none is active, and when the built-in is explicitly named.
     */
    let effectiveTemplateId: string | null = templateId ?? null;

    /**
     * A sent edition keeps the frame it was sent in.
     *
     * The snapshot records which template rendered it, and until now nothing read that
     * back: switching the active template silently re-framed every past edition's preview,
     * so the screen showed a newsletter nobody ever received. An explicit `templateId` on
     * the request still wins, which is what lets someone ask how an old edition would look
     * in a new template.
     */
    if (!effectiveTemplateId && source?.frozen) {
      effectiveTemplateId = frozenTemplateId;
    }

    if (!effectiveTemplateId && !source?.frozen) {
      const active = await ctx.db.emailTemplate.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      effectiveTemplateId = active?.id ?? null;
    }
    if (isBuiltInTemplateId(effectiveTemplateId)) {
      effectiveTemplateId = null;
    }

    const template = effectiveTemplateId
      ? await prisma.emailTemplate.findUnique({
          where: { id: effectiveTemplateId },
          select: { id: true, name: true, html: true },
        })
      : null;

    /**
     * A named template that does not exist is an error. A recorded one that has since been
     * deleted is not: templates are hard-deletable while inactive, so a sent edition can
     * outlive the template that framed it, and answering 404 would make an old edition
     * unpreviewable for ever. It falls through to the built-in instead.
     */
    if (effectiveTemplateId && !template && !source?.frozen) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 }
      );
    }

    if (template) {
      // Replace placeholders in template HTML with actual data
      html = renderTemplateWithData(template.html, emailData);
      usedTemplate = { id: template.id, name: template.name };
    } else {
      // The built-in AI Radar edition, with any custom blocks placed at the
      // template's anchor points. A frozen edition uses the blocks it was sent with:
      // the snapshot carries them, and re-rendering without them showed an edition
      // missing content the recipients actually got.
      html = injectCustomBlocks(
        await renderNewsletterEmail(emailData),
        emailData.customBlocks ?? (frozenBlocks as never)
      );
    }

    return NextResponse.json({
      success: true,
      html,
      data: emailData,
      template: usedTemplate,
      // So the screen can label the preview "as sent" rather than implying it is live.
      frozen: source?.frozen ?? false,
    });
  } catch (error) {
    console.error("Error generating preview:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
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

