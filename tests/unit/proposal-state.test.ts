import { describe, expect, it } from "vitest";
import {
  editionPatchPayload,
  emptyCounts,
  initialProposalState,
  isEditable,
  isThinCount,
  proposalReducer,
  type Proposal,
  type ProposalArticle,
  type ProposalPayload,
  type ProposalState,
  type QueueArticle,
} from "@/components/proposal/state";

/**
 * RQ-005 unit C. These pin the behaviour that used to be spread across two
 * screens: the Feed and the review queue read the same pending-articles query,
 * so a decision in one left the other holding a story that had already been
 * decided. One reducer is the fix, and this is where it is checked.
 */

const article = (id: string, order: number): ProposalArticle => ({
  id,
  title: `Story ${id}`,
  sourceUrl: `https://example.com/${id}`,
  publishedAt: "2026-08-01T09:00:00.000Z",
  capturedAt: "2026-08-01T10:00:00.000Z",
  relevanceScore: 8,
  summary: null,
  category: [],
  status: "APPROVED",
  order,
  useLinkTake: false,
});

const queueArticle = (id: string): QueueArticle => ({
  id,
  title: `Queued ${id}`,
  sourceUrl: `https://example.com/${id}`,
  publishedAt: "2026-08-01T09:00:00.000Z",
  capturedAt: "2026-08-01T10:00:00.000Z",
  relevanceScore: 7,
  summary: null,
  category: [],
  status: "PENDING_REVIEW",
});

const proposal = (articles: ProposalArticle[]): Proposal => ({
  id: "ed1",
  week: 32,
  year: 2026,
  // RQ-008: a weekly edition, so no title and the label falls back to the week.
  title: null,
  kind: "WEEKLY",
  publishDate: "2026-08-03T00:00:00.000Z",
  label: "Week 32 · 2026",
  status: "DRAFT",
  thin: isThinCount(articles.length),
  archivedAt: null,
  sentAt: null,
  approvedAt: null,
  approvedByEmail: null,
  articles,
  projects: [
    { id: "p1", name: "Project one", description: "", team: "Internal", order: 1 },
    { id: "p2", name: "Project two", description: "", team: "Insurance", order: 2 },
  ],
});

const payload = (articles: ProposalArticle[]): ProposalPayload => ({
  proposal: proposal(articles),
  counts: {
    ...emptyCounts,
    collected: 40,
    belowThreshold: 30,
    rejected: 5,
    inProposal: articles.length,
    approvedWaiting: 2,
    pending: 3,
  },
  pipeline: {
    running: false,
    current: null,
    total: null,
    lastRun: null,
    runNeeded: false,
    runReason: "current",
  },
  recipients: { active: 412 },
  assembly: {
    assembled: true,
    candidates: 12,
    thin: isThinCount(articles.length),
    refreshedAt: null,
  },
});

function loaded(articleIds: string[], queue: string[] = []): ProposalState {
  const articles = articleIds.map((id, index) => article(id, index + 1));
  let state = proposalReducer(initialProposalState, {
    type: "payloadLoaded",
    payload: payload(articles),
  });
  state = proposalReducer(state, {
    type: "queueLoaded",
    articles: queue.map(queueArticle),
  });
  return state;
}

