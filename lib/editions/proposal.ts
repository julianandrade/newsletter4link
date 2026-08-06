/**
 * RQ-005 action 1: the week's proposal.
 *
 * The product should open on a candidate edition rather than on a "create
 * edition" button, so this module assembles one from the organization's own
 * approved articles and its high-scoring pending ones, keeps it current, and
 * reports what the week actually held.
 *
 * It proposes and it never sends. Nothing here imports `lib/email/`, nothing
 * writes `status: "FINALIZED"` or `status: "SENT"`, and nothing records an
 * approval. That is BR-011 and decision D1, and a reviewer should be able to
 * confirm it by grep alone.
 *
 * Two shapes to note:
 *
 * - The assembly is pure, in the style of `lib/trends/compute.ts`: it takes a
 *   fetched list and returns a decision, so the ranking rules can be tested
 *   without a database.
 * - This module imports nothing that opens a connection pool and nothing that
 *   reads a clock. `lib/db` is a type import only. RQ-008 added one runtime
 *   import, `lib/editions/identity.ts`, which is pure arithmetic over a date it
 *   is given: it never calls `isoWeekAndYear()` without an argument, so no
 *   ambient clock arrives with it. This module still does not ask what week it
 *   is, and AC-1.8 still holds: `lib/radar/week.ts` is the one helper that
 *   answers that question, the week is passed in by the caller, and the two
 *   routes in this unit both ask it.
 */

import type { Prisma } from "@prisma/client";
import type { TenantClient } from "@/lib/db/tenant";
import {
  editionLabel,
  editionWriteFields,
  weeklySlotFor,
} from "@/lib/editions/identity";
import { bestKnownDate } from "@/lib/articles/date";

/** RQ-005 section 2.2 of the specification: product-owner defaults. */
export const PROPOSAL_ARTICLE_TARGET = 10;
export const PROPOSAL_PROJECT_TARGET = 5;
export const THIN_ARTICLE_THRESHOLD = 5; // fewer than this reads as a light week

/**
 * Mirrors `OrgSettings.relevanceThreshold`'s schema default. Used only when an
 * organization has no settings row yet, so a missing row never means "let
 * everything through".
 */
export const DEFAULT_RELEVANCE_THRESHOLD = 6.0;

/** How many rows the candidate query reads. Ranking is score first, so a deeper
 *  read cannot change the top ten, and the cap keeps the daily job bounded. */
const CANDIDATE_FETCH_LIMIT = 200;

// ---------------------------------------------------------------------------
// The week, supplied by the caller
// ---------------------------------------------------------------------------

/**
 * RQ-005 AC-1.8: the ISO week the proposal belongs to, resolved once by
 * `lib/radar/week.ts` and handed in, so the schedule and the screen cannot
 * disagree about which week is current.
 */
export interface ProposalWeek {
  week: number;
  year: number;
  /** Monday 00:00 UTC of that week, the left edge of the counting window. */
  startsAt: Date;
}

// ---------------------------------------------------------------------------
// The assembly, pure
// ---------------------------------------------------------------------------

export type CandidateStatus = "PENDING_REVIEW" | "APPROVED";

export interface Candidate {
  id: string;
  relevanceScore: number | null;
  /**
   * Non-null on purpose, even though the column is nullable now.
   *
   * Ranking needs a date for every candidate or the tie-break is undefined, so the
   * fallback to `capturedAt` is applied at the boundary that builds these rows and the
   * ranking rules stay pure. See `lib/articles/date.ts`.
   */
  publishedAt: Date;
  createdAt: Date;
  status: CandidateStatus;
}

export interface ProjectCandidate {
  id: string;
  projectDate: Date;
  createdAt: Date;
}

/**
 * RQ-005 AC-1.2, AC-1.7: score first, then recency. Never below the threshold,
 * never padded to look full.
 *
 * An `APPROVED` article qualifies whatever its score, because a person already
 * decided it. A `PENDING_REVIEW` article qualifies only at or above the
 * organization's threshold, and a null score never clears it: an unscored
 * article has not been judged, so it cannot be treated as if it had passed.
 */
