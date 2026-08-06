import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import {
  editionLabel,
  editionWriteFields,
  type EditionKind,
} from "@/lib/editions/identity";

export const dynamic = "force-dynamic";

const ARCHIVED_MODES = ["exclude", "only", "all"] as const;
type ArchivedMode = (typeof ARCHIVED_MODES)[number];

const KINDS: EditionKind[] = ["WEEKLY", "SPECIAL"];
const MAX_TITLE = 120;

export interface EditionCreateInput {
  title: string | null;
  publishDate: Date;
  kind: EditionKind;
  autoPopulate: boolean;
}

export type ParsedCreate =
  | { ok: true; value: EditionCreateInput }
  | { ok: false; error: string };

/**
 * RQ-008: what creating an edition needs, validated apart from the request.
 *
 * The old route required `week` and `year` as numbers between 1 and 53 and 2000 and
 * 2100, which is why nothing could ask for a special edition: the two required fields
 * were the identity, and the identity was a week. A date and an optional name replace
 * them, and the week is read off the date by `editionWriteFields`.
 */
export function parseEditionCreate(body: unknown): ParsedCreate {
  const input = (body ?? {}) as Record<string, unknown>;

  const rawDate = input.publishDate;
  const publishDate =
    typeof rawDate === "string" || typeof rawDate === "number"
      ? new Date(rawDate)
      : null;

  if (!publishDate || Number.isNaN(publishDate.getTime())) {
    return {
      ok: false,
      error: "publishDate is required, as an ISO date such as 2026-08-10",
    };
  }

  const rawKind = input.kind ?? "WEEKLY";
  if (typeof rawKind !== "string" || !KINDS.includes(rawKind as EditionKind)) {
    return { ok: false, error: "kind must be WEEKLY or SPECIAL" };
  }
  const kind = rawKind as EditionKind;

  const rawTitle = typeof input.title === "string" ? input.title.trim() : "";
  if (rawTitle.length > MAX_TITLE) {
    return { ok: false, error: `title must be ${MAX_TITLE} characters or fewer` };
  }
  const title = rawTitle.length > 0 ? rawTitle : null;

  /**
   * A special edition has to be named. Without a title it falls back to the same week
   * label as the weekly edition beside it, so the two would be indistinguishable in
   * every list on every screen.
   */
  if (kind === "SPECIAL" && title === null) {
    return {
      ok: false,
      error:
        "a special edition needs a title, so it can be told apart from the weekly one",
    };
  }

  return {
    ok: true,
    value: {
      title,
      publishDate,
      kind,
      autoPopulate: input.autoPopulate !== false,
    },
  };
}

