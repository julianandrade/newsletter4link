import { describe, expect, it } from "vitest";
import {
  PROPOSAL_ARTICLE_TARGET,
  PROPOSAL_PROJECT_TARGET,
  THIN_ARTICLE_THRESHOLD,
  ensureProposal,
  isThinProposal,
  planProjectTopUp,
  planTopUp,
  rankCandidates,
  readEditionArticles,
  type Candidate,
  type ProjectCandidate,
  type ProposalWeek,
} from "@/lib/editions/proposal";
import { editionPatchPayload } from "@/components/proposal/state";
import type { TenantClient } from "@/lib/db/tenant";

/**
 * RQ-005 unit B. The assembly is a pure function over a fetched list, so every
 * ranking rule is tested here without a database, the way
 * `lib/trends/compute.ts` is tested. The one exception is `ensureProposal`,
 * which is exercised against a fake tenant client that records the arguments it
 * was handed: the compound key it passes is what makes AC-1.3 and AC-1.4 true,
 * and an argument test is the only way to pin that without a database.
 */

const WEEK: ProposalWeek = {
  week: 32,
  year: 2026,
  startsAt: new Date("2026-08-03T00:00:00.000Z"),
};

function article(overrides: Partial<Candidate> & { id: string }): Candidate {
  return {
    relevanceScore: 8,
    publishedAt: new Date("2026-08-03T12:00:00.000Z"),
    createdAt: new Date("2026-08-03T13:00:00.000Z"),
    status: "PENDING_REVIEW",
    ...overrides,
  };
}

function project(
  overrides: Partial<ProjectCandidate> & { id: string }
): ProjectCandidate {
  return {
    projectDate: new Date("2026-07-01T00:00:00.000Z"),
    createdAt: new Date("2026-08-03T13:00:00.000Z"),
    ...overrides,
  };
}

const ids = (candidates: Candidate[]) => candidates.map((c) => c.id);

describe("rankCandidates", () => {
  it("orders by relevance score, highest first", () => {
    const ranked = rankCandidates(
      [
        article({ id: "low", relevanceScore: 6 }),
        article({ id: "high", relevanceScore: 9.5 }),
        article({ id: "middle", relevanceScore: 7.2 }),
      ],
      { threshold: 6, target: PROPOSAL_ARTICLE_TARGET }
    );

    expect(ids(ranked)).toEqual(["high", "middle", "low"]);
  });

  it("breaks a tie on the most recently published", () => {
    const ranked = rankCandidates(
      [
        article({
          id: "older",
          relevanceScore: 8,
          publishedAt: new Date("2026-08-01T09:00:00.000Z"),
        }),
        article({
          id: "newer",
          relevanceScore: 8,
          publishedAt: new Date("2026-08-04T09:00:00.000Z"),
        }),
      ],
      { threshold: 6, target: PROPOSAL_ARTICLE_TARGET }
    );

    expect(ids(ranked)).toEqual(["newer", "older"]);
  });

  it("keeps an approved article whatever its score, because a person decided it", () => {
    const ranked = rankCandidates(
      [
        article({ id: "approved-weak", relevanceScore: 2.1, status: "APPROVED" }),
        article({ id: "pending-strong", relevanceScore: 9 }),
      ],
      { threshold: 6, target: PROPOSAL_ARTICLE_TARGET }
    );

    expect(ids(ranked)).toEqual(["pending-strong", "approved-weak"]);
  });

  it("ranks an approved article with no score last rather than first", () => {
    const ranked = rankCandidates(
      [
        article({ id: "unscored", relevanceScore: null, status: "APPROVED" }),
        article({ id: "scored", relevanceScore: 6 }),
      ],
      { threshold: 6, target: PROPOSAL_ARTICLE_TARGET }
    );

    // A null read as zero would be a coincidence, not a rule. Sorting it last
    // is the rule: nothing scored it, so it cannot outrank something that was.
    expect(ids(ranked)).toEqual(["scored", "unscored"]);
  });

  it("includes a pending article exactly at the threshold", () => {
    const ranked = rankCandidates([article({ id: "at-bar", relevanceScore: 6 })], {
      threshold: 6,
      target: PROPOSAL_ARTICLE_TARGET,
    });

    expect(ids(ranked)).toEqual(["at-bar"]);
  });

  it("excludes a pending article below the threshold", () => {
    const ranked = rankCandidates(
      [
        article({ id: "under", relevanceScore: 5.9 }),
        article({ id: "over", relevanceScore: 6.1 }),
      ],
      { threshold: 6, target: PROPOSAL_ARTICLE_TARGET }
    );

    expect(ids(ranked)).toEqual(["over"]);
  });

  it("never lets an unscored pending article through", () => {
    const ranked = rankCandidates([article({ id: "unscored", relevanceScore: null })], {
      threshold: 6,
      target: PROPOSAL_ARTICLE_TARGET,
    });

    expect(ranked).toEqual([]);
  });

  // AC-1.7. This is the test the requirement is really about: a light week is
  // reported as light, not filled from below the bar.
  it("proposes two when only two clear the bar, and does not lower the bar", () => {
    const candidates = [
      article({ id: "in-1", relevanceScore: 8 }),
      article({ id: "in-2", relevanceScore: 6.4 }),
      article({ id: "out-1", relevanceScore: 5.9 }),
      article({ id: "out-2", relevanceScore: 4 }),
      article({ id: "out-3", relevanceScore: 0 }),
      article({ id: "out-4", relevanceScore: null }),
    ];

    const ranked = rankCandidates(candidates, {
      threshold: 6,
      target: PROPOSAL_ARTICLE_TARGET,
    });

    expect(ids(ranked)).toEqual(["in-1", "in-2"]);
    expect(isThinProposal(ranked.length)).toBe(true);
  });

  it("caps the proposal at the article target", () => {
    const candidates = Array.from({ length: 25 }, (_, index) =>
      article({ id: `a-${index}`, relevanceScore: 10 - index * 0.1 })
    );

    const ranked = rankCandidates(candidates, {
      threshold: 6,
      target: PROPOSAL_ARTICLE_TARGET,
    });

    expect(ranked).toHaveLength(PROPOSAL_ARTICLE_TARGET);
    expect(ids(ranked)[0]).toBe("a-0");
  });

  it("counts a repeated id once", () => {
    const ranked = rankCandidates(
      [article({ id: "same", relevanceScore: 9 }), article({ id: "same", relevanceScore: 9 })],
      { threshold: 6, target: PROPOSAL_ARTICLE_TARGET }
    );

    expect(ids(ranked)).toEqual(["same"]);
  });

  it("returns nothing when there is nothing", () => {
    expect(rankCandidates([], { threshold: 6, target: PROPOSAL_ARTICLE_TARGET })).toEqual([]);
  });
});

