import { describe, expect, it } from "vitest";
import { applyBulk } from "@/lib/articles/bulk-apply";

/**
 * What the route does with a parsed action. The interesting parts are the two things the
 * old route got wrong: it never reported which ids it changed, so the client's Undo acted
 * on the whole selection including the rows somebody else had already decided; and nothing
 * detached a discarded article from an edition that had not gone out yet.
 */

function fakeDb(options: {
  matching?: string[];
  editions?: Array<{ id: string }>;
} = {}) {
  const calls: Record<string, any> = {};

  return {
    calls,
    db: {
      organizationId: "org-1",
      article: {
        findMany: async (args: any) => {
          calls.articleFindMany = args;
          return (options.matching ?? []).map((id) => ({ id }));
        },
        updateMany: async (args: any) => {
          calls.articleUpdateMany = args;
          return { count: (options.matching ?? []).length };
        },
      },
      edition: {
        findMany: async (args: any) => {
          calls.editionFindMany = args;
          return options.editions ?? [];
        },
      },
      editionArticle: {
        deleteMany: async (args: any) => {
          calls.editionArticleDeleteMany = args;
          return { count: 1 };
        },
      },
    } as any,
  };
}

const now = new Date("2026-08-07T10:00:00.000Z");

describe("applyBulk", () => {
  it("reports the ids it actually changed, not the ids it was asked about", async () => {
    // The client's Undo is built on this. Reporting the whole selection is how an undo
    // reopens a verdict another reviewer took in between.
    const { db } = fakeDb({ matching: ["a", "c"] });

    const result = await applyBulk(db, { action: "approve", ids: ["a", "b", "c"] }, now);

    expect(result.affectedIds).toEqual(["a", "c"]);
    expect(result.affected).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it("selects the matching ids before writing, so the report is not a guess", async () => {
    const { db, calls } = fakeDb({ matching: ["a"] });

    await applyBulk(db, { action: "approve", ids: ["a", "b"] }, now);

    expect(calls.articleFindMany.where).toEqual({
      id: { in: ["a", "b"] },
      status: { in: ["PENDING_REVIEW", "REJECTED"] },
    });
    expect(calls.articleUpdateMany.where).toEqual({ id: { in: ["a"] } });
    expect(calls.articleUpdateMany.data).toEqual({ status: "APPROVED" });
  });

  it("writes nothing when the guard matched nothing", async () => {
    const { db, calls } = fakeDb({ matching: [] });

    const result = await applyBulk(db, { action: "reset", ids: ["a"] }, now);

    expect(result.affected).toBe(0);
    expect(result.skipped).toBe(1);
    expect(calls.articleUpdateMany).toBeUndefined();
  });

  it("detaches a discarded article from editions that have not been sent", async () => {
    const { db, calls } = fakeDb({ matching: ["a"], editions: [{ id: "ed-1" }] });

    const result = await applyBulk(db, { action: "discard", ids: ["a"] }, now);

    expect(calls.editionFindMany.where.status).toEqual({ not: "SENT" });
    expect(calls.editionArticleDeleteMany.where).toEqual({
      editionId: { in: ["ed-1"] },
      articleId: { in: ["a"] },
    });
    expect(result.detachedFrom).toBe(1);
  });

  it("resolves the edition ids through the scoped client, never from the request", async () => {
    // editionArticle.deleteMany is not organization-scoped by the tenant client and cannot
    // be, so the ids it is given must have come back from db.edition.findMany.
    const { db, calls } = fakeDb({ matching: ["a"], editions: [{ id: "ed-1" }] });

    await applyBulk(db, { action: "discard", ids: ["a"] }, now);

    expect(calls.editionFindMany).toBeDefined();
    expect(calls.editionArticleDeleteMany.where.editionId.in).toEqual(["ed-1"]);
  });

  it("leaves sent editions alone, because their snapshot is the record", async () => {
    const { db, calls } = fakeDb({ matching: ["a"], editions: [] });

    const result = await applyBulk(db, { action: "discard", ids: ["a"] }, now);

    expect(calls.editionArticleDeleteMany).toBeUndefined();
    expect(result.detachedFrom).toBe(0);
  });

  it("does not touch editions for any action other than discard", async () => {
    for (const action of ["approve", "reject", "reset", "restore"] as const) {
      const { db, calls } = fakeDb({ matching: ["a"], editions: [{ id: "ed-1" }] });

      await applyBulk(db, { action, ids: ["a"] }, now);

      expect(calls.editionFindMany).toBeUndefined();
    }
  });
});
