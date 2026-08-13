/**
 * RQ-005 unit C: the proposal screen's state, in one reducer.
 *
 * The Feed and the Review queue used to be two screens reading the same
 * pending-articles query, so deciding a story in one silently emptied the other
 * (BR-012). They are now two views of one screen, and this is the only place
 * their state lives: a decision taken in the queue updates the queue, the counts
 * and the proposal in a single dispatch, which is what makes AC-4.5 a unit test
 * rather than a click-through.
 *
 * Pure on purpose. No fetch, no toast, no React: the screen does the talking to
 * the network and dispatches the result.
 */

export type EditionStatus = "DRAFT" | "FINALIZED" | "SENT";

export interface ProposalArticle {
  id: string;
  title: string;
  sourceUrl: string;
  author?: string | null;
  /** Null when nobody told us when it was published. Finding C1. */
  publishedAt: string | null;
  /** Always known. Shown, and labelled as a capture, when the above is null. */
  capturedAt: string;
  relevanceScore: number | null;
  summary: string | null;
  category: string[];
  status: string;
  order: number;
  /**
   * Whether this edition sends this story's Link Take. RQ-006 surface 3.
   *
   * Required, not optional: the flag round-trips through a PATCH that deletes and
   * recreates every join row, so a shape that lets it be omitted is a shape that
   * loses it, and this branch lost it four times before the type was tightened.
   * There is no tri-state here, every consumer collapses `undefined` to `false`
   * anyway.
   */
  useLinkTake: boolean;
  /** Whether a sendable take exists, so the row can say why it is blocked. */
  hasUsableTake?: boolean;
}

export interface ProposalProject {
  id: string;
  name: string;
  description: string;
  team: string;
  projectDate?: string | null;
  impact?: string | null;
  imageUrl?: string | null;
  order: number;
}

export interface Proposal {
  id: string;
  week: number;
  year: number;
  /** RQ-008: the edition's own name, null on a weekly. */
  title: string | null;
  kind: "WEEKLY" | "SPECIAL";
  publishDate: string;
  /** What to call it on screen: the title, or the week label when there is none. */
  label: string;
  status: EditionStatus;
  thin: boolean;
  archivedAt: string | null;
  sentAt: string | null;
  approvedAt: string | null;
  approvedByEmail: string | null;
  articles: ProposalArticle[];
  projects: ProposalProject[];
}

/** RQ-005 AC-1.5: the counts the proposal states in words, not in a tooltip. */
export interface ProposalCounts {
  collected: number;
  rejected: number;
  belowThreshold: number;
  inProposal: number;
  approvedWaiting: number;
  pending: number;
}

export interface PipelineLastRun {
  status: "COMPLETED" | "FAILED" | "CANCELLED";
  startedAt: string | null;
  completedAt: string | null;
  totalFound: number;
  curated: number;
  duplicates: number;
  lowScore: number;
  errorsCount: number;
}

export interface PipelineStatus {
  running: boolean;
  current: number | null;
  total: number | null;
  lastRun: PipelineLastRun | null;
  runNeeded: boolean;
  runReason: string;
}

export interface Assembly {
  assembled: boolean;
  candidates: number;
  thin: boolean;
  refreshedAt: string | null;
}

/**
 * The payload of `GET /api/editions/proposal`, unit B's contract as fixed in the
 * technical specification, section 4.2.3.
 */
export interface ProposalPayload {
  proposal: Proposal;
  counts: ProposalCounts;
  /**
   * Story 5's data. Optional because the payload that landed first carries the
   * proposal and the counts and not yet this block, and the screen has to render
   * either way.
   */
  pipeline?: PipelineStatus | null;
  recipients?: { active: number };
  assembly?: Assembly | null;
}

/** A story awaiting a decision, as `GET /api/articles/pending` returns it. */
export interface QueueArticle {
  id: string;
  title: string;
  sourceUrl: string;
  author?: string | null;
  /** Null when nobody told us when it was published. Finding C1. */
  publishedAt: string | null;
  /** Always known. Shown, and labelled as a capture, when the above is null. */
  capturedAt: string;
  relevanceScore: number | null;
  summary: string | null;
  category: string[];
  status: string;
}

