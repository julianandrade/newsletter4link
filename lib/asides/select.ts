/**
 * How the closing slot chooses what to offer.
 *
 * A query builder rather than a function that runs one, so the picker on the send screen,
 * the library screen and any test share a single definition of "what is offerable" without
 * this module reaching for Prisma.
 *
 * `lastUsedAt` and `useCount` are written when an edition is sent and nowhere else. Opening
 * the picker, previewing an aside and changing your mind must not burn it, or the
 * least-recently-used ordering degrades every time somebody browses. See lib/asides/mark-used.ts.
 */

import type { AsideKind } from "@prisma/client";
import type { EmailAside } from "@/lib/email/edition-template";

export interface AsidePickerFilter {
  kind: AsideKind;
}

/**
 * Language is deliberately not a filter here.
 *
 * It used to be, and it excluded rather than narrowed: an English joke could be stored,
 * listed in the library and never once offered on the send screen, with nothing anywhere
 * saying why. An aside goes into an edition whatever language it is written in, so the
 * column is metadata to browse by, not a gate.
 *
 * Removing it also retires a footgun that lib/rewrite/config.ts had already written down:
 * the match was on the exact string, so "Portugues" chosen for the organization's prose
 * would have quietly stopped every stored "pt-PT" aside from being offered.
 *
 * A caller that genuinely wants one language can still narrow this query's `where` itself,
 * which is what `GET /api/asides?offerable=true&language=` does.
 */
export function asidePickerQuery(filter: AsidePickerFilter) {
  return {
    where: {
      status: "APPROVED" as const,
      /** A one-off written on the send screen is reusable: false, so it never comes back. */
      reusable: true,
      kind: filter.kind,
    },
    /**
     * Never-used first, then least recently used.
     *
     * `nulls: "first"` is the whole point. Postgres sorts nulls last on an ascending
     * order, so without it a joke that has never been sent would be offered after one
     * that went out a year ago.
     */
    orderBy: [
      { lastUsedAt: { sort: "asc" as const, nulls: "first" as const } },
      { createdAt: "asc" as const },
    ],
  };
}

/**
 * A stored row as the email renderer wants it.
 *
 * Prisma gives nullable columns as `null`; `EmailAside` uses optional properties, and the
 * block checks presence rather than truthiness. Passing `imageUrl: null` straight through
 * would type-error, and passing `undefined` explicitly would still serialise into a sent
 * snapshot as a key that means nothing.
 */
export function toEmailAside(aside: {
  kind: AsideKind;
  text: string;
  imageUrl: string | null;
  attribution: string | null;
}): EmailAside {
  return {
    kind: aside.kind,
    text: aside.text,
    ...(aside.imageUrl ? { imageUrl: aside.imageUrl } : {}),
    ...(aside.attribution ? { attribution: aside.attribution } : {}),
  };
}