export function rankCandidates(
  candidates: Candidate[],
  options: { threshold: number; target: number }
): Candidate[] {
  const { threshold, target } = options;

  const seen = new Set<string>();
  const qualifying: Candidate[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    if (!qualifies(candidate, threshold)) continue;
    seen.add(candidate.id);
    qualifying.push(candidate);
  }

  return qualifying
    .sort((a, b) => {
      // An approved article without a score sorts last rather than first.
      const scoreA = a.relevanceScore ?? Number.NEGATIVE_INFINITY;
      const scoreB = b.relevanceScore ?? Number.NEGATIVE_INFINITY;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    })
    // The cap is the only thing that shortens the list. Nothing lengthens it:
    // a week with two qualifying articles yields two (AC-1.7).
    .slice(0, Math.max(0, target));
}

function qualifies(candidate: Candidate, threshold: number): boolean {
  if (candidate.status === "APPROVED") return true;
  if (candidate.relevanceScore === null) return false;
  return candidate.relevanceScore >= threshold;
}

/** RQ-005 AC-1.6. */
export function isThinProposal(articleCount: number): boolean {
  return articleCount < THIN_ARTICLE_THRESHOLD;
}

export interface TopUpPlan {
  add: string[];
  /** The `order` the first added row takes. */
  startOrder: number;
}

/**
 * RQ-005 action 1: a top-up adds, it never removes and never re-adds.
 *
 * Only candidates collected after the last refresh are considered, so an
 * article an editor took out of the proposal stays out (AC-6.2). Order
 * continues after the current maximum rather than after the current count,
 * because a removal leaves a gap and reusing a number would reorder the rows
 * that are still there (AC-6.3).
 */
export function planTopUp(input: {
  existingArticleIds: string[];
  candidates: Candidate[];
  refreshedAt: Date | null;
  /** Highest `order` currently in the proposal, or null when it is empty. */
  currentMaxOrder?: number | null;
  threshold: number;
  target: number;
}): TopUpPlan {
  const { existingArticleIds, candidates, refreshedAt, threshold, target } = input;

  const existing = new Set(existingArticleIds);
  const room = Math.max(0, target - existing.size);
  const startOrder = (input.currentMaxOrder ?? existingArticleIds.length) + 1;

  if (room === 0) return { add: [], startOrder };

  const fresh = candidates.filter(
    (candidate) =>
      !existing.has(candidate.id) &&
      (refreshedAt === null || candidate.createdAt.getTime() > refreshedAt.getTime())
  );

  return {
    add: rankCandidates(fresh, { threshold, target: room }).map((c) => c.id),
    startOrder,
  };
}

/**
 * RQ-005 AC-1.2: up to five projects, newest first, under the same "adds only"
 * rule as the articles. A project an editor removed is not put back, because
 * only projects created since the last refresh are considered.
 */
export function planProjectTopUp(input: {
  existingProjectIds: string[];
  candidates: ProjectCandidate[];
  refreshedAt: Date | null;
  currentMaxOrder?: number | null;
  target: number;
}): TopUpPlan {
  const { existingProjectIds, candidates, refreshedAt, target } = input;

  const existing = new Set(existingProjectIds);
  const room = Math.max(0, target - existing.size);
  const startOrder = (input.currentMaxOrder ?? existingProjectIds.length) + 1;

  if (room === 0) return { add: [], startOrder };

  const add = candidates
    .filter(
      (candidate) =>
        !existing.has(candidate.id) &&
        (refreshedAt === null || candidate.createdAt.getTime() > refreshedAt.getTime())
    )
    .sort((a, b) => b.projectDate.getTime() - a.projectDate.getTime())
    .slice(0, room)
    .map((candidate) => candidate.id);

  return { add, startOrder };
}

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

export interface ProposalArticle {
  id: string;
  title: string;
  sourceUrl: string;
  author: string | null;
  /** Null when nobody told us, which a digest never does. Finding C1. */
  publishedAt: string | null;
  /** Always known. What to show, and to label as a capture, when the above is null. */
  capturedAt: string;
  relevanceScore: number | null;
  summary: string | null;
  category: string[];
  status: string;
  order: number;
}

export interface ProposalProject {
  id: string;
  name: string;
  description: string;
  team: string;
  projectDate: string;
  impact: string | null;
  imageUrl: string | null;
  order: number;
}

/** RQ-005 AC-1.5: the numbers a business user reads without hovering. */
export interface ProposalCounts {
  collected: number;
  rejected: number;
  belowThreshold: number;
  inProposal: number;
  approvedWaiting: number;
  pending: number;
}

