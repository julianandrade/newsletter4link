import { editionEmailLabel } from "@/lib/editions/identity";
import type { SourceArticle, SourceProject } from "@/lib/email/edition-data";

/**
 * What actually went out, frozen at the send.
 *
 * Every surface that shows a sent edition used to rebuild it from the current `Article`
 * rows: `app/editions/[id]/page.tsx`, the dashboard preview, and the send route itself.
 * Editing a summary after a send therefore rewrote the newsletter subscribers had already
 * received, and deleting an article removed the story from it, because
 * `EditionArticle.article` cascades. That made "let me edit and delete articles freely"
 * and "let me see what we actually sent" mutually exclusive. This is the record that
 * separates them.
 *
 * Data rather than HTML, deliberately. The three subscriber-bound URLs are resolved per
 * recipient inside the send loop (`lib/email/personalize.ts`), so a stored HTML string
 * would either be one recipient's copy or a shell needing a second personalisation path
 * to maintain. Storing the renderer's input keeps one path and one template.
 *
 * Pure on purpose: no Prisma, no fetch. The send route builds one, `lib/queries.ts`
 * writes it, and the read surfaces choose between it and the live rows.
 */

/**
 * Bumped only if the stored shape changes in a way a reader must notice.
 *
 * Deliberately still 1 after `customBlocks` and `frozenHtml` were added: both are optional
 * and every reader treats absence as "this send had none", which is the right answer for a
 * snapshot written before they existed. A bump would imply older records need handling
 * they do not need.
 */
export const SENT_SNAPSHOT_VERSION = 1;

export interface SentSnapshotArticle {
  title: string;
  summary: string | null;
  sourceUrl: string;
  category: string[];
  relevanceScore: number | null;
  /** Only the lead's is read, to find the top story's image. See content-image.ts. */
  content: string | null;
}

export interface SentSnapshotProject {
  name: string;
  description: string;
  team: string;
  impact: string | null;
  /** ISO 8601. A Date does not survive a Json column. */
  projectDate: string | null;
}

export interface SentSnapshot {
  version: number;
  articles: SentSnapshotArticle[];
  projects: SentSnapshotProject[];
  week: number;
  year: number;
  /** What the email called this edition, as the masthead and subject printed it. */
  label: string;
  /** The subject line as sent, so the history does not have to re-derive it. */
  subject: string;
  /**
   * Which stored template rendered it. Null means the built-in edition.
   *
   * Read back when previewing a frozen edition that names no template of its own, so a
   * sent edition keeps the frame it was sent in rather than borrowing whichever template
   * happens to be active today. An explicit `templateId` on the request still wins, which
   * is what lets someone ask "how would this edition look in the new template".
   */
  templateId: string | null;
  /**
   * Blocks the editor injected on top of the rendered template, when the send carried
   * custom data. Absent on every other send.
   */
  customBlocks?: unknown[] | null;
  /**
   * The finished HTML, for a send that was hand-edited in the Unlayer editor.
   *
   * The rest of this record is data, deliberately, so the three subscriber-bound URLs can
   * resolve per reader at read time. That works because data re-renders. Hand-edited HTML
   * does not: no article list reproduces a frame somebody moved around by hand, so for
   * that one path the bytes are the only faithful record.
   *
   * Still carries `{{unsubscribe_url}}`, `{{archive_url}}` and `{{portal_url}}` unresolved,
   * exactly as the send loop received it, so a reader personalises it the same way the
   * send did. Storing it already resolved would hand every later reader the first
   * recipient's signed links.
   */
  frozenHtml?: string | null;
}

export interface BuildSnapshotInput {
  articles: Array<Partial<SourceArticle> & { title: string; sourceUrl: string }>;
  projects: Array<Partial<SourceProject> & { name: string; description: string }>;
  week: number;
  year: number;
  label: string;
  subject: string;
  templateId: string | null;
  customBlocks?: unknown[] | null;
  frozenHtml?: string | null;
}

function toSnapshotArticle(
  article: BuildSnapshotInput["articles"][number]
): SentSnapshotArticle {
  return {
    title: article.title,
    summary: article.summary ?? null,
    sourceUrl: article.sourceUrl,
    category: article.category ?? [],
    relevanceScore: article.relevanceScore ?? null,
    content: article.content ?? null,
  };
}

function toSnapshotProject(
  project: BuildSnapshotInput["projects"][number]
): SentSnapshotProject {
  const date = project.projectDate;

  return {
    name: project.name,
    description: project.description,
    team: project.team ?? "",
    impact: project.impact ?? null,
    projectDate:
      date instanceof Date ? date.toISOString() : typeof date === "string" ? date : null,
  };
}