describe("isThinProposal", () => {
  it("marks a week below the threshold as thin", () => {
    expect(isThinProposal(0)).toBe(true);
    expect(isThinProposal(4)).toBe(true);
  });

  it("does not mark a week at or above the threshold", () => {
    expect(isThinProposal(THIN_ARTICLE_THRESHOLD)).toBe(false);
    expect(isThinProposal(10)).toBe(false);
  });
});

describe("planTopUp", () => {
  it("skips articles already in the proposal", () => {
    const plan = planTopUp({
      existingArticleIds: ["in-already"],
      candidates: [
        article({ id: "in-already", relevanceScore: 9 }),
        article({ id: "new", relevanceScore: 8 }),
      ],
      refreshedAt: null,
      currentMaxOrder: 1,
      threshold: 6,
      target: PROPOSAL_ARTICLE_TARGET,
    });

    expect(plan.add).toEqual(["new"]);
  });

  // The defect this exists to prevent: an editor removes a story in the morning
  // and the schedule puts it back the next morning. Only what arrived after the
  // last refresh is considered, so a removal sticks (AC-6.2).
  it("ignores candidates collected before the last refresh", () => {
    const refreshedAt = new Date("2026-08-04T09:30:00.000Z");

    const plan = planTopUp({
      existingArticleIds: [],
      candidates: [
        article({
          id: "removed-earlier",
          relevanceScore: 10,
          createdAt: new Date("2026-08-03T08:00:00.000Z"),
        }),
        article({
          id: "collected-since",
          relevanceScore: 7,
          createdAt: new Date("2026-08-04T09:31:00.000Z"),
        }),
      ],
      refreshedAt,
      currentMaxOrder: null,
      threshold: 6,
      target: PROPOSAL_ARTICLE_TARGET,
    });

    expect(plan.add).toEqual(["collected-since"]);
  });

  it("considers everything when the proposal has never been refreshed", () => {
    const plan = planTopUp({
      existingArticleIds: [],
      candidates: [
        article({ id: "old", relevanceScore: 9, createdAt: new Date("2026-07-01T00:00:00.000Z") }),
        article({ id: "new", relevanceScore: 8 }),
      ],
      refreshedAt: null,
      currentMaxOrder: null,
      threshold: 6,
      target: PROPOSAL_ARTICLE_TARGET,
    });

    expect(plan.add).toEqual(["old", "new"]);
    expect(plan.startOrder).toBe(1);
  });

  it("starts ordering after the current maximum, not after the current count", () => {
    // Two rows left at orders 1 and 7 after a removal. Reusing 3 would reorder
    // what is still there (AC-6.3).
    const plan = planTopUp({
      existingArticleIds: ["a", "b"],
      candidates: [article({ id: "c", relevanceScore: 9 })],
      refreshedAt: null,
      currentMaxOrder: 7,
      threshold: 6,
      target: PROPOSAL_ARTICLE_TARGET,
    });

    expect(plan.startOrder).toBe(8);
  });

  it("adds only up to the remaining room and never over the target", () => {
    const existing = Array.from({ length: 9 }, (_, index) => `have-${index}`);

    const plan = planTopUp({
      existingArticleIds: existing,
      candidates: [
        article({ id: "best", relevanceScore: 9.9 }),
        article({ id: "second", relevanceScore: 9.8 }),
      ],
      refreshedAt: null,
      currentMaxOrder: 9,
      threshold: 6,
      target: PROPOSAL_ARTICLE_TARGET,
    });

    expect(plan.add).toEqual(["best"]);
  });

  it("adds nothing to a full proposal", () => {
    const existing = Array.from({ length: PROPOSAL_ARTICLE_TARGET }, (_, i) => `have-${i}`);

    const plan = planTopUp({
      existingArticleIds: existing,
      candidates: [article({ id: "extra", relevanceScore: 10 })],
      refreshedAt: null,
      currentMaxOrder: PROPOSAL_ARTICLE_TARGET,
      threshold: 6,
      target: PROPOSAL_ARTICLE_TARGET,
    });

    expect(plan.add).toEqual([]);
  });

  it("does not lower the threshold to fill a thin proposal", () => {
    const plan = planTopUp({
      existingArticleIds: ["one"],
      candidates: [
        article({ id: "under-1", relevanceScore: 5.5 }),
        article({ id: "under-2", relevanceScore: 1 }),
        article({ id: "unscored", relevanceScore: null }),
      ],
      refreshedAt: null,
      currentMaxOrder: 1,
      threshold: 6,
      target: PROPOSAL_ARTICLE_TARGET,
    });

    expect(plan.add).toEqual([]);
  });

  it("plans an add and never a removal", () => {
    const plan = planTopUp({
      existingArticleIds: ["kept"],
      candidates: [],
      refreshedAt: null,
      currentMaxOrder: 3,
      threshold: 6,
      target: PROPOSAL_ARTICLE_TARGET,
    });

    // There is no "remove" in the plan at all, which is the point: a top-up
    // cannot undo editorial work because it has no way to express one.
    expect(Object.keys(plan).sort()).toEqual(["add", "startOrder"]);
    expect(plan.add).toEqual([]);
  });
});