export type Verdict = "approve" | "reject";

/** RQ-005 AC-3.3: enough to put a decision back where it came from. */
export interface UndoableDecision {
  verdict: Verdict;
  entries: Array<{ index: number; article: QueueArticle }>;
}

export interface ProposalState {
  proposal: Proposal | null;
  counts: ProposalCounts;
  pipeline: PipelineStatus | null;
  recipients: { active: number };
  assembly: Assembly | null;
  queue: QueueArticle[];
  undoable: UndoableDecision | null;
}

export const emptyCounts: ProposalCounts = {
  collected: 0,
  rejected: 0,
  belowThreshold: 0,
  inProposal: 0,
  approvedWaiting: 0,
  pending: 0,
};

export const initialProposalState: ProposalState = {
  proposal: null,
  counts: emptyCounts,
  pipeline: null,
  recipients: { active: 0 },
  assembly: null,
  queue: [],
  undoable: null,
};

export type ProposalAction =
  | { type: "payloadLoaded"; payload: ProposalPayload }
  | { type: "queueLoaded"; articles: QueueArticle[] }
  | { type: "queueDecided"; verdict: Verdict; ids: string[] }
  | { type: "decisionUndone" }
  | { type: "queueArticleEdited"; id: string; summary: string; category: string[] }
  | { type: "articleMoved"; id: string; direction: -1 | 1 }
  | { type: "projectMoved"; id: string; direction: -1 | 1 }
  | { type: "articleRemoved"; id: string }
  | { type: "articleRejected"; id: string }
  | { type: "projectRemoved"; id: string }
  | { type: "articlesAdded"; articles: ProposalArticle[] }
  | { type: "projectsAdded"; projects: ProposalProject[] }
  | {
      type: "contentAdded";
      articles: ProposalArticle[];
      projects: ProposalProject[];
    }
  | { type: "proposalSent"; sentAt: string; approvedByEmail: string | null }
  | {
      type: "pipelineProgress";
      running: boolean;
      current: number | null;
      total: number | null;
    };

/**
 * Fewer than this reads as a light week.
 *
 * Mirrors `THIN_ARTICLE_THRESHOLD` in unit B's `lib/editions/proposal.ts`, which
 * is the authority: the payload carries `thin` and the screen shows what the
 * server said. This copy only keeps the marker honest after an editor adds or
 * removes a story without a reload, since a proposal that just dropped to two
 * stories must not still read as full.
 */
export const THIN_ARTICLE_THRESHOLD = 5;

export function isThinCount(articleCount: number): boolean {
  return articleCount < THIN_ARTICLE_THRESHOLD;
}

/** Renumber from 1 so `order` is always dense and matches what is on screen. */
function reindex<T extends { order: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, order: index + 1 }));
}

function move<T extends { id: string; order: number }>(
  items: T[],
  id: string,
  direction: -1 | 1
): T[] {
  const from = items.findIndex((item) => item.id === id);
  if (from === -1) return items;
  const to = from + direction;
  if (to < 0 || to >= items.length) return items;

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return reindex(next);
}

function withArticles(
  state: ProposalState,
  articles: ProposalArticle[]
): Proposal | null {
  if (!state.proposal) return null;
  const ordered = reindex(articles);
  return { ...state.proposal, articles: ordered, thin: isThinCount(ordered.length) };
}