export interface ProposalPayload {
  proposal: {
    id: string;
    week: number;
    year: number;
    /** RQ-008: the edition's own name, null on a weekly. */
    title: string | null;
    kind: "WEEKLY" | "SPECIAL";
    publishDate: string;
    /** The title, or the week label when there is none. */
    label: string;
    status: string;
    thin: boolean;
    archivedAt: string | null;
    sentAt: string | null;
    approvedAt: string | null;
    approvedByEmail: string | null;
    articles: ProposalArticle[];
    projects: ProposalProject[];
  };
  counts: ProposalCounts;
  recipients: { active: number };
  assembly: {
    assembled: boolean;
    /** Articles that clear the bar right now, whether or not they are in. */
    candidates: number;
    thin: boolean;
    refreshedAt: string | null;
  };
}

// ---------------------------------------------------------------------------
// Reads and writes, all through the tenant client
// ---------------------------------------------------------------------------

/** Prisma's unique violation, matched on the code rather than on the error
 *  class, so this module needs no runtime import of the generated client. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export interface EnsureResult {
  id: string;
  week: number;
  year: number;
  created: boolean;
}

/**
 * RQ-005 AC-1.1, AC-1.3, AC-1.4: one proposal per organization per week,
 * created without anyone asking, and never two.
 *
 * The unique `@@unique([weeklySlot, organizationId])` is what makes a collision
 * impossible. A weekly edition's slot is derived from its week, a special edition's
 * is null, and Postgres treats nulls in a unique index as distinct, so this
 * constraint binds the schedule without binding anything else: RQ-008 needed a week
 * to be able to hold a special edition too, which the old `[week, year,
 * organizationId]` index forbade.
 *
 * The tenant client adds `organizationId` to `create` but not to `where`, so the key
 * is passed in full, and a concurrent create is answered by re-reading the row that
 * won rather than by an error reaching the screen.
 */
