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
import { editionLabel } from "@/lib/editions/identity";

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
    const { editionId, templateId, customData, draftId } = body;
    const ctx = await requireOrgContext();

    let emailData: TemplateData;

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

      if (approvedDraft?.content?.sections?.length) {
        const articleById = new Map(
          edition.articles.map((ea: any) => [ea.article.id, ea.article])
        );
        const draftArticles = approvedDraft.content.sections.flatMap((section) =>
          section.articles.map((article) => {
            const source = articleById.get(article.id);
            return {
              title: article.title,
              summary: article.summary,
              sourceUrl: article.sourceUrl,
              category: source?.category || [],
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
          label: editionLabel({
            title: edition.title,
            week: edition.week,
            year: edition.year,
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
          label: editionLabel({
            title: edition.title,
            week: edition.week,
            year: edition.year,
          }),
        };
      }
    }

    // Render HTML - use custom template if specified, otherwise use React Email component
    let html: string;
    let usedTemplate: { id: string; name: string } | null = null;

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
      const active = await ctx.db.emailTemplate.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      effectiveTemplateId = active?.id ?? null;
    }
    if (isBuiltInTemplateId(effectiveTemplateId)) {
      effectiveTemplateId = null;
    }

    if (effectiveTemplateId) {
      // Use a custom database template
      const template = await prisma.emailTemplate.findUnique({
        where: { id: effectiveTemplateId },
        select: { id: true, name: true, html: true },
      });

      if (!template) {
        return NextResponse.json(
          { success: false, error: "Template not found" },
          { status: 404 }
        );
      }

      // Replace placeholders in template HTML with actual data
      html = renderTemplateWithData(template.html, emailData);
      usedTemplate = { id: template.id, name: template.name };
    } else {
      // The built-in AI Radar edition, with any custom blocks placed at the
      // template's anchor points.
      html = injectCustomBlocks(
        await renderNewsletterEmail(emailData),
        emailData.customBlocks
      );
    }

    return NextResponse.json({
      success: true,
      html,
      data: emailData,
      template: usedTemplate,
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