describe("proposalReducer, the queue view", () => {
  it("approving removes the row, drops pending and raises approved and waiting in one dispatch", () => {
    // RQ-005 AC-4.5: this is the defect. Two screens meant the other list kept
    // showing a story that had just been decided.
    const state = loaded(["a1"], ["q1", "q2", "q3"]);
    const next = proposalReducer(state, {
      type: "queueDecided",
      verdict: "approve",
      ids: ["q2"],
    });

    expect(next.queue.map((a) => a.id)).toEqual(["q1", "q3"]);
    expect(next.counts.pending).toBe(state.counts.pending - 1);
    expect(next.counts.approvedWaiting).toBe(state.counts.approvedWaiting + 1);
  });

  it("rejecting removes the row and never raises approved and waiting", () => {
    const state = loaded(["a1"], ["q1", "q2"]);
    const next = proposalReducer(state, {
      type: "queueDecided",
      verdict: "reject",
      ids: ["q1"],
    });

    expect(next.queue.map((a) => a.id)).toEqual(["q2"]);
    expect(next.counts.approvedWaiting).toBe(state.counts.approvedWaiting);
    expect(next.counts.rejected).toBe(state.counts.rejected + 1);
  });

  it("reports one bulk decision as one undoable batch", () => {
    const state = loaded([], ["q1", "q2", "q3"]);
    const next = proposalReducer(state, {
      type: "queueDecided",
      verdict: "approve",
      ids: ["q1", "q3"],
    });

    expect(next.queue.map((a) => a.id)).toEqual(["q2"]);
    expect(next.undoable?.entries).toHaveLength(2);
    expect(next.counts.pending).toBe(state.counts.pending - 2);
  });

  it("ignores ids that are not in the queue", () => {
    const state = loaded([], ["q1"]);
    expect(
      proposalReducer(state, {
        type: "queueDecided",
        verdict: "approve",
        ids: ["nope"],
      })
    ).toBe(state);
  });

  it("undo puts each story back in the position it left", () => {
    // RQ-005 AC-3.3: undo restores it to the list it left, not to the end of it.
    const state = loaded([], ["q1", "q2", "q3"]);
    const decided = proposalReducer(state, {
      type: "queueDecided",
      verdict: "approve",
      ids: ["q2"],
    });
    const undone = proposalReducer(decided, { type: "decisionUndone" });

    expect(undone.queue.map((a) => a.id)).toEqual(["q1", "q2", "q3"]);
    expect(undone.counts.pending).toBe(state.counts.pending);
    expect(undone.counts.approvedWaiting).toBe(state.counts.approvedWaiting);
    expect(undone.undoable).toBeNull();
  });

  it("undo of a bulk decision restores every story", () => {
    const state = loaded([], ["q1", "q2", "q3", "q4"]);
    const decided = proposalReducer(state, {
      type: "queueDecided",
      verdict: "reject",
      ids: ["q1", "q3"],
    });
    const undone = proposalReducer(decided, { type: "decisionUndone" });

    expect(undone.queue.map((a) => a.id)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(undone.counts.rejected).toBe(state.counts.rejected);
  });

  it("undo with nothing to undo changes nothing", () => {
    const state = loaded([], ["q1"]);
    expect(proposalReducer(state, { type: "decisionUndone" })).toBe(state);
  });
});

describe("proposalReducer, the proposal view", () => {
  it("removing a story returns it to approved and waiting rather than rejecting it", () => {
    // RQ-005 AC-6.2: taking a story out of the edition is not a verdict on it.
    const state = loaded(["a1", "a2", "a3"]);
    const next = proposalReducer(state, { type: "articleRemoved", id: "a2" });

    expect(next.proposal!.articles.map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(next.counts.inProposal).toBe(state.counts.inProposal - 1);
    expect(next.counts.approvedWaiting).toBe(state.counts.approvedWaiting + 1);
    expect(next.counts.rejected).toBe(state.counts.rejected);
  });

  it("rejecting from the proposal is a verdict, so nothing goes to waiting", () => {
    // RQ-005 AC-6.4.
    const state = loaded(["a1", "a2"]);
    const next = proposalReducer(state, { type: "articleRejected", id: "a1" });

    expect(next.proposal!.articles.map((a) => a.id)).toEqual(["a2"]);
    expect(next.counts.rejected).toBe(state.counts.rejected + 1);
    expect(next.counts.approvedWaiting).toBe(state.counts.approvedWaiting);
  });

  it("renumbers order densely after a removal", () => {
    const state = loaded(["a1", "a2", "a3"]);
    const next = proposalReducer(state, { type: "articleRemoved", id: "a1" });
    expect(next.proposal!.articles.map((a) => a.order)).toEqual([1, 2]);
  });

  it("marks the proposal thin once it drops below the threshold", () => {
    // RQ-005 AC-1.6: a light week must read as light, including after an edit.
    const state = loaded(["a1", "a2", "a3", "a4", "a5"]);
    expect(state.proposal!.thin).toBe(false);

    const next = proposalReducer(state, { type: "articleRemoved", id: "a5" });
    expect(next.proposal!.thin).toBe(true);
  });

  it("moves a story up and down, and a move at either end is a no-op", () => {
    // RQ-005 AC-6.3.
    const state = loaded(["a1", "a2", "a3"]);
    const up = proposalReducer(state, {
      type: "articleMoved",
      id: "a3",
      direction: -1,
    });
    expect(up.proposal!.articles.map((a) => a.id)).toEqual(["a1", "a3", "a2"]);

    const down = proposalReducer(up, {
      type: "articleMoved",
      id: "a1",
      direction: 1,
    });
    expect(down.proposal!.articles.map((a) => a.id)).toEqual(["a3", "a1", "a2"]);

    // No-op returns the same state, so the screen does not PATCH an unchanged
    // order every time someone clicks the disabled end of the list.
    expect(
      proposalReducer(down, { type: "articleMoved", id: "a3", direction: -1 })
    ).toBe(down);
  });

  it("reorders projects the same way as stories", () => {
    // RQ-005 AC-6.6.
    const state = loaded(["a1"]);
    const next = proposalReducer(state, {
      type: "projectMoved",
      id: "p2",
      direction: -1,
    });
    expect(next.proposal!.projects.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(next.proposal!.projects.map((p) => p.order)).toEqual([1, 2]);
  });

  it("adds stories at the end and never adds one twice", () => {
    // RQ-005 AC-6.1.
    const state = loaded(["a1"]);
    const next = proposalReducer(state, {
      type: "articlesAdded",
      articles: [article("a9", 99), article("a1", 1)],
    });

    expect(next.proposal!.articles.map((a) => a.id)).toEqual(["a1", "a9"]);
    expect(next.proposal!.articles.map((a) => a.order)).toEqual([1, 2]);
    expect(next.counts.inProposal).toBe(state.counts.inProposal + 1);
    expect(next.counts.approvedWaiting).toBe(state.counts.approvedWaiting - 1);
  });

  it("adds stories and projects in one state change", () => {
    // The picker returns both at once. Two dispatches would mean two writes,
    // the second computed from the state before the first, and the edition
    // would be saved without the stories that had just been added.
    const state = loaded(["a1"]);
    const next = proposalReducer(state, {
      type: "contentAdded",
      articles: [article("a9", 99)],
      projects: [
        { id: "p3", name: "Project three", description: "", team: "Public", order: 9 },
      ],
    });

    expect(next.proposal!.articles.map((a) => a.id)).toEqual(["a1", "a9"]);
    expect(next.proposal!.projects.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(next.proposal!.projects.map((p) => p.order)).toEqual([1, 2, 3]);
    expect(next.counts.inProposal).toBe(state.counts.inProposal + 1);
  });

  it("adding nothing at all changes nothing", () => {
    const state = loaded(["a1"]);
    expect(
      proposalReducer(state, { type: "contentAdded", articles: [], projects: [] })
    ).toBe(state);
  });

  it("adding nothing new changes nothing", () => {
    const state = loaded(["a1"]);
    expect(
      proposalReducer(state, { type: "articlesAdded", articles: [article("a1", 1)] })
    ).toBe(state);
  });

  it("a sent edition stops being editable", () => {
    // RQ-005 AC-2.5 and AC-6.7.
    const state = loaded(["a1"]);
    expect(isEditable(state.proposal)).toBe(true);

    const sent = proposalReducer(state, {
      type: "proposalSent",
      sentAt: "2026-08-03T10:00:00.000Z",
      approvedByEmail: "julian.andrade@example.com",
    });

    expect(sent.proposal!.status).toBe("SENT");
    expect(sent.proposal!.approvedByEmail).toBe("julian.andrade@example.com");
    expect(sent.proposal!.approvedAt).toBe("2026-08-03T10:00:00.000Z");
    expect(isEditable(sent.proposal)).toBe(false);
  });
});

describe("editionPatchPayload", () => {
  it("sends the order that is on screen, and survives a round trip", () => {
    // RQ-005 AC-6.3: what the PATCH carries is what the reader is looking at.
    const state = loaded(["a1", "a2", "a3"]);
    const moved = proposalReducer(state, {
      type: "articleMoved",
      id: "a3",
      direction: -1,
    });

    const body = editionPatchPayload(moved.proposal!);
    expect(body.articles).toEqual([
      { articleId: "a1", order: 1, useLinkTake: false },
      { articleId: "a3", order: 2, useLinkTake: false },
      { articleId: "a2", order: 3, useLinkTake: false },
    ]);
    expect(body.projects).toEqual([
      { projectId: "p1", order: 1 },
      { projectId: "p2", order: 2 },
    ]);

    // A reload of the same edition reproduces the same body, so the order the
    // editor set is the order the email uses.
    const reloaded = proposalReducer(initialProposalState, {
      type: "payloadLoaded",
      payload: payload(moved.proposal!.articles),
    });
    expect(editionPatchPayload(reloaded.proposal!).articles).toEqual(body.articles);
  });

  it("carries a flagged story's Link Take through an unrelated reorder", () => {
    // A save triggered by this screen for any reason, a move, an add, a rejection,
    // must not silently clear a flag another screen set. PATCH deletes and recreates
    // every join row, so an omitted useLinkTake here would zero it just as surely as
    // dropping it from the builder's own save handler would.
    const state = loaded(["a1", "a2"]);
    const flagged = {
      ...state,
      proposal: {
        ...state.proposal!,
        articles: state.proposal!.articles.map((a) =>
          a.id === "a2" ? { ...a, useLinkTake: true } : a
        ),
      },
    };

    const moved = proposalReducer(flagged, {
      type: "articleMoved",
      id: "a2",
      direction: -1,
    });

    const body = editionPatchPayload(moved.proposal!);
    expect(body.articles).toEqual([
      { articleId: "a2", order: 1, useLinkTake: true },
      { articleId: "a1", order: 2, useLinkTake: false },
    ]);
  });
});

describe("isThinCount", () => {
  it("marks fewer than five as thin, and five as not thin", () => {
    // RQ-005 AC-1.6. Mirrors unit B's THIN_ARTICLE_THRESHOLD.
    expect(isThinCount(0)).toBe(true);
    expect(isThinCount(4)).toBe(true);
    expect(isThinCount(5)).toBe(false);
    expect(isThinCount(10)).toBe(false);
  });
});
