import { sameAddress } from "@/lib/inbound/address";

/**
 * RQ-007 step 1 of processing: which source, if any, sent this email.
 *
 * Two keys, in order. The sender address is primary because it is what the newsletter
 * controls and what stays stable; the subscription tag is the fallback for a sender that
 * changes its From address, which happens when a newsletter moves platform.
 *
 * Matching on the address and never on the display name: a newsletter changes its display
 * name whenever its marketing team feels like it, and "TLDR" becoming "TLDR AI" must not
 * silently stop ingestion.
 */

export interface MatchableSource {
  id: string;
  organizationId: string;
  senderAddress: string | null;
  inboundTag: string | null;
  parseMode: "DIGEST" | "ESSAY" | null;
  active: boolean;
}

export interface MatchResult {
  /** Every source that claims this email. */
  sources: MatchableSource[];
  matchedOn: "sender" | "tag" | null;
}

/**
 * All the sources that claim this email, not just the first.
 *
 * The plan assumes one match. Two organizations can both subscribe to the same newsletter
 * through the same shared address, and then both are entitled to the articles: each curates
 * independently, scores against its own brand voice and pays for its own AI calls. Picking
 * one would silently starve the other, and there is nothing in the email that says which.
 *
 * Sender and tag are not mixed. If any source matches on the sender, that is the answer;
 * the tag is consulted only when no sender matched, so a stale tag on an unrelated source
 * cannot pull in an email that already has a rightful owner.
 */
export function matchSources(
  email: { from: string; subaddressTag: string | null },
  sources: MatchableSource[]
): MatchResult {
  const candidates = sources.filter(
    (source) => source.active && source.parseMode !== null
  );

  const bySender = candidates.filter((source) =>
    sameAddress(source.senderAddress, email.from)
  );

  if (bySender.length > 0) return { sources: bySender, matchedOn: "sender" };

  if (email.subaddressTag) {
    const byTag = candidates.filter(
      (source) =>
        source.inboundTag !== null &&
        source.inboundTag.trim().toLowerCase() === email.subaddressTag
    );

    if (byTag.length > 0) return { sources: byTag, matchedOn: "tag" };
  }

  return { sources: [], matchedOn: null };
}