describe("planProjectTopUp", () => {
  it("takes the most recent featured projects up to the target", () => {
    const candidates = Array.from({ length: 7 }, (_, index) =>
      project({
        id: `p-${index}`,
        projectDate: new Date(Date.UTC(2026, 0, 20 - index)),
      })
    );

    const plan = planProjectTopUp({
      existingProjectIds: [],
      candidates,
      refreshedAt: null,
      currentMaxOrder: null,
      target: PROPOSAL_PROJECT_TARGET,
    });

    expect(plan.add).toEqual(["p-0", "p-1", "p-2", "p-3", "p-4"]);
    expect(plan.startOrder).toBe(1);
  });

  it("leaves a removed project out, like an article", () => {
    const refreshedAt = new Date("2026-08-04T09:30:00.000Z");

    const plan = planProjectTopUp({
      existingProjectIds: ["kept"],
      candidates: [
        project({ id: "removed", createdAt: new Date("2026-07-01T00:00:00.000Z") }),
        project({ id: "kept", createdAt: new Date("2026-08-05T00:00:00.000Z") }),
        project({ id: "brand-new", createdAt: new Date("2026-08-05T00:00:00.000Z") }),
      ],
      refreshedAt,
      currentMaxOrder: 2,
      target: PROPOSAL_PROJECT_TARGET,
    });

    expect(plan.add).toEqual(["brand-new"]);
    expect(plan.startOrder).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ensureProposal, against a fake tenant client
// ---------------------------------------------------------------------------

interface RecordedCall {
  method: string;
  args: unknown;
}

function fakeDb(options: {
  organizationId?: string;
  existing?: { id: string } | null;
  /** Rows the second read sees, after a losing upsert. */
  afterCollision?: { id: string } | null;
  upsertError?: unknown;
}) {
  const calls: RecordedCall[] = [];
  let reads = 0;

  const db = {
    organizationId: options.organizationId ?? "org-1",
    edition: {
      findFirst: (args: unknown) => {
        calls.push({ method: "findFirst", args });
        reads += 1;
        const row = reads === 1 ? (options.existing ?? null) : (options.afterCollision ?? null);
        return Promise.resolve(row);
      },
      upsert: (args: unknown) => {
        calls.push({ method: "upsert", args });
        if (options.upsertError) return Promise.reject(options.upsertError);
        return Promise.resolve({ id: "created-1" });
      },
    },
  };

  return { db: db as unknown as TenantClient, calls };
}

describe("ensureProposal", () => {
  it("returns the existing proposal for the week without writing", async () => {
    const { db, calls } = fakeDb({ existing: { id: "already-there" } });

    const result = await ensureProposal(db, WEEK);

    expect(result).toEqual({ id: "already-there", week: 32, year: 2026, created: false });
    expect(calls.map((c) => c.method)).toEqual(["findFirst"]);
  });

  // AC-1.4. The tenant client adds organizationId to `create` but not to
  // `where`, so a compound key missing it would upsert across organizations.
  it("passes the whole compound key, organization included", async () => {
    const { db, calls } = fakeDb({ existing: null, organizationId: "org-42" });

    const result = await ensureProposal(db, WEEK);

    expect(result).toEqual({ id: "created-1", week: 32, year: 2026, created: true });

    const upsert = calls.find((c) => c.method === "upsert")?.args as {
      where: { weeklySlot_organizationId: Record<string, unknown> };
      update: Record<string, unknown>;
    };

    /**
     * RQ-008: the key is the weekly slot now, not the week/year pair. This assertion is
     * the whole of AC-1.4 restated: with the slot as the unique key a second weekly for
     * one week is refused by the database, and a special edition holds null there, so a
     * week can carry as many specials as anyone wants.
     */
    expect(upsert.where.weeklySlot_organizationId).toEqual({
      weeklySlot: "2026-W32",
      organizationId: "org-42",
    });
    // An existing row is left exactly as it is: the upsert is a create or a
    // no-op, never an overwrite of someone's edited proposal.
    expect(upsert.update).toEqual({});
  });

  it("creates a draft and nothing else, so proposing is not sending", async () => {
    const { db, calls } = fakeDb({ existing: null });

    await ensureProposal(db, WEEK);

    const upsert = calls.find((c) => c.method === "upsert")?.args as {
      create: Record<string, unknown>;
    };

    expect(upsert.create).toEqual({
      weeklySlot: "2026-W32",
      week: 32,
      year: 2026,
      kind: "WEEKLY",
      // WEEK.startsAt: the Monday isoWeekStart computed, handed in by the caller, so the
      // schedule and this write cannot disagree about which day the week begins on.
      publishDate: new Date("2026-08-03T00:00:00.000Z"),
      status: "DRAFT",
    });
  });

  it("looks the existing proposal up by its slot, not by the week columns", async () => {
    const { db, calls } = fakeDb({ existing: { id: "already-there" } });

    await ensureProposal(db, WEEK);

    const findFirst = calls.find((c) => c.method === "findFirst")?.args as {
      where: Record<string, unknown>;
    };

    expect(findFirst.where).toEqual({ weeklySlot: "2026-W32" });
  });

  // AC-1.3: opening the product while the schedule runs yields one proposal,
  // and the loser of the race re-reads instead of showing an error.
  it("resolves a unique collision to the row that won", async () => {
    const { db, calls } = fakeDb({
      existing: null,
      upsertError: Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
      afterCollision: { id: "won-the-race" },
    });

    const result = await ensureProposal(db, WEEK);

    expect(result).toEqual({ id: "won-the-race", week: 32, year: 2026, created: false });
    expect(calls.map((c) => c.method)).toEqual(["findFirst", "upsert", "findFirst"]);
  });

  it("re-throws anything that is not a unique collision", async () => {
    const { db } = fakeDb({
      existing: null,
      upsertError: Object.assign(new Error("connection lost"), { code: "P1001" }),
    });

    await expect(ensureProposal(db, WEEK)).rejects.toThrow("connection lost");
  });
});

// ---------------------------------------------------------------------------
// readEditionArticles: the fourth silent-wipe instance
// ---------------------------------------------------------------------------

/**
 * `readEditionArticleRows`, twenty lines above the function under test, carries a comment
 * warning that any reader of the join table must keep `useLinkTake`. This function did not,
 * so `GET /api/editions/proposal` answered `useLinkTake: undefined` for every article, the
 * dashboard's `editionPatchPayload` wrote that back as `false`, and the very next reorder on
 * the proposal screen cleared every flag on the edition with no Link Take UI anywhere on that
 * screen to reveal it.
 */
describe("readEditionArticles", () => {
  function fakeArticle(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      title: `Story ${id}`,
      sourceUrl: `https://example.test/${id}`,
      author: null,
      publishedAt: new Date("2026-08-03T00:00:00.000Z"),
      capturedAt: new Date("2026-08-03T00:00:00.000Z"),
      relevanceScore: 8,
      summary: "One sentence.",
      category: ["Models"],
      status: "APPROVED",
      content: "",
      contentHash: null,
      ...overrides,
    };
  }

  function fakeDbForArticles(options: {
    rows: Array<{ order: number; useLinkTake: boolean; article: ReturnType<typeof fakeArticle> }>;
    rewrites?: Array<Record<string, unknown>>;
  }) {
    const db = {
      $raw: {
        editionArticle: {
          findMany: () => Promise.resolve(options.rows),
        },
      },
      articleRewrite: {
        findMany: () => Promise.resolve(options.rewrites ?? []),
      },
      article: {
        findMany: (args: { where: { id: { in: string[] } } }) => {
          const ids = args.where.id.in;
          return Promise.resolve(
            options.rows.map((row) => row.article).filter((a) => ids.includes(a.id))
          );
        },
      },
    };

    return db as unknown as TenantClient;
  }

  it("carries useLinkTake off the join row, not defaulted to false", async () => {
    const db = fakeDbForArticles({
      rows: [
        { order: 1, useLinkTake: true, article: fakeArticle("flagged") },
        { order: 2, useLinkTake: false, article: fakeArticle("plain") },
      ],
    });

    const result = await readEditionArticles(db, "edition-1");

    expect(result.map((a) => ({ id: a.id, useLinkTake: a.useLinkTake }))).toEqual([
      { id: "flagged", useLinkTake: true },
      { id: "plain", useLinkTake: false },
    ]);
  });

  it("reports hasUsableTake from a batched read, not a default", async () => {
    const db = fakeDbForArticles({
      rows: [
        { order: 1, useLinkTake: true, article: fakeArticle("has-take") },
        { order: 2, useLinkTake: true, article: fakeArticle("no-take") },
      ],
      rewrites: [
        {
          articleId: "has-take",
          title: "A verified take",
          body: "Body text.",
          language: "pt-PT",
          status: "GENERATED",
          checksPassed: true,
          supersededAt: null,
          sourceHash: null,
          generatedAt: new Date("2026-08-03T00:00:00.000Z"),
        },
      ],
    });

    const result = await readEditionArticles(db, "edition-1");

    expect(result.find((a) => a.id === "has-take")?.hasUsableTake).toBe(true);
    expect(result.find((a) => a.id === "no-take")?.hasUsableTake).toBe(false);
  });

  it("survives the round trip GET /api/editions/proposal feeds into editionPatchPayload", async () => {
    // The regression itself: read, hand to the screen's payload builder exactly as the
    // dashboard does on load, and check the flag a person set is still true rather than
    // silently reset to false.
    const db = fakeDbForArticles({
      rows: [{ order: 1, useLinkTake: true, article: fakeArticle("flagged") }],
    });

    const articles = await readEditionArticles(db, "edition-1");

    const body = editionPatchPayload({
      id: "edition-1",
      week: 32,
      year: 2026,
      title: null,
      kind: "WEEKLY",
      publishDate: "2026-08-03T00:00:00.000Z",
      label: "Week 32",
      status: "DRAFT",
      thin: false,
      archivedAt: null,
      sentAt: null,
      approvedAt: null,
      approvedByEmail: null,
      articles,
      projects: [],
    });

    expect(body.articles).toEqual([{ articleId: "flagged", order: 1, useLinkTake: true }]);
  });
});
