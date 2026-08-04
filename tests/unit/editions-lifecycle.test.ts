import { describe, expect, it } from "vitest";
import type { TenantClient } from "@/lib/db/tenant";
import {
  archiveEditions,
  countDeliveryImpact,
  deleteNeverSentEditions,
  describeBulkOutcome,
  forceDeleteEditions,
  MAX_BULK_EDITIONS,
  overCapMessage,
  planEditionBulk,
  unarchiveEditions,
  type BulkTarget,
} from "@/lib/editions/lifecycle";

/**
 * RQ-005 action 7 and 8, D5: the archive and force-delete rules.
 *
 * The point of these tests is BR-013. EmailEvent.editionId has no foreign key and
 * no cascade, so deleting an edition used to leave its delivery history pointing
 * at nothing. Anything sent is archived; delete is for what never went out; force
 * delete removes the events in the same transaction.
 */

function target(overrides: Partial<BulkTarget> = {}): BulkTarget {
  return {
    id: "e1",
    status: "DRAFT",
    sentAt: null,
    archivedAt: null,
    week: 32,
    year: 2026,
    ...overrides,
  };
}

const draft = target({ id: "draft" });
const finalized = target({ id: "finalized", status: "FINALIZED" });
const sent = target({
  id: "sent",
  status: "SENT",
  sentAt: new Date("2026-08-02T10:00:00Z"),
});
const archived = target({
  id: "archived",
  status: "SENT",
  sentAt: new Date("2026-07-26T10:00:00Z"),
  archivedAt: new Date("2026-07-27T10:00:00Z"),
});

describe("planEditionBulk, archive", () => {
  it("archives anything not already archived, sent editions included", () => {
    const plan = planEditionBulk("archive", ["sent", "draft"], [sent, draft]);
    expect(plan.apply).toEqual(["sent", "draft"]);
    expect(plan.heldBack).toEqual([]);
  });

  it("holds back one that is already archived, and says so", () => {
    const plan = planEditionBulk("archive", ["archived", "sent"], [archived, sent]);
    expect(plan.apply).toEqual(["sent"]);
    expect(plan.heldBack).toEqual([{ id: "archived", reason: "already-archived" }]);
  });
});

describe("planEditionBulk, unarchive", () => {
  it("restores only what is archived", () => {
    const plan = planEditionBulk("unarchive", ["archived", "sent"], [archived, sent]);
    expect(plan.apply).toEqual(["archived"]);
    expect(plan.heldBack).toEqual([{ id: "sent", reason: "not-archived" }]);
  });
});

describe("planEditionBulk, delete", () => {
  it("deletes a finalized edition that never went out", () => {
    // Conflict C4: the old route refused anything that was not DRAFT, so a
    // finalized-but-never-sent edition could not be deleted at all. It has no
    // delivery history, so there is nothing to orphan and nothing to preserve.
    const plan = planEditionBulk("delete", ["draft", "finalized"], [draft, finalized]);
    expect(plan.apply).toEqual(["draft", "finalized"]);
    expect(plan.heldBack).toEqual([]);
  });

  it("holds back anything sent, because archive is the action for it", () => {
    const plan = planEditionBulk("delete", ["sent"], [sent]);
    expect(plan.apply).toEqual([]);
    expect(plan.heldBack).toEqual([{ id: "sent", reason: "already-sent" }]);
  });

  it("keys on sentAt, not on status", () => {
    // A row whose status drifted from its sentAt must still be protected: the
    // send record is what makes it undeletable, not the enum.
    const odd = target({ id: "odd", status: "DRAFT", sentAt: new Date() });
    expect(planEditionBulk("delete", ["odd"], [odd]).heldBack).toEqual([
      { id: "odd", reason: "already-sent" },
    ]);
  });

  it("splits a mixed selection rather than refusing it", () => {
    const plan = planEditionBulk(
      "delete",
      ["draft", "sent", "finalized", "archived"],
      [draft, sent, finalized, archived]
    );
    expect(plan.apply).toEqual(["draft", "finalized"]);
    expect(plan.heldBack).toEqual([
      { id: "sent", reason: "already-sent" },
      { id: "archived", reason: "already-sent" },
    ]);
  });
});