export function proposalReducer(
  state: ProposalState,
  action: ProposalAction
): ProposalState {
  switch (action.type) {
    /**
     * Defensive on every field but the proposal itself: the pipeline block is
     * the last part of the payload to arrive (Story 5), and a screen that reads
     * an absent block must show "not reported yet" rather than crash.
     */
    case "payloadLoaded":
      return {
        ...state,
        proposal: action.payload.proposal,
        counts: action.payload.counts ?? emptyCounts,
        pipeline: action.payload.pipeline ?? null,
        recipients: action.payload.recipients ?? { active: 0 },
        assembly: action.payload.assembly ?? null,
      };

    case "queueLoaded":
      return { ...state, queue: action.articles };

    /**
     * RQ-005 AC-4.5: one dispatch moves the story out of the queue, decrements
     * the pending count and, for an approval, increments approved and waiting.
     * No second list is left holding a story that was just decided.
     */
    case "queueDecided": {
      const ids = new Set(action.ids);
      const entries = state.queue
        .map((article, index) => ({ index, article }))
        .filter(({ article }) => ids.has(article.id));
      if (entries.length === 0) return state;

      return {
        ...state,
        queue: state.queue.filter((article) => !ids.has(article.id)),
        counts: {
          ...state.counts,
          pending: Math.max(0, state.counts.pending - entries.length),
          approvedWaiting:
            action.verdict === "approve"
              ? state.counts.approvedWaiting + entries.length
              : state.counts.approvedWaiting,
          rejected:
            action.verdict === "reject"
              ? state.counts.rejected + entries.length
              : state.counts.rejected,
        },
        undoable: { verdict: action.verdict, entries },
      };
    }

    /** RQ-005 AC-3.3: undo puts each story back in the position it left. */
    case "decisionUndone": {
      const undoable = state.undoable;
      if (!undoable) return state;

      const queue = [...state.queue];
      for (const { index, article } of [...undoable.entries].sort(
        (a, b) => a.index - b.index
      )) {
        queue.splice(Math.min(index, queue.length), 0, article);
      }

      const restored = undoable.entries.length;
      return {
        ...state,
        queue,
        counts: {
          ...state.counts,
          pending: state.counts.pending + restored,
          approvedWaiting:
            undoable.verdict === "approve"
              ? Math.max(0, state.counts.approvedWaiting - restored)
              : state.counts.approvedWaiting,
          rejected:
            undoable.verdict === "reject"
              ? Math.max(0, state.counts.rejected - restored)
              : state.counts.rejected,
        },
        undoable: null,
      };
    }

    case "queueArticleEdited":
      return {
        ...state,
        queue: state.queue.map((article) =>
          article.id === action.id
            ? { ...article, summary: action.summary, category: action.category }
            : article
        ),
      };

    /** RQ-005 AC-6.3: the order on screen is the order the PATCH sends. */
    case "articleMoved": {
      if (!state.proposal) return state;
      const articles = move(state.proposal.articles, action.id, action.direction);
      // A move at either end is a no-op, and must not look like a change: the
      // screen persists on every state change, and this would PATCH nothing.
      if (articles === state.proposal.articles) return state;
      return { ...state, proposal: { ...state.proposal, articles } };
    }

    case "projectMoved": {
      if (!state.proposal) return state;
      const projects = move(state.proposal.projects, action.id, action.direction);
      if (projects === state.proposal.projects) return state;
      return { ...state, proposal: { ...state.proposal, projects } };
    }

    /**
     * RQ-005 AC-6.2: removing a story from the proposal is not a rejection. It
     * goes back to approved and waiting, so the waiting count goes up.
     */
    case "articleRemoved": {
      if (!state.proposal) return state;
      const present = state.proposal.articles.some((a) => a.id === action.id);
      if (!present) return state;

      return {
        ...state,
        proposal: withArticles(
          state,
          state.proposal.articles.filter((a) => a.id !== action.id)
        ),
        counts: {
          ...state.counts,
          inProposal: Math.max(0, state.counts.inProposal - 1),
          approvedWaiting: state.counts.approvedWaiting + 1,
        },
      };
    }

    /** RQ-005 AC-6.4: a rejection is a verdict, so it does not go to waiting. */
    case "articleRejected": {
      if (!state.proposal) return state;
      const present = state.proposal.articles.some((a) => a.id === action.id);
      if (!present) return state;

      return {
        ...state,
        proposal: withArticles(
          state,
          state.proposal.articles.filter((a) => a.id !== action.id)
        ),
        counts: {
          ...state.counts,
          inProposal: Math.max(0, state.counts.inProposal - 1),
          rejected: state.counts.rejected + 1,
        },
      };
    }

    case "projectRemoved": {
      if (!state.proposal) return state;
      if (!state.proposal.projects.some((p) => p.id === action.id)) return state;
      return {
        ...state,
        proposal: {
          ...state.proposal,
          projects: reindex(
            state.proposal.projects.filter((p) => p.id !== action.id)
          ),
        },
      };
    }

    /** RQ-005 AC-6.1: an addition shows immediately, appended after the rest. */
    case "articlesAdded": {
      if (!state.proposal) return state;
      const known = new Set(state.proposal.articles.map((a) => a.id));
      const fresh = action.articles.filter((a) => !known.has(a.id));
      if (fresh.length === 0) return state;

      return {
        ...state,
        proposal: withArticles(state, [...state.proposal.articles, ...fresh]),
        counts: {
          ...state.counts,
          inProposal: state.counts.inProposal + fresh.length,
          approvedWaiting: Math.max(0, state.counts.approvedWaiting - fresh.length),
        },
      };
    }

    case "projectsAdded": {
      if (!state.proposal) return state;
      const known = new Set(state.proposal.projects.map((p) => p.id));
      const fresh = action.projects.filter((p) => !known.has(p.id));
      if (fresh.length === 0) return state;

      return {
        ...state,
        proposal: {
          ...state.proposal,
          projects: reindex([...state.proposal.projects, ...fresh]),
        },
      };
    }

    /**
     * Stories and projects added together, in one state change.
     *
     * The picker can return both at once, and two separate dispatches would mean
     * two writes, the second built from the state before the first: the edition
     * would be saved without the stories that had just been added to it.
     */
    case "contentAdded": {
      const withArticlesAdded =
        action.articles.length > 0
          ? proposalReducer(state, {
              type: "articlesAdded",
              articles: action.articles,
            })
          : state;

      return action.projects.length > 0
        ? proposalReducer(withArticlesAdded, {
            type: "projectsAdded",
            projects: action.projects,
          })
        : withArticlesAdded;
    }

    /** RQ-005 AC-2.5: sent reads as sent, and stops being editable. */
    case "proposalSent": {
      if (!state.proposal) return state;
      return {
        ...state,
        proposal: {
          ...state.proposal,
          status: "SENT",
          sentAt: action.sentAt,
          approvedAt: action.sentAt,
          approvedByEmail: action.approvedByEmail,
        },
        undoable: null,
      };
    }

    case "pipelineProgress": {
      const base: PipelineStatus =
        state.pipeline ??
        {
          running: false,
          current: null,
          total: null,
          lastRun: null,
          runNeeded: false,
          runReason: "current",
        };
      return {
        ...state,
        pipeline: {
          ...base,
          running: action.running,
          current: action.current,
          total: action.total,
        },
      };
    }

    default:
      return state;
  }
}

/**
 * RQ-005 AC-2.4 and AC-6.3: the body of `PATCH /api/editions/[id]`.
 *
 * Whatever is on screen is what would be sent, and the send itself posts only
 * the edition id, so there is never a stale copy in the client to go out.
 *
 * `useLinkTake` rides along for the same reason `order` does: PATCH deletes and
 * recreates every join row, so a reorder or an add from this screen that omitted
 * the flag would silently clear every story's Link Take, not just the one moved.
 */
export function editionPatchPayload(proposal: Proposal): {
  articles: Array<{ articleId: string; order: number; useLinkTake: boolean }>;
  projects: Array<{ projectId: string; order: number }>;
} {
  return {
    articles: proposal.articles.map((article, index) => ({
      articleId: article.id,
      order: index + 1,
      useLinkTake: article.useLinkTake === true,
    })),
    projects: proposal.projects.map((project, index) => ({
      projectId: project.id,
      order: index + 1,
    })),
  };
}

/** Can this edition still be changed at all? RQ-005 AC-6.7. */
export function isEditable(proposal: Proposal | null): boolean {
  return Boolean(proposal) && proposal!.status !== "SENT" && !proposal!.sentAt;
}