/**
 * GET /api/editions?archived=exclude|only|all
 *
 * Get all editions with article/project counts, sorted by year desc, week desc
 * (tenant-scoped).
 *
 * RQ-005 action 8: `archive` sets `archivedAt`, and until this filter existed
 * nothing read it, so archiving an edition changed nothing anyone could see. The
 * default is `exclude`, which is what makes archive a way of putting an old
 * edition away rather than a flag with no effect.
 *
 * An unrecognized value is a 400 rather than a silent fall back to the default: a
 * caller that asked for `only` and quietly received the live list would show
 * exactly the rows it meant to hide.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const requested =
      new URL(request.url).searchParams.get("archived") ?? "exclude";

    if (!ARCHIVED_MODES.includes(requested as ArchivedMode)) {
      return NextResponse.json(
        {
          success: false,
          error: `archived must be one of ${ARCHIVED_MODES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const archived = requested as ArchivedMode;

    const where =
      archived === "exclude"
        ? { archivedAt: null }
        : archived === "only"
          ? { archivedAt: { not: null } }
          : {};

    const editions = await db.edition.findMany({
      where,
      /**
       * RQ-008: the publication date is the order, not the week.
       *
       * A special edition has a week like everything else, but two editions can now
       * share one, so week/year alone no longer produces a stable order. createdAt
       * breaks the tie between two editions dated the same day.
       */
      orderBy: [
        { publishDate: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        _count: {
          select: {
            articles: true,
            projects: true,
          },
        },
      },
    });

    // Transform to include count in a cleaner format
    const editionsWithCounts = editions.map((edition: any) => ({
      id: edition.id,
      week: edition.week,
      year: edition.year,
      // RQ-008: the edition's own identity. `label` is derived once here so no screen
      // has to reimplement the title-or-week-label fallback rule.
      title: edition.title,
      kind: edition.kind,
      publishDate: edition.publishDate,
      label: editionLabel(edition),
      status: edition.status,
      scheduledDate: edition.scheduledDate,
      finalizedAt: edition.finalizedAt,
      sentAt: edition.sentAt,
      archivedAt: edition.archivedAt,
      // RQ-005 BR-011: who approved the send, so a sent edition can answer it.
      approvedAt: edition.approvedAt,
      approvedByEmail: edition.approvedByEmail,
      generatedContent: edition.generatedContent,
      generatedAt: edition.generatedAt,
      createdAt: edition.createdAt,
      updatedAt: edition.updatedAt,
      articleCount: edition._count?.articles ?? 0,
      projectCount: edition._count?.projects ?? 0,
      // SharePoint fields
      sharePointUrl: edition.sharePointUrl,
      sharePointPublishedAt: edition.sharePointPublishedAt,
      sharePointError: edition.sharePointError,
    }));

    return NextResponse.json({
      success: true,
      data: editionsWithCounts,
      count: editionsWithCounts.length,
    });
  } catch (error) {
    console.error("Error fetching editions:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
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

/**
 * POST /api/editions
 *
 * Create an edition from a publication date and, optionally, a name (tenant-scoped).
 * Approved articles and featured projects are pulled in unless the caller opts out.
 *
 * RQ-008: this took `week` and `year` as required numbers, which is what made a special
 * edition impossible to ask for. The week is read off the date now.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const body = await request.json();
    const parsed = parseEditionCreate(body);

    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 }
      );
    }

    const fields = editionWriteFields({
      publishDate: parsed.value.publishDate,
      kind: parsed.value.kind,
    });

    /**
     * RQ-008: only a weekly edition can collide, and the database is what refuses it.
     *
     * The old route did a findFirst on week and year and answered 409 from that, which
     * cannot be right under concurrency and is now also wrong in meaning: two editions
     * sharing a week is the point. A special edition holds a null slot and is never
     * refused. This read is a courtesy that produces a sentence a person can act on;
     * the unique index is what actually guarantees it.
     */
    if (fields.weeklySlot) {
      const clash = await db.edition.findFirst({
        where: { weeklySlot: fields.weeklySlot },
        select: { id: true, week: true, year: true },
      });

      if (clash) {
        return NextResponse.json(
          {
            success: false,
            error: `The weekly edition for week ${clash.week} of ${clash.year} already exists. Create a special edition to add another for the same week.`,
            editionId: clash.id,
          },
          { status: 409 }
        );
      }
    }

    // RQ-008: the columns come from identity.ts, which is the only thing that may write
    // week, year and weeklySlot.
    const edition = await db.edition.create({
      data: {
        ...fields,
        title: parsed.value.title,
        status: "DRAFT",
      } as any,
    });

    let articlesAdded = 0;
    let projectsAdded = 0;

    // Auto-populate with approved articles and featured projects if requested
    if (parsed.value.autoPopulate) {
      // Get approved articles not yet in any edition, sorted by relevance
      const approvedArticles = await db.article.findMany({
        where: {
          status: "APPROVED",
          editions: {
            none: {},
          },
        },
        orderBy: [
          { relevanceScore: "desc" },
          { publishedAt: "desc" },
        ],
        take: 10, // Limit to 10 articles
      });

      // Add articles to edition
      if (approvedArticles.length > 0) {
        await db.editionArticle.createMany({
          data: approvedArticles.map((article, index) => ({
            editionId: edition.id,
            articleId: article.id,
            order: index + 1,
          })),
        });
        articlesAdded = approvedArticles.length;
      }

      // Get featured projects not yet in any edition
      const featuredProjects = await db.project.findMany({
        where: {
          featured: true,
          editions: {
            none: {},
          },
        },
        orderBy: { projectDate: "desc" },
        take: 5, // Limit to 5 projects
      });

      // Add projects to edition
      if (featuredProjects.length > 0) {
        await db.editionProject.createMany({
          data: featuredProjects.map((project, index) => ({
            editionId: edition.id,
            projectId: project.id,
            order: index + 1,
          })),
        });
        projectsAdded = featuredProjects.length;
      }
    }

    // Fetch the complete edition with counts
    const completeEdition = await db.edition.findUnique({
      where: { id: edition.id },
      include: {
        _count: {
          select: {
            articles: true,
            projects: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          ...completeEdition,
          label: completeEdition ? editionLabel(completeEdition) : null,
          articleCount: (completeEdition as any)?._count?.articles ?? 0,
          projectCount: (completeEdition as any)?._count?.projects ?? 0,
        },
        message: parsed.value.autoPopulate
          ? `Edition created with ${articlesAdded} articles and ${projectsAdded} projects`
          : "Edition created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating edition:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
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
