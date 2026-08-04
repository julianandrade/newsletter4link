import type { TenantClient } from "@/lib/db/tenant";

/**
 * RQ-005 action 7 and 8, D5: what may happen to an edition, and what happens to
 * its delivery history when it goes.
 *
 * Anything sent is archived, not deleted. Delete is for an edition that never
 * went out, so there is no delivery history to orphan. Force delete is an
 * OWNER's decision and takes the delivery events with it, in the same
 * transaction, because EmailEvent.editionId carried no foreign key and no
 * cascade: a plain delete left the events pointing at nothing (BR-013).
 *
 * The planner is pure so the rules can be tested without a database, which is
 * how every test in tests/unit works.
 */

/** Above this, a single request is doing too much to stay inside a timeout. */
export const MAX_BULK_EDITIONS = 500;

export type EditionBulkAction = "archive" | "unarchive" | "delete" | "forceDelete";

export type HeldBackReason =
  | "not-found" // another organization's id, or no such edition
  | "already-sent" // delete refuses it, archive is the action for it
  | "already-archived"
  | "not-archived";

export interface BulkTarget {
  id: string;
  status: "DRAFT" | "FINALIZED" | "SENT";
  sentAt: Date | null;
  archivedAt: Date | null;
  week: number;
  year: number;
}

export interface HeldBackEdition {
  id: string;
  reason: HeldBackReason;
}

export interface BulkPlan {
  apply: string[];
  heldBack: HeldBackEdition[];
}

export interface BulkOutcome {
  requested: number;
  affected: number;
  heldBack: HeldBackEdition[];
  deletedEvents?: number;
  recipients?: number;
}

/**
 * RQ-005 AC-7.5, AC-7.8: a mixed selection is split by outcome rather than
 * refused, and an id that resolves to nothing is reported as not found rather
 * than as an error.
 *
 * `resolved` must come from a tenant-scoped read, so an id belonging to another
 * organization simply is not in it and falls out as "not-found": never 403, and
 * never the row.
 */
export function planEditionBulk(
  action: EditionBulkAction,
  requestedIds: string[],
  resolved: BulkTarget[]
): BulkPlan {
  const byId = new Map(resolved.map((target) => [target.id, target]));
  const seen = new Set<string>();

  const apply: string[] = [];
  const heldBack: HeldBackEdition[] = [];

  for (const id of requestedIds) {
    if (seen.has(id)) continue;
    seen.add(id);

    const target = byId.get(id);

    if (!target) {
      heldBack.push({ id, reason: "not-found" });
      continue;
    }

    const reason = holdBackReason(action, target);

    if (reason) {
      heldBack.push({ id, reason });
    } else {
      apply.push(id);
    }
  }

  return { apply, heldBack };
}

function holdBackReason(
  action: EditionBulkAction,
  target: BulkTarget
): HeldBackReason | null {
  switch (action) {
    case "archive":
      return target.archivedAt ? "already-archived" : null;
    case "unarchive":
      return target.archivedAt ? null : "not-archived";
    // Keys on sentAt rather than on status === "DRAFT". A finalized edition that
    // never went out has no delivery history, so there is nothing to orphan and
    // nothing to preserve, and today's route refuses it for no reason.
    case "delete":
      return target.sentAt ? "already-sent" : null;
    // An OWNER who has read a confirmation stating the real numbers has already
    // made the decision the restriction exists to protect, so a mixed selection
    // is accepted rather than refused.
    case "forceDelete":
      return null;
  }
}

const PAST_TENSE: Record<EditionBulkAction, string> = {
  archive: "archived",
  unarchive: "restored from the archive",
  delete: "deleted",
  forceDelete: "force deleted",
};

const HELD_BACK_WORDS: Record<HeldBackReason, (count: number) => string> = {
  "not-found": (count) =>
    `${count} ${count === 1 ? "does" : "do"} not exist here`,
  "already-sent": (count) =>
    `${count} ${count === 1 ? "was" : "were"} already sent, archive ${
      count === 1 ? "it" : "those"
    } instead`,
  "already-archived": (count) =>
    `${count} ${count === 1 ? "was" : "were"} already archived`,
  "not-archived": (count) =>
    `${count} ${count === 1 ? "was" : "were"} not archived`,
};

/**
 * RQ-005 AC-7.6 and AC-8.6: what happened, with the numbers and the reason.
 *
 * Affecting fewer editions than were selected without saying so is the failure
 * this sentence exists to catch, so the count and the reason are always in it.
 */
export function describeBulkOutcome(
  action: EditionBulkAction,
  outcome: BulkOutcome
): string {
  const { requested, affected, heldBack } = outcome;
  const verb = PAST_TENSE[action];
  const noun = affected === 1 ? "edition" : "editions";

  const head =
    affected === 0
      ? `Nothing ${verb}.`
      : affected < requested
        ? `${affected} of ${requested} selected editions ${verb}.`
        : `${affected} ${noun} ${verb}.`;

  const parts = [head];

  if (action === "forceDelete" && affected > 0) {
    const events = outcome.deletedEvents ?? 0;
    const recipients = outcome.recipients ?? 0;
    parts.push(
      `${events} delivery ${events === 1 ? "record" : "records"} for ${recipients} ${
        recipients === 1 ? "recipient" : "recipients"
      } destroyed with ${affected === 1 ? "it" : "them"}.`
    );
  }

  if (heldBack.length > 0) {
    parts.push(`Held back: ${describeHeldBack(heldBack)}.`);
  }

  return parts.join(" ");
}