export function buildSentSnapshot(input: BuildSnapshotInput): SentSnapshot {
  return {
    version: SENT_SNAPSHOT_VERSION,
    articles: input.articles.map(toSnapshotArticle),
    projects: input.projects.map(toSnapshotProject),
    week: input.week,
    year: input.year,
    label: input.label,
    subject: input.subject,
    templateId: input.templateId,
    // Null rather than absent, so a reader can tell "this send had none" from an older
    // snapshot written before these two existed.
    customBlocks: input.customBlocks?.length ? input.customBlocks : null,
    frozenHtml: input.frozenHtml || null,
  };
}

/**
 * The finished bytes a sent edition should be shown as, when there are any.
 *
 * Only a hand-edited send has them. Every other sent edition re-renders from the snapshot's
 * data, which is the arrangement that lets one template change reach the archive.
 *
 * The caller still has to personalise what comes back: the three subscriber-bound tags are
 * deliberately left standing in the stored bytes.
 */
export function frozenHtmlFor(sentSnapshot: unknown): string | null {
  if (!isSentSnapshot(sentSnapshot)) return null;
  const html = sentSnapshot.frozenHtml;
  return typeof html === "string" && html.trim().length > 0 ? html : null;
}

/** The template a frozen edition was sent in, or null for the built-in one. */
export function frozenTemplateIdFor(sentSnapshot: unknown): string | null {
  if (!isSentSnapshot(sentSnapshot)) return null;
  return typeof sentSnapshot.templateId === "string" ? sentSnapshot.templateId : null;
}

/** Blocks the editor injected on top of the template, for a frozen edition. */
export function frozenCustomBlocksFor(sentSnapshot: unknown): unknown[] | null {
  if (!isSentSnapshot(sentSnapshot)) return null;
  const blocks = sentSnapshot.customBlocks;
  return Array.isArray(blocks) && blocks.length > 0 ? blocks : null;
}

/**
 * Whether a value read back out of the `Json` column is one of ours.
 *
 * The column is nullable and untyped. Null is the honest answer for every edition sent
 * before this existed, and those must keep rendering from the live rows rather than
 * throwing, so this is a guard and not a parser.
 *
 * An empty `articles` array is refused as well as a non-array one. A snapshot with no
 * stories is indistinguishable from a failed write, and falling back to the live rows is
 * strictly better than rendering an empty edition.
 */
export function isSentSnapshot(value: unknown): value is SentSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const candidate = value as Partial<SentSnapshot>;

  return (
    typeof candidate.version === "number" &&
    Array.isArray(candidate.articles) &&
    candidate.articles.length > 0 &&
    Array.isArray(candidate.projects) &&
    typeof candidate.week === "number" &&
    typeof candidate.year === "number"
  );
}

export interface RenderSourceEdition {
  sentSnapshot: unknown;
  title: string | null;
  week: number;
  year: number;
  articles: Array<{
    article: {
      title: string;
      summary: string | null;
      sourceUrl: string;
      category: string[];
      relevanceScore: number | null;
      content?: string | null;
    };
  }>;
  projects: Array<{
    project: {
      name: string;
      description: string;
      team: string;
      impact: string | null;
      /**
       * Optional because most callers do not select it. The snapshot always keeps it, so
       * a caller that does select it gets the same field on both paths instead of a date
       * that appears only on sent editions.
       */
      projectDate?: string | Date | null;
    };
  }>;
}

export interface RenderSource {
  articles: SourceArticle[];
  projects: SourceProject[];
  week: number;
  year: number;
  label: string;
  /** True when this came from the snapshot, so a screen can say "as sent". */
  frozen: boolean;
}

/**
 * Which copy of an edition a render should use.
 *
 * The snapshot wins whenever there is one. There is no merging: a half-frozen edition,
 * where the titles are historical and the summaries current, is worse than either.
 */
export function renderSourceFor(edition: RenderSourceEdition): RenderSource {
  const snapshot = edition.sentSnapshot;

  if (isSentSnapshot(snapshot)) {
    return {
      articles: snapshot.articles.map((article) => ({
        title: article.title,
        summary: article.summary,
        sourceUrl: article.sourceUrl,
        category: article.category,
        relevanceScore: article.relevanceScore,
        content: article.content,
      })),
      projects: snapshot.projects.map((project) => ({
        name: project.name,
        description: project.description,
        team: project.team,
        impact: project.impact,
        ...(project.projectDate ? { projectDate: project.projectDate } : {}),
      })),
      week: snapshot.week,
      year: snapshot.year,
      label: snapshot.label,
      frozen: true,
    };
  }

  return {
    articles: edition.articles.map((row) => ({
      title: row.article.title,
      summary: row.article.summary,
      sourceUrl: row.article.sourceUrl,
      category: row.article.category,
      relevanceScore: row.article.relevanceScore,
      content: row.article.content ?? null,
    })),
    projects: edition.projects.map((row) => ({
      name: row.project.name,
      description: row.project.description,
      team: row.project.team,
      impact: row.project.impact,
      ...(row.project.projectDate ? { projectDate: row.project.projectDate } : {}),
    })),
    week: edition.week,
    year: edition.year,
    label: editionEmailLabel({ title: edition.title, week: edition.week }),
    frozen: false,
  };
}
