import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { deleteNeverSentEditions } from "@/lib/editions/lifecycle";
import { editionLabel, editionWriteFields } from "@/lib/editions/identity";
import { EditionStatus, Prisma } from "@prisma/client";

const MAX_TITLE = 120;

export interface EditionPatchInput {
  /** Absent leaves the name alone. Null clears it back to the derived week label. */
  title?: string | null;
  publishDate?: Date;
}

export type ParsedPatch =
  | { ok: true; value: EditionPatchInput }
  | { ok: false; error: string };

/**
 * RQ-008: the name and the date an editor may change on an unsent edition.
 *
 * Absent and null are kept apart deliberately. Every screen that sends a partial PATCH
 * omits the fields it is not touching, so treating an omitted title as "clear it" would
 * erase the name on every reorder.
 */
export function parseEditionPatch(body: unknown): ParsedPatch {
  const input = (body ?? {}) as Record<string, unknown>;
  const value: EditionPatchInput = {};

  if ("title" in input) {
    const raw = input.title;

    if (raw !== null && typeof raw !== "string") {
      return { ok: false, error: "title must be a string or null" };
    }

    const trimmed = typeof raw === "string" ? raw.trim() : "";

    if (trimmed.length > MAX_TITLE) {
      return { ok: false, error: `title must be ${MAX_TITLE} characters or fewer` };
    }

    value.title = trimmed.length > 0 ? trimmed : null;
  }

  if ("publishDate" in input) {
    const raw = input.publishDate;
    const parsed =
      typeof raw === "string" || typeof raw === "number" ? new Date(raw) : null;

    if (!parsed || Number.isNaN(parsed.getTime())) {
      return {
        ok: false,
        error: "publishDate must be an ISO date such as 2026-08-10",
      };
    }

    value.publishDate = parsed;
  }

  return { ok: true, value };
}

/**
 * RQ-005 conflict C2: these three handlers used bare prisma with no auth call at
 * all, so any authenticated request could read, modify or delete another
 * organization's edition by id. They now go through requireOrgContext and the
 * tenant client, and an edition outside the caller's organization answers 404:
 * never 403, and never the row.
 */

const ARTICLE_FIELDS = {
  id: true,
  title: true,
  sourceUrl: true,
  author: true,
  publishedAt: true,
  capturedAt: true,
  relevanceScore: true,
  summary: true,
  category: true,
  status: true,
} as const;

const PROJECT_FIELDS = {
  id: true,
  name: true,
  description: true,
  team: true,
  projectDate: true,
  impact: true,
  imageUrl: true,
  featured: true,
} as const;

const EDITION_INCLUDE = {
  articles: {
    include: { article: { select: ARTICLE_FIELDS } },
    orderBy: { order: "asc" },
  },
  projects: {
    include: { project: { select: PROJECT_FIELDS } },
    orderBy: { order: "asc" },
  },
} satisfies Prisma.EditionInclude;

type EditionWithContents = Prisma.EditionGetPayload<{
  include: typeof EDITION_INCLUDE;
}>;

function transformEdition(edition: EditionWithContents) {
  return {
    id: edition.id,
    week: edition.week,
    year: edition.year,
    // RQ-008: the edition's own identity, and the label derived from it once.
    title: edition.title,
    kind: edition.kind,
    publishDate: edition.publishDate,
    label: editionLabel(edition),
    status: edition.status,
    finalizedAt: edition.finalizedAt,
    sentAt: edition.sentAt,
    createdAt: edition.createdAt,
    updatedAt: edition.updatedAt,
    editorDesignJson: edition.editorDesignJson,
    templateId: edition.templateId,
    // RQ-005 action 8 and BR-011: the archive marker and the approval record
    // travel with the edition, so a screen never has to guess either.
    archivedAt: edition.archivedAt,
    approvedAt: edition.approvedAt,
    approvedByEmail: edition.approvedByEmail,
    // SharePoint fields
    sharePointUrl: edition.sharePointUrl,
    sharePointPageId: edition.sharePointPageId,
    sharePointPublishedAt: edition.sharePointPublishedAt,
    sharePointError: edition.sharePointError,
    articles: edition.articles.map((ea) => ({
      ...ea.article,
      order: ea.order,
    })),
    projects: edition.projects.map((ep) => ({
      ...ep.project,
      order: ep.order,
    })),
    articleCount: edition.articles.length,
    projectCount: edition.projects.length,
  };
}

/**
 * RQ-005 AC-2.10 and AC-6.7: a refusal on a sent edition says it was already
 * sent, by whom, and when, rather than just refusing.
 */