describe("planEditionBulk, forceDelete", () => {
  it("accepts a mixed selection, since the OWNER already read the numbers", () => {
    const plan = planEditionBulk(
      "forceDelete",
      ["draft", "sent", "archived"],
      [draft, sent, archived]
    );
    expect(plan.apply).toEqual(["draft", "sent", "archived"]);
    expect(plan.heldBack).toEqual([]);
  });
});

describe("planEditionBulk, ids that resolve to nothing", () => {
  it("reports another organization's id as not found, never as an error", () => {
    // The resolved list comes from a tenant-scoped read, so a foreign id simply
    // is not in it. It must be indistinguishable from an id that never existed.
    const plan = planEditionBulk("delete", ["draft", "someone-elses"], [draft]);
    expect(plan.apply).toEqual(["draft"]);
    expect(plan.heldBack).toEqual([{ id: "someone-elses", reason: "not-found" }]);
  });

  it("holds back every id when nothing resolves, and still succeeds", () => {
    const plan = planEditionBulk("forceDelete", ["a", "b"], []);
    expect(plan.apply).toEqual([]);
    expect(plan.heldBack).toEqual([
      { id: "a", reason: "not-found" },
      { id: "b", reason: "not-found" },
    ]);
  });
});

describe("planEditionBulk, duplicates", () => {
  it("counts a repeated id once", () => {
    const plan = planEditionBulk("delete", ["draft", "draft", "sent", "sent"], [
      draft,
      sent,
    ]);
    expect(plan.apply).toEqual(["draft"]);
    expect(plan.heldBack).toEqual([{ id: "sent", reason: "already-sent" }]);
  });
});

describe("describeBulkOutcome", () => {
  it("states the plain count when everything selected was affected", () => {
    expect(
      describeBulkOutcome("delete", { requested: 4, affected: 4, heldBack: [] })
    ).toBe("4 editions deleted.");
  });

  it("says so when fewer editions were affected than were selected", () => {
    // AC-7.6: silently affecting fewer rows than asked is the failure this
    // sentence exists to catch, so both the number and the reason are in it.
    const message = describeBulkOutcome("delete", {
      requested: 6,
      affected: 4,
      heldBack: [
        { id: "sent", reason: "already-sent" },
        { id: "archived", reason: "already-sent" },
      ],
    });
    expect(message).toContain("4 of 6");
    expect(message).toContain("2 were already sent");
    expect(message).toContain("archive those instead");
  });

  it("names each reason it held something back for", () => {
    const message = describeBulkOutcome("archive", {
      requested: 3,
      affected: 1,
      heldBack: [
        { id: "a", reason: "already-archived" },
        { id: "b", reason: "not-found" },
      ],
    });
    expect(message).toContain("1 was already archived");
    expect(message).toContain("1 does not exist here");
  });

  it("says nothing happened rather than reporting a zero", () => {
    expect(
      describeBulkOutcome("archive", {
        requested: 1,
        affected: 0,
        heldBack: [{ id: "a", reason: "not-found" }],
      })
    ).toBe("Nothing archived. Held back: 1 does not exist here.");
  });

  it("states the delivery numbers a force delete destroyed", () => {
    // AC-8.6: the real numbers, not a generic warning.
    const message = describeBulkOutcome("forceDelete", {
      requested: 1,
      affected: 1,
      heldBack: [],
      deletedEvents: 11,
      recipients: 9,
    });
    expect(message).toContain("1 edition force deleted");
    expect(message).toContain("11 delivery records for 9 recipients");
  });

  it("does not talk about delivery records for an archive", () => {
    expect(
      describeBulkOutcome("archive", { requested: 2, affected: 2, heldBack: [] })
    ).toBe("2 editions archived.");
  });
});

describe("overCapMessage", () => {
  it("names the cap, so a caller learns the number rather than guessing", () => {
    const message = overCapMessage(900);
    expect(message).toContain(String(MAX_BULK_EDITIONS));
    expect(message).toContain("900");
  });
});

/* ------------------------------------------------------------------ the writes */

interface FakeEvent {
  editionId: string;
  subscriberId: string;
}

interface RecordedCall {
  op: string;
  args: unknown;
}

/**
 * A fake tenant client that records the arguments it was handed. The point is
 * the shape of the calls: that the events go in the same transaction as the
 * editions, that they go first, and that the edition delete still carries
 * organizationId.
 */