function describeHeldBack(heldBack: HeldBackEdition[]): string {
  const counts = new Map<HeldBackReason, number>();

  for (const entry of heldBack) {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([reason, count]) => HELD_BACK_WORDS[reason](count))
    .join(", ");
}

/**
 * RQ-005 AC-7.7: the cap is stated in the refusal, so a caller learns the number
 * rather than guessing it.
 */
export function overCapMessage(requested: number): string {
  return `Cannot act on more than ${MAX_BULK_EDITIONS} editions at once: ${requested} were selected.`;
}

/**
 * RQ-005 AC-8.6: the numbers a force-delete confirmation states, read from the
 * data at the moment of asking rather than as a generic warning.
 *
 * `ids` must already have been resolved through db.edition.
 */
export async function countDeliveryImpact(
  db: TenantClient,
  ids: string[]
): Promise<{ events: number; recipients: number }> {
  if (ids.length === 0) return { events: 0, recipients: 0 };

  // Scoped through the edition, because emailEvent carries no organizationId and
  // an unscoped read here would report another tenant's delivery numbers back
  // inside this tenant's confirmation dialog.
  const events = await db.emailEvent.findMany({
    where: {
      editionId: { in: ids },
      edition: { organizationId: db.organizationId },
    },
    select: { subscriberId: true },
  });

  return {
    events: events.length,
    recipients: new Set(events.map((event) => event.subscriberId)).size,
  };
}

/** RQ-005 AC-8.2, AC-8.3: sent means archive, and archiving destroys nothing. */
export async function archiveEditions(
  db: TenantClient,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;

  const result = await db.edition.updateMany({
    where: { id: { in: ids }, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  return result.count;
}

/** RQ-005 AC-8.3: unarchiving puts the edition back in the default list. */
export async function unarchiveEditions(
  db: TenantClient,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;

  const result = await db.edition.updateMany({
    where: { id: { in: ids }, archivedAt: { not: null } },
    data: { archivedAt: null },
  });

  return result.count;
}

/**
 * RQ-005 AC-8.4 and AC-8.8: delete is for an edition that was never sent.
 *
 * Such an edition should carry no delivery events at all, and the events are
 * still removed in the same transaction: BR-013 must not depend on that
 * expectation holding. The `sentAt: null` guard is repeated here so a caller
 * that skipped the planner cannot use this to destroy a send record.
 */
export async function deleteNeverSentEditions(
  db: TenantClient,
  ids: string[]
): Promise<{ editions: number; events: number }> {
  if (ids.length === 0) return { editions: 0, events: 0 };

  return db.$raw.$transaction(async (tx) => {
    // The events carry exactly the conditions the edition delete below carries.
    // Filtering the edition on `sentAt: null` while deleting its events
    // unconditionally was the worse half of the same inconsistency: asked for a
    // sent edition, it kept the edition and destroyed the record that it went out.
    const deletable = {
      editionId: { in: ids },
      edition: { organizationId: db.organizationId, sentAt: null },
    };

    const events = await tx.emailEvent.deleteMany({ where: deletable });

    const editions = await tx.edition.deleteMany({
      where: {
        id: { in: ids },
        organizationId: db.organizationId,
        sentAt: null,
      },
    });

    return { editions: editions.count, events: events.count };
  });
}

/**
 * RQ-005 AC-8.5, AC-8.7, AC-8.9: the edition and its delivery events go
 * together or not at all.
 *
 * OWNER-only, enforced by the route. The events are counted before they are
 * deleted, because the reported numbers are part of what makes this decision
 * accountable, and they are deleted before the editions so the transaction never
 * leans on cascade behaviour to keep BR-013 true.
 */
export async function forceDeleteEditions(
  db: TenantClient,
  ids: string[]
): Promise<{ editions: number; events: number; recipients: number }> {
  if (ids.length === 0) return { editions: 0, events: 0, recipients: 0 };

  return db.$raw.$transaction(async (tx) => {
    // Scoped through the edition relation, the same way the delete below is
    // scoped. `ids` always arrives from a tenant-scoped read today, but this
    // function deletes delivery history and cannot depend on its caller for that:
    // filtering the edition and not its events would have left the events of
    // another tenant's edition reachable by id alone.
    const ownEditions = {
      editionId: { in: ids },
      edition: { organizationId: db.organizationId },
    };

    const events = await tx.emailEvent.findMany({
      where: ownEditions,
      select: { subscriberId: true },
    });

    await tx.emailEvent.deleteMany({ where: ownEditions });

    const editions = await tx.edition.deleteMany({
      where: { id: { in: ids }, organizationId: db.organizationId },
    });

    return {
      editions: editions.count,
      events: events.length,
      recipients: new Set(events.map((event) => event.subscriberId)).size,
    };
  });
}
