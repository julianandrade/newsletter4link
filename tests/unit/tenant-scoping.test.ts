import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The tenant client's whole job is that a caller cannot reach another organization's
 * rows by passing an id. `findMany`, `findFirst`, `count` and `updateMany` all add
 * `organizationId` to the where clause, so the wrapper reads as though everything does.
 *
 * `update` and `delete` did not, on any of the thirteen models. They spread the caller's
 * where through untouched, so `db.article.update({ where: { id } })` wrote to whichever
 * organization owned that id. Every present and future caller that trusted the wrapper
 * was performing a cross-tenant write, and the routes that are safe today are safe only
 * because they happen to read the row with a scoped `findFirst` first.
 *
 * These tests are the wrapper's contract, asserted per model, so a model added later
 * without scoping fails here rather than in production.
 */

const calls: Array<{ model: string; method: string; args: any }> = [];

function recorder(model: string) {
  return new Proxy(
    {},
    {
      get: (_target, method: string) => (args: unknown) => {
        calls.push({ model, method, args });
        return Promise.resolve({ id: "row-1", organizationId: "org-1" });
      },
    }
  );
}

vi.mock("@/lib/db", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, model: string) => recorder(model),
    }
  ),
}));

import { createTenantClient } from "@/lib/db/tenant";

/**
 * Every model the wrapper scopes, paired with the Prisma delegate it forwards to.
 *
 * `rSSSource` is spelled that way by Prisma's client, from the `RSSSource` model name.
 */
const MODELS = [
  "article",
  "project",
  "edition",
  "subscriber",
  "rSSSource",
  "curationJob",
  "emailTemplate",
  "mediaAsset",
  "brandVoice",
  "searchTopic",
  "searchHistory",
  "generationDraft",
  "apiKey",
] as const;

type ModelName = (typeof MODELS)[number];

function db() {
  return createTenantClient("org-1") as unknown as Record<
    ModelName,
    Record<string, (args: unknown) => Promise<unknown>>
  > & { organizationId: string };
}

function lastCall(method: string) {
  const found = [...calls].reverse().find((call) => call.method === method);
  if (!found) throw new Error(`the wrapper never called prisma.<model>.${method}`);
  return found;
}

beforeEach(() => {
  calls.length = 0;
});

describe("update is scoped to the organization", () => {
  for (const model of MODELS) {
    const client = createTenantClient("org-1") as unknown as Record<string, any>;
    if (typeof client[model]?.update !== "function") continue;

    it(`${model}.update carries organizationId into the where clause`, async () => {
      await db()[model].update({ where: { id: "row-1" }, data: { x: 1 } });

      expect(lastCall("update").args.where).toEqual({
        id: "row-1",
        organizationId: "org-1",
      });
    });

    it(`${model}.update cannot be talked out of it by the caller`, async () => {
      // A caller passing someone else's organizationId must not win. The wrapper's
      // value is applied last, so this is the assertion that a crafted body cannot
      // widen the scope.
      await db()[model].update({
        where: { id: "row-1", organizationId: "org-999" },
        data: { x: 1 },
      });

      expect(lastCall("update").args.where.organizationId).toBe("org-1");
    });
  }
});

describe("delete is scoped to the organization", () => {
  for (const model of MODELS) {
    const client = createTenantClient("org-1") as unknown as Record<string, any>;
    if (typeof client[model]?.delete !== "function") continue;

    it(`${model}.delete carries organizationId into the where clause`, async () => {
      await db()[model].delete({ where: { id: "row-1" } });

      expect(lastCall("delete").args.where).toEqual({
        id: "row-1",
        organizationId: "org-1",
      });
    });
  }
});

describe("what already worked keeps working", () => {
  it("findFirst is still scoped", async () => {
    await db().article.findFirst({ where: { id: "row-1" } });

    expect(lastCall("findFirst").args.where).toEqual({
      id: "row-1",
      organizationId: "org-1",
    });
  });

  it("updateMany is still scoped", async () => {
    await db().article.updateMany({ where: { status: "APPROVED" }, data: { x: 1 } });

    expect(lastCall("updateMany").args.where).toEqual({
      status: "APPROVED",
      organizationId: "org-1",
    });
  });

  it("create still injects the organization rather than trusting the caller", async () => {
    await db().article.create({ data: { title: "A story" } });

    expect(lastCall("create").args.data).toMatchObject({
      title: "A story",
      organizationId: "org-1",
    });
  });

  it("data is left alone by update, which only touches the where", async () => {
    await db().article.update({
      where: { id: "row-1" },
      data: { summary: "edited" },
    });

    expect(lastCall("update").args.data).toEqual({ summary: "edited" });
  });
});

describe("discarded articles are out of every list", () => {
  it("findMany excludes them by default", async () => {
    await db().article.findMany({ where: { status: "APPROVED" } });

    expect(lastCall("findMany").args.where).toEqual({
      discardedAt: null,
      status: "APPROVED",
      organizationId: "org-1",
    });
  });

  it("count excludes them by default, so the counts match the lists", async () => {
    await db().article.count({ where: { status: "APPROVED" } });

    expect(lastCall("count").args.where).toEqual({
      discardedAt: null,
      status: "APPROVED",
      organizationId: "org-1",
    });
  });

  it("a caller that asks for them by name wins", async () => {
    // The discard filter is applied before the caller's where, unlike organizationId which
    // is applied after. The scope is not the caller's to widen; the discard view is.
    await db().article.findMany({ where: { discardedAt: { not: null } } });

    expect(lastCall("findMany").args.where.discardedAt).toEqual({ not: null });
    expect(lastCall("findMany").args.where.organizationId).toBe("org-1");
  });

  it("findFirst and findUnique still find one, so a discarded article can be restored", async () => {
    // The detail screen has to open a discarded article to offer Restore. A lookup by id is
    // never a list, so it is never filtered.
    await db().article.findFirst({ where: { id: "row-1" } });

    expect("discardedAt" in lastCall("findFirst").args.where).toBe(false);
  });

  it("updateMany still reaches one, so restore can write to it", async () => {
    await db().article.updateMany({ where: { id: { in: ["row-1"] } }, data: { x: 1 } });

    expect("discardedAt" in lastCall("updateMany").args.where).toBe(false);
  });
});