function fakeDb(events: FakeEvent[] = []) {
  const calls: RecordedCall[] = [];
  let remaining = [...events];

  const tx = {
    emailEvent: {
      findMany: async (args: { where: { editionId: { in: string[] } } }) => {
        calls.push({ op: "tx.emailEvent.findMany", args });
        const ids = args.where.editionId.in;
        return remaining
          .filter((event) => ids.includes(event.editionId))
          .map((event) => ({ subscriberId: event.subscriberId }));
      },
      deleteMany: async (args: { where: { editionId: { in: string[] } } }) => {
        calls.push({ op: "tx.emailEvent.deleteMany", args });
        const ids = args.where.editionId.in;
        const hit = remaining.filter((event) => ids.includes(event.editionId));
        remaining = remaining.filter((event) => !ids.includes(event.editionId));
        return { count: hit.length };
      },
    },
    edition: {
      deleteMany: async (args: { where: { id: { in: string[] } } }) => {
        calls.push({ op: "tx.edition.deleteMany", args });
        return { count: args.where.id.in.length };
      },
    },
  };

  const db = {
    organizationId: "org-1",
    emailEvent: {
      findMany: async (args: { where: { editionId: { in: string[] } } }) => {
        calls.push({ op: "emailEvent.findMany", args });
        const ids = args.where.editionId.in;
        return remaining
          .filter((event) => ids.includes(event.editionId))
          .map((event) => ({ subscriberId: event.subscriberId }));
      },
    },
    edition: {
      updateMany: async (args: { where: unknown; data: unknown }) => {
        calls.push({ op: "edition.updateMany", args });
        return { count: 1 };
      },
    },
    $raw: {
      $transaction: async <T>(run: (client: typeof tx) => Promise<T>) => run(tx),
    },
  };

  return { db: db as unknown as TenantClient, calls, eventsLeft: () => remaining };
}

describe("deleteNeverSentEditions", () => {
  it("removes any events for the edition in the same transaction", async () => {
    // AC-8.8: the single-edition DELETE route calls this, and it is the path that
    // used to leave delivery history behind. A never-sent edition should carry no
    // events at all, and BR-013 must not depend on that being true.
    const { db, calls } = fakeDb([{ editionId: "draft", subscriberId: "s1" }]);

    const result = await deleteNeverSentEditions(db, ["draft"]);

    expect(result).toEqual({ editions: 1, events: 1 });
    expect(calls.map((call) => call.op)).toEqual([
      "tx.emailEvent.deleteMany",
      "tx.edition.deleteMany",
    ]);
  });

  it("scopes the edition delete to the organization and to what never went out", async () => {
    const { db, calls } = fakeDb();

    await deleteNeverSentEditions(db, ["draft"]);

    const editionDelete = calls.find((call) => call.op === "tx.edition.deleteMany");
    expect(editionDelete?.args).toEqual({
      where: { id: { in: ["draft"] }, organizationId: "org-1", sentAt: null },
    });
  });

  it("scopes the event delete exactly as it scopes the edition delete", async () => {
    // EmailEvent has no organizationId, so it can only be scoped through the
    // edition. Filtering the edition on organization and sentAt while deleting its
    // events unconditionally kept a sent edition and destroyed the record that it
    // went out, and reached another tenant's events by id alone.
    const { db, calls } = fakeDb();

    await deleteNeverSentEditions(db, ["draft"]);

    const eventDelete = calls.find((call) => call.op === "tx.emailEvent.deleteMany");
    expect(eventDelete?.args).toEqual({
      where: {
        editionId: { in: ["draft"] },
        edition: { organizationId: "org-1", sentAt: null },
      },
    });
  });

  it("touches nothing for an empty selection", async () => {
    const { db, calls } = fakeDb();
    expect(await deleteNeverSentEditions(db, [])).toEqual({
      editions: 0,
      events: 0,
    });
    expect(calls).toEqual([]);
  });
});