function alreadySentMessage(edition: {
  sentAt: Date | null;
  approvedAt: Date | null;
  approvedByEmail: string | null;
}): string {
  const when = edition.approvedAt ?? edition.sentAt;
  const date = when
    ? when.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const who = edition.approvedByEmail;

  if (date && who) return `This edition was already sent on ${date} by ${who}`;
  if (date) return `This edition was already sent on ${date}`;
  return "This edition was already sent";
}

function errorResponse(error: unknown, fallback: string) {
  console.error(fallback, error);

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

  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

/**
 * GET /api/editions/:id
 * Edition details with full article and project data, for this organization only.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requireOrgContext();
    const { id } = await params;

    // The tenant wrapper's generic does not carry `include` through to the
    // return type, which is why the other edition routes reach for `any` here.
    // A cast to the payload keeps the transform typed instead.
    const edition = (await db.edition.findFirst({
      where: { id },
      include: EDITION_INCLUDE,
    })) as EditionWithContents | null;

    if (!edition) {
      return NextResponse.json(
        { success: false, error: "Edition not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: transformEdition(edition),
    });
  } catch (error) {
    return errorResponse(error, "Failed to load the edition");
  }
}

/**
 * PATCH /api/editions/:id
 * Update the edition's status, articles, projects or design. EDITOR or above.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");
    const { db } = ctx;

    const { id } = await params;
    const body = await request.json();
    const { status, articles, projects, editorDesignJson, templateId } = body;

    const existingEdition = await db.edition.findFirst({ where: { id } });

    if (!existingEdition) {
      return NextResponse.json(
        { success: false, error: "Edition not found" },
        { status: 404 }
      );
    }

    // RQ-005 AC-6.7: a sent edition cannot be changed, and the refusal says who
    // approved it and when. 409 rather than 400: the request is well formed, the
    // edition's state is what refuses it.
    if (existingEdition.sentAt || existingEdition.status === "SENT") {
      return NextResponse.json(
        { success: false, error: alreadySentMessage(existingEdition) },
        { status: 409 }
      );
    }

    /**
     * RQ-008: the name and the date, on an edition that has not gone out.
     *
     * The kind never changes here, and that is deliberate: turning a weekly into a
     * special would free its slot and let the schedule create a second weekly for a week
     * that already had one, which is the one thing the slot exists to prevent.
     */
    const patch = parseEditionPatch(body);

    if (!patch.ok) {
      return NextResponse.json(
        { success: false, error: patch.error },
        { status: 400 }
      );
    }

    const updateData: Prisma.EditionUpdateInput = {};

    if (editorDesignJson !== undefined) {
      updateData.editorDesignJson =
        editorDesignJson === null ? Prisma.JsonNull : editorDesignJson;
    }
    if (templateId !== undefined) {
      updateData.templateId = templateId;
    }

    if (patch.value.title !== undefined) {
      updateData.title = patch.value.title;
    }

    /**
     * Rescheduling rewrites the derived week, year and slot through
     * `editionWriteFields`, so moving a weekly edition across a week boundary moves its
     * slot with it. Writing publishDate alone would leave the cache pointing at the old
     * week and the slot claiming a week the edition no longer belongs to.
     */
    if (patch.value.publishDate) {
      const fields = editionWriteFields({
        publishDate: patch.value.publishDate,
        kind: existingEdition.kind,
      });

      updateData.publishDate = fields.publishDate;
      updateData.week = fields.week;
      updateData.year = fields.year;
      updateData.weeklySlot = fields.weeklySlot;
    }

    if (status !== undefined) {
      if (!["DRAFT", "FINALIZED", "SENT"].includes(status)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid status. Must be DRAFT, FINALIZED, or SENT",
          },
          { status: 400 }
        );
      }

      updateData.status = status as EditionStatus;

      // existingEdition.status is DRAFT or FINALIZED here: SENT returned above.
      if (status === "FINALIZED" && existingEdition.status === "DRAFT") {
        updateData.finalizedAt = new Date();
      } else if (status === "SENT") {
        updateData.sentAt = new Date();
        if (!existingEdition.finalizedAt) {
          updateData.finalizedAt = new Date();
        }
      } else if (status === "DRAFT") {
        updateData.finalizedAt = null;
      }
    }

    // Article and project ids are validated tenant-scoped, before the
    // transaction, so a cross-tenant id cannot be written into a join row.
    let articleRows: Array<{ articleId: string; order: number }> | null = null;

    if (articles !== undefined) {
      if (!Array.isArray(articles)) {
        return NextResponse.json(
          { success: false, error: "Articles must be an array" },
          { status: 400 }
        );
      }

      const articleIds = articles.map((a: { articleId: string }) => a.articleId);
      const found = await db.article.findMany({
        where: { id: { in: articleIds } },
        select: { id: true },
      });
      const foundIds = new Set(found.map((a) => a.id));
      const missing = articleIds.filter((articleId: string) => !foundIds.has(articleId));

      if (missing.length > 0) {
        return NextResponse.json(
          { success: false, error: `Articles not found: ${missing.join(", ")}` },
          { status: 404 }
        );
      }

      articleRows = articles.map(
        (a: { articleId: string; order?: number }, index: number) => ({
          articleId: a.articleId,
          order: a.order ?? index + 1,
        })
      );
    }

    let projectRows: Array<{ projectId: string; order: number }> | null = null;

    if (projects !== undefined) {
      if (!Array.isArray(projects)) {
        return NextResponse.json(
          { success: false, error: "Projects must be an array" },
          { status: 400 }
        );
      }

      const projectIds = projects.map((p: { projectId: string }) => p.projectId);
      const found = await db.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true },
      });
      const foundIds = new Set(found.map((p) => p.id));
      const missing = projectIds.filter((projectId: string) => !foundIds.has(projectId));

      if (missing.length > 0) {
        return NextResponse.json(
          { success: false, error: `Projects not found: ${missing.join(", ")}` },
          { status: 404 }
        );
      }

      projectRows = projects.map(
        (p: { projectId: string; order?: number }, index: number) => ({
          projectId: p.projectId,
          order: p.order ?? index + 1,
        })
      );
    }

    /**
     * A weekly edition moved onto a week that already has one is refused by name rather
     * than by a Prisma error reaching the screen as "Unique constraint failed". Scoped to
     * this organization by the tenant client, and excluding this edition so that saving
     * a reschedule that does not move the week is not a collision with itself.
     */
    if (typeof updateData.weeklySlot === "string") {
      const clash = await db.edition.findFirst({
        where: { weeklySlot: updateData.weeklySlot, id: { not: id } },
        select: { week: true, year: true },
      });

      if (clash) {
        return NextResponse.json(
          {
            success: false,
            error: `Week ${clash.week} of ${clash.year} already has a weekly edition. Move this one to another week, or make it a special edition.`,
          },
          { status: 409 }
        );
      }
    }

    const updatedEdition = await db.$raw.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.edition.update({
          where: { id, organizationId: db.organizationId },
          data: updateData,
        });
      }

      if (articleRows) {
        await tx.editionArticle.deleteMany({ where: { editionId: id } });

        if (articleRows.length > 0) {
          await tx.editionArticle.createMany({
            data: articleRows.map((row) => ({ ...row, editionId: id })),
          });
        }
      }

      if (projectRows) {
        await tx.editionProject.deleteMany({ where: { editionId: id } });

        if (projectRows.length > 0) {
          await tx.editionProject.createMany({
            data: projectRows.map((row) => ({ ...row, editionId: id })),
          });
        }
      }

      return tx.edition.findUnique({ where: { id }, include: EDITION_INCLUDE });
    });

    if (!updatedEdition) {
      return NextResponse.json(
        { success: false, error: "Failed to update edition" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: transformEdition(updatedEdition),
      message: "Edition updated successfully",
    });
  } catch (error) {
    return errorResponse(error, "Failed to update the edition");
  }
}