export async function ensureProposal(
  db: TenantClient,
  week: ProposalWeek
): Promise<EnsureResult> {
  const { week: weekNumber, year, startsAt } = week;
  const slot = weeklySlotFor(weekNumber, year);

  const existing = await db.edition.findFirst({
    where: { weeklySlot: slot },
    select: { id: true },
  });
  if (existing) return { id: existing.id, week: weekNumber, year, created: false };

  /**
   * RQ-008: the weekly edition's publication date is the Monday of its week.
   *
   * `startsAt` is already that Monday, computed by `isoWeekStart` and handed in by the
   * caller, so the schedule and this write cannot disagree about which day the week
   * begins on.
   */
  const fields = editionWriteFields({ publishDate: startsAt, kind: "WEEKLY" });

  try {
    const created = await db.edition.upsert({
      where: {
        weeklySlot_organizationId: {
          weeklySlot: slot,
          organizationId: db.organizationId,
        },
      },
      // organizationId is deliberately absent: the tenant client injects it.
      create: { ...fields, status: "DRAFT" } as unknown as Prisma.EditionCreateInput,
      update: {},
      select: { id: true },
    });
    return { id: created.id, week: weekNumber, year, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    // Another request, or the schedule, created it between the read and the
    // write. The proposal for the week is theirs and ours, so use it (AC-1.3).
    const raced = await db.edition.findFirst({
      where: { weeklySlot: slot },
      select: { id: true },
    });
    if (!raced) throw error;
    return { id: raced.id, week: weekNumber, year, created: false };
  }
}

export interface RefreshResult {
  added: number;
  projectsAdded: number;
  articleCount: number;
  thin: boolean;
  /** Why nothing was done, when nothing was done. */
  skipped: "not-found" | "not-draft" | null;
}

/**
 * RQ-005 action 1: keep the proposal current without undoing editorial work.
 *
 * It appends and it never removes, it never lowers the threshold and it never
 * pads (D2, AC-1.7). A proposal that is not a draft is left alone: a finalized
 * or sent edition is a record of what went out.
 */
export async function refreshProposal(
  db: TenantClient,
  editionId: string,
  now: Date = new Date()
): Promise<RefreshResult> {
  const edition = await db.edition.findUnique({ where: { id: editionId } });
  if (!edition) {
    return { added: 0, projectsAdded: 0, articleCount: 0, thin: true, skipped: "not-found" };
  }

  const existingArticles = await readEditionArticleRows(db, editionId);
  const existingProjects = await readEditionProjectRows(db, editionId);

  if (edition.status !== "DRAFT") {
    return {
      added: 0,
      projectsAdded: 0,
      articleCount: existingArticles.length,
      thin: isThinProposal(existingArticles.length),
      skipped: "not-draft",
    };
  }

  const threshold = await readRelevanceThreshold(db);
  const refreshedAt = edition.proposalRefreshedAt;

  const articlePlan = planTopUp({
    existingArticleIds: existingArticles.map((row) => row.articleId),
    candidates: await readArticleCandidates(db, threshold, refreshedAt),
    refreshedAt,
    currentMaxOrder: maxOrder(existingArticles),
    threshold,
    target: PROPOSAL_ARTICLE_TARGET,
  });

  if (articlePlan.add.length > 0) {
    await db.editionArticle.createMany({
      data: articlePlan.add.map((articleId, index) => ({
        editionId,
        articleId,
        order: articlePlan.startOrder + index,
      })),
      skipDuplicates: true,
    });
  }

  const projectPlan = planProjectTopUp({
    existingProjectIds: existingProjects.map((row) => row.projectId),
    candidates: await readProjectCandidates(db, refreshedAt),
    refreshedAt,
    currentMaxOrder: maxOrder(existingProjects),
    target: PROPOSAL_PROJECT_TARGET,
  });

  if (projectPlan.add.length > 0) {
    await db.editionProject.createMany({
      data: projectPlan.add.map((projectId, index) => ({
        editionId,
        projectId,
        order: projectPlan.startOrder + index,
      })),
      skipDuplicates: true,
    });
  }

  // Recorded even when nothing was added: the next top-up must only consider
  // what arrives after this moment, or an article an editor removed comes back.
  await db.edition.update({
    where: { id: editionId },
    data: { proposalRefreshedAt: now },
  });

  const articleCount = existingArticles.length + articlePlan.add.length;

  return {
    added: articlePlan.add.length,
    projectsAdded: projectPlan.add.length,
    articleCount,
    thin: isThinProposal(articleCount),
    skipped: null,
  };
}

/** The payload behind `GET /api/editions/proposal`. */
export async function readProposal(
  db: TenantClient,
  editionId: string,
  window: { startsAt: Date; now: Date }
): Promise<ProposalPayload> {
  const edition = await db.edition.findUnique({ where: { id: editionId } });
  if (!edition) throw new Error(`Proposal ${editionId} not found`);

  const threshold = await readRelevanceThreshold(db);
  const collectedInWeek = { gte: window.startsAt, lte: window.now };

  const [articleRows, projectRows] = await Promise.all([
    readEditionArticles(db, editionId),
    readEditionProjects(db, editionId),
  ]);

  const [
    collected,
    rejected,
    belowThreshold,
    approvedWaiting,
    pending,
    candidates,
    activeRecipients,
  ] = await Promise.all([
    db.article.count({ where: { createdAt: collectedInWeek } }),
    db.article.count({ where: { status: "REJECTED", createdAt: collectedInWeek } }),
    // Unscored counts as below the bar: nothing judged it, so it did not pass.
    db.article.count({
      where: {
        status: "PENDING_REVIEW",
        createdAt: collectedInWeek,
        OR: [{ relevanceScore: null }, { relevanceScore: { lt: threshold } }],
      },
    }),
    db.article.count({ where: { status: "APPROVED", editions: { none: {} } } }),
    db.article.count({ where: { status: "PENDING_REVIEW" } }),
    db.article.count({
      where: {
        OR: [
          { status: "APPROVED" },
          { status: "PENDING_REVIEW", relevanceScore: { gte: threshold } },
        ],
      },
    }),
    db.subscriber.count({ where: { active: true } }),
  ]);

  const thin = isThinProposal(articleRows.length);

  return {
    proposal: {
      id: edition.id,
      week: edition.week,
      year: edition.year,
      // RQ-008: the edition's own identity, and the label derived from it once here so
      // no screen reimplements the title-or-week fallback.
      title: edition.title,
      kind: edition.kind,
      publishDate: edition.publishDate.toISOString(),
      label: editionLabel(edition),
      status: edition.status,
      thin,
      // RQ-005 AC-2.6: the approval record unit A added, so a sent edition can
      // always answer who approved it and when.
      archivedAt: iso(edition.archivedAt),
      sentAt: iso(edition.sentAt),
      approvedAt: iso(edition.approvedAt),
      approvedByEmail: edition.approvedByEmail,
      articles: articleRows,
      projects: projectRows,
    },
    counts: {
      collected,
      rejected,
      belowThreshold,
      inProposal: articleRows.length,
      approvedWaiting,
      pending,
    },
    recipients: { active: activeRecipients },
    assembly: {
      assembled: articleRows.length > 0,
      candidates,
      thin,
      refreshedAt: iso(edition.proposalRefreshedAt),
    },
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function maxOrder(rows: Array<{ order: number }>): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((highest, row) => Math.max(highest, row.order), rows[0].order);
}

async function readRelevanceThreshold(db: TenantClient): Promise<number> {
  const settings = await db.orgSettings.findUnique();
  return settings?.relevanceThreshold ?? DEFAULT_RELEVANCE_THRESHOLD;
}

async function readArticleCandidates(
  db: TenantClient,
  threshold: number,
  refreshedAt: Date | null
): Promise<Candidate[]> {
  const rows = await db.article.findMany({
    where: {
      status: { in: ["APPROVED", "PENDING_REVIEW"] },
      ...(refreshedAt ? { createdAt: { gt: refreshedAt } } : {}),
      // The same rule `rankCandidates` applies, pushed into the query so a
      // light week is not read out of the database only to be discarded.
      OR: [
        { status: "APPROVED" },
        { status: "PENDING_REVIEW", relevanceScore: { gte: threshold } },
      ],
    },
    select: {
      id: true,
      relevanceScore: true,
      publishedAt: true,
      capturedAt: true,
      createdAt: true,
      status: true,
    },
    // Nulls sort last on a descending order in Postgres, so an undated article would be
    // fetched last and could fall outside the limit. The fallback fixes the ranking below;
    // this keeps the fetch from losing rows before ranking sees them.
    orderBy: [{ relevanceScore: "desc" }, { capturedAt: "desc" }],
    take: CANDIDATE_FETCH_LIMIT,
  });

  return rows.map((row) => ({
    id: row.id,
    relevanceScore: row.relevanceScore,
    publishedAt: bestKnownDate(row),
    createdAt: row.createdAt,
    status: row.status as CandidateStatus,
  }));
}

async function readProjectCandidates(
  db: TenantClient,
  refreshedAt: Date | null
): Promise<ProjectCandidate[]> {
  const rows = await db.project.findMany({
    where: {
      featured: true,
      ...(refreshedAt ? { createdAt: { gt: refreshedAt } } : {}),
    },
    select: { id: true, projectDate: true, createdAt: true },
    orderBy: { projectDate: "desc" },
    take: CANDIDATE_FETCH_LIMIT,
  });

  return rows.map((row) => ({
    id: row.id,
    projectDate: row.projectDate,
    createdAt: row.createdAt,
  }));
}

/**
 * The join tables have no `organizationId` of their own, so they are read
 * through the tenant client's documented escape hatch. Every call here passes
 * an `editionId` that came back from `db.edition`, which is what keeps the read
 * inside the organization (AC-1.4).
 */
async function readEditionArticleRows(db: TenantClient, editionId: string) {
  return db.$raw.editionArticle.findMany({
    where: { editionId },
    select: { articleId: true, order: true },
    orderBy: { order: "asc" },
  });
}

async function readEditionProjectRows(db: TenantClient, editionId: string) {
  return db.$raw.editionProject.findMany({
    where: { editionId },
    select: { projectId: true, order: true },
    orderBy: { order: "asc" },
  });
}

async function readEditionArticles(
  db: TenantClient,
  editionId: string
): Promise<ProposalArticle[]> {
  const rows = await db.$raw.editionArticle.findMany({
    where: { editionId },
    include: { article: true },
    orderBy: { order: "asc" },
  });

  return rows.map((row) => ({
    id: row.article.id,
    title: row.article.title,
    sourceUrl: row.article.sourceUrl,
    author: row.article.author,
    publishedAt: row.article.publishedAt?.toISOString() ?? null,
    capturedAt: row.article.capturedAt.toISOString(),
    relevanceScore: row.article.relevanceScore,
    summary: row.article.summary,
    category: row.article.category,
    status: row.article.status,
    order: row.order,
  }));
}

async function readEditionProjects(
  db: TenantClient,
  editionId: string
): Promise<ProposalProject[]> {
  const rows = await db.$raw.editionProject.findMany({
    where: { editionId },
    include: { project: true },
    orderBy: { order: "asc" },
  });

  return rows.map((row) => ({
    id: row.project.id,
    name: row.project.name,
    description: row.project.description,
    team: row.project.team,
    projectDate: row.project.projectDate.toISOString(),
    impact: row.project.impact,
    imageUrl: row.project.imageUrl,
    order: row.order,
  }));
}

// ==================== The candidate pool ====================

export const CANDIDATE_POOL_LIMIT = 50;
export const CANDIDATE_POOL_MAX = 100;

export interface CandidatePool {
  articles: ProposalArticle[];
  projects: ProposalProject[];
}

/** A limit outside the allowed range is clamped rather than refused: the caller
 *  asked for a page size, not for a policy, and a 400 here would only break the
 *  picker for a typo in a query string. */
export function clampPoolLimit(raw: string | null): number {
  if (raw === null || raw.trim() === "") return CANDIDATE_POOL_LIMIT;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return CANDIDATE_POOL_LIMIT;

  return Math.min(CANDIDATE_POOL_MAX, Math.max(1, Math.floor(parsed)));
}

/**
 * RQ-005 AC-6.1 and AC-6.6: what may still be added to an edition.
 *
 * Eligibility mirrors `rankCandidates` exactly, because a picker that offers an
 * article the assembler would never choose teaches the wrong thing about the
 * product: an `APPROVED` article qualifies whatever its score, since a person
 * already decided it, and a `PENDING_REVIEW` one only at or above the
 * organization's threshold. A null score never qualifies, because unscored means
 * unjudged rather than passed.
 *
 * Anything already sitting in an edition is excluded, this week's included, so
 * the picker never offers a duplicate of a row already on the screen behind it.
 *
 * `order` is zero on everything here. These rows are not in an edition yet, and
 * the caller assigns position when it adds them.
 */
export async function readCandidatePool(
  db: TenantClient,
  options: { search?: string | null; limit?: number } = {}
): Promise<CandidatePool> {
  const limit = options.limit ?? CANDIDATE_POOL_LIMIT;
  const term = options.search?.trim();
  const threshold = await readRelevanceThreshold(db);

  const eligible: Prisma.ArticleWhereInput = {
    editions: { none: {} },
    OR: [
      { status: "APPROVED" },
      { status: "PENDING_REVIEW", relevanceScore: { gte: threshold } },
    ],
  };

  const matchesTerm: Prisma.ArticleWhereInput | undefined = term
    ? {
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { summary: { contains: term, mode: "insensitive" } },
        ],
      }
    : undefined;

  const [articleRows, projectRows] = await Promise.all([
    db.article.findMany({
      // AND, not a merged OR: the eligibility test and the search are separate
      // questions, and flattening them would let the search reach articles that
      // are not eligible at all.
      where: matchesTerm ? { AND: [eligible, matchesTerm] } : eligible,
      orderBy: [
        { relevanceScore: { sort: "desc", nulls: "last" } },
        // publishedAt is nullable now, so nulls last: without it an undated article
        // sorts to the front of a descending order in Postgres and displaces a dated one
        // out of the limit. Finding C1.
        { publishedAt: { sort: "desc", nulls: "last" } },
        { capturedAt: "desc" },
      ],
      take: limit,
    }),
    db.project.findMany({
      where: {
        editions: { none: {} },
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: "insensitive" } },
                { description: { contains: term, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ featured: "desc" }, { projectDate: "desc" }],
      take: limit,
    }),
  ]);

  return {
    articles: articleRows.map((article) => ({
      id: article.id,
      title: article.title,
      sourceUrl: article.sourceUrl,
      author: article.author,
      publishedAt: article.publishedAt?.toISOString() ?? null,
      capturedAt: article.capturedAt.toISOString(),
      relevanceScore: article.relevanceScore,
      summary: article.summary,
      category: article.category,
      status: article.status,
      order: 0,
    })),
    projects: projectRows.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      team: project.team,
      projectDate: project.projectDate.toISOString(),
      impact: project.impact,
      imageUrl: project.imageUrl,
      order: 0,
    })),
  };
}