describe("forceDeleteEditions", () => {
  it("takes the delivery history with the edition, events first", async () => {
    const { db, calls, eventsLeft } = fakeDb([
      { editionId: "sent", subscriberId: "s1" },
      { editionId: "sent", subscriberId: "s2" },
      { editionId: "other", subscriberId: "s3" },
    ]);

    const result = await forceDeleteEditions(db, ["sent"]);

    expect(result).toEqual({ editions: 1, events: 2, recipients: 2 });
    expect(calls.map((call) => call.op)).toEqual([
      "tx.emailEvent.findMany",
      "tx.emailEvent.deleteMany",
      "tx.edition.deleteMany",
    ]);
    // Another edition's events are untouched: only what belonged to this one goes.
    expect(eventsLeft()).toEqual([{ editionId: "other", subscriberId: "s3" }]);
  });

  it("counts recipients once, however many events each of them has", async () => {
    const { db } = fakeDb([
      { editionId: "sent", subscriberId: "s1" },
      { editionId: "sent", subscriberId: "s1" },
      { editionId: "sent", subscriberId: "s1" },
      { editionId: "sent", subscriberId: "s2" },
    ]);

    expect(await forceDeleteEditions(db, ["sent"])).toEqual({
      editions: 1,
      events: 4,
      recipients: 2,
    });
  });

  it("scopes both the event read and the event delete through the edition", async () => {
    const { db, calls } = fakeDb();

    await forceDeleteEditions(db, ["sent"]);

    const scoped = {
      editionId: { in: ["sent"] },
      edition: { organizationId: "org-1" },
    };
    expect(calls.find((c) => c.op === "tx.emailEvent.findMany")?.args).toEqual({
      where: scoped,
      select: { subscriberId: true },
    });
    expect(calls.find((c) => c.op === "tx.emailEvent.deleteMany")?.args).toEqual({
      where: scoped,
    });
  });

  it("scopes the edition delete to the organization", async () => {
    const { db, calls } = fakeDb();

    await forceDeleteEditions(db, ["sent"]);

    const editionDelete = calls.find((call) => call.op === "tx.edition.deleteMany");
    expect(editionDelete?.args).toEqual({
      where: { id: { in: ["sent"] }, organizationId: "org-1" },
    });
  });

  it("touches nothing for an empty selection", async () => {
    const { db, calls } = fakeDb();
    expect(await forceDeleteEditions(db, [])).toEqual({
      editions: 0,
      events: 0,
      recipients: 0,
    });
    expect(calls).toEqual([]);
  });
});

describe("countDeliveryImpact", () => {
  it("reads the real numbers the confirmation states", async () => {
    const { db } = fakeDb([
      { editionId: "sent", subscriberId: "s1" },
      { editionId: "sent", subscriberId: "s2" },
      { editionId: "sent", subscriberId: "s2" },
      { editionId: "elsewhere", subscriberId: "s9" },
    ]);

    expect(await countDeliveryImpact(db, ["sent"])).toEqual({
      events: 3,
      recipients: 2,
    });
  });

  it("reads only this organization's events", async () => {
    const { db, calls } = fakeDb();

    await countDeliveryImpact(db, ["sent"]);

    expect(calls.find((c) => c.op === "emailEvent.findMany")?.args).toEqual({
      where: {
        editionId: { in: ["sent"] },
        edition: { organizationId: "org-1" },
      },
      select: { subscriberId: true },
    });
  });

  it("reads nothing for an empty selection", async () => {
    const { db, calls } = fakeDb();
    expect(await countDeliveryImpact(db, [])).toEqual({
      events: 0,
      recipients: 0,
    });
    expect(calls).toEqual([]);
  });
});

describe("archiveEditions and unarchiveEditions", () => {
  it("archives only rows that are not archived yet", async () => {
    const { db, calls } = fakeDb();

    await archiveEditions(db, ["sent"]);

    const call = calls.find((entry) => entry.op === "edition.updateMany");
    const args = call?.args as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(args.where).toEqual({ id: { in: ["sent"] }, archivedAt: null });
    expect(args.data.archivedAt).toBeInstanceOf(Date);
  });

  it("unarchives only rows that are archived, and clears the marker", async () => {
    const { db, calls } = fakeDb();

    await unarchiveEditions(db, ["archived"]);

    const call = calls.find((entry) => entry.op === "edition.updateMany");
    expect(call?.args).toEqual({
      where: { id: { in: ["archived"] }, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
  });

  it("does not write for an empty selection", async () => {
    const { db, calls } = fakeDb();
    expect(await archiveEditions(db, [])).toBe(0);
    expect(await unarchiveEditions(db, [])).toBe(0);
    expect(calls).toEqual([]);
  });
});
