import { verifyToken } from "./unsubscribe-token";

/**
 * Who is allowed to read an edition in a browser, decided in one place.
 *
 * Extracted from the page so all five outcomes can be tested. They cannot be tested through the
 * page: verifying them needs a subscriber, an edition and a SENT event, and `EmailEvent` is
 * empty, so the interesting branches are unreachable against real data.
 *
 * The lookups are injected rather than imported. This module stays free of Prisma so the
 * decision can be exercised with fakes, and the page supplies the real reads.
 */

export interface ArchiveLookups {
  /** The subscriber a verified token names, or null when there is no such row. */
  findSubscriber(
    subscriberId: string
  ): Promise<{ active: boolean; organizationId: string } | null>;
  /** Whether a SENT event ties this subscriber to this edition. */
  wasSentTo(subscriberId: string, editionId: string): Promise<boolean>;
}

export type ArchiveAccess =
  | { allowed: true; subscriberId: string; organizationId: string }
  | { allowed: false; reason: ArchiveDenial };

/**
 * Why a request was refused.
 *
 * Recorded for logs and tests only. Every one of these produces the same 404 for the caller:
 * distinguishing them would let an unauthenticated visitor learn which editions exist and which
 * addresses are subscribed.
 */
export type ArchiveDenial =
  | "no-token"
  | "bad-signature"
  | "unknown-subscriber"
  | "inactive-subscriber"
  | "not-sent-to-this-subscriber";

/** The gate for one edition. */
export async function resolveArchiveAccess(
  token: string | undefined,
  editionId: string,
  lookups: ArchiveLookups
): Promise<ArchiveAccess> {
  if (!token) return { allowed: false, reason: "no-token" };

  // Purpose-scoped: an unsubscribe token signed over the bare id does not verify here.
  const subscriberId = verifyToken("archive", token);
  if (!subscriberId) return { allowed: false, reason: "bad-signature" };

  const subscriber = await lookups.findSubscriber(subscriberId);
  if (!subscriber) return { allowed: false, reason: "unknown-subscriber" };
  if (!subscriber.active) return { allowed: false, reason: "inactive-subscriber" };

  const received = await lookups.wasSentTo(subscriberId, editionId);
  if (!received) return { allowed: false, reason: "not-sent-to-this-subscriber" };

  return {
    allowed: true,
    subscriberId,
    organizationId: subscriber.organizationId,
  };
}

/**
 * The gate for the index, which is the same minus the per-edition check.
 *
 * A valid token is enough to see the list, because the list is built from this subscriber's own
 * SENT events and can only contain what reached them.
 */
export async function resolveIndexAccess(
  token: string | undefined,
  lookups: Pick<ArchiveLookups, "findSubscriber">
): Promise<ArchiveAccess> {
  if (!token) return { allowed: false, reason: "no-token" };

  const subscriberId = verifyToken("archive", token);
  if (!subscriberId) return { allowed: false, reason: "bad-signature" };

  const subscriber = await lookups.findSubscriber(subscriberId);
  if (!subscriber) return { allowed: false, reason: "unknown-subscriber" };
  if (!subscriber.active) return { allowed: false, reason: "inactive-subscriber" };

  return {
    allowed: true,
    subscriberId,
    organizationId: subscriber.organizationId,
  };
}