/**
 * DELETE /api/editions/:id
 *
 * RQ-005 AC-8.4 and AC-8.8: delete covers anything that was never sent,
 * finalized drafts included, and it removes that edition's delivery events in
 * the same transaction. This route had the hole D5 exists to close: it deleted
 * the edition and left EmailEvent rows pointing at nothing.
 *
 * A sent edition is refused here. Archive keeps it, and force delete, for an
 * OWNER, goes through PATCH /api/editions/bulk with one id.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");
    const { db } = ctx;

    const { id } = await params;

    const edition = await db.edition.findFirst({ where: { id } });

    if (!edition) {
      return NextResponse.json(
        { success: false, error: "Edition not found" },
        { status: 404 }
      );
    }

    // Keys on sentAt rather than on status, which is conflict C4: a finalized
    // edition that never went out has no delivery history to preserve.
    if (edition.sentAt) {
      return NextResponse.json(
        {
          success: false,
          error: `${alreadySentMessage(
            edition
          )}, so it is archived rather than deleted. An OWNER can force delete it, which also destroys its delivery history.`,
        },
        { status: 409 }
      );
    }

    const result = await deleteNeverSentEditions(db, [id]);

    if (result.editions === 0) {
      return NextResponse.json(
        { success: false, error: "Edition not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Edition deleted successfully",
      deletedEvents: result.events,
    });
  } catch (error) {
    return errorResponse(error, "Failed to delete the edition");
  }
}
