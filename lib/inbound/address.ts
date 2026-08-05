/**
 * RQ-007: reading the parts of an inbound address that matter.
 *
 * Subscriptions use `radar+<tag>@julianandrade.net`, one tag per newsletter, and some use
 * a raw alias at the Resend inbound domain instead. The tag is a match key, so parsing it
 * wrong means an email silently landing in the unknown-senders pile.
 */

/**
 * The `+tag` from an address, lowercased, or null when there is none.
 *
 * Takes the first plus sign, not the last: `radar+tldr+extra@` is the tag `tldr+extra`,
 * because that is what the mail transport delivers to `radar` and everything after the
 * first plus is the tag by convention.
 */
export function subaddressTag(address: string): string | null {
  // Through bareAddress first, because a `to` header may arrive as
  // `Radar <radar+tldr@x.com>` and reading the tag off that form directly loses it, which
  // means the email lands in the unknown-senders pile for no reason.
  const bare = bareAddress(address);
  const parsed = bare ? parseAddress(bare) : null;
  if (!parsed) return null;

  const plus = parsed.local.indexOf("+");
  if (plus === -1 || plus === parsed.local.length - 1) return null;

  const tag = parsed.local.slice(plus + 1).trim().toLowerCase();

  return tag.length > 0 ? tag : null;
}

/**
 * The bare address out of anything a mail header might carry.
 *
 * Headers arrive as `Display Name <a@b.c>`, as `<a@b.c>`, or bare, and matching a source by
 * sender has to compare addresses rather than display names: a newsletter changes its
 * display name whenever its marketing team feels like it.
 */
export function bareAddress(header: string): string | null {
  const angled = header.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : header).trim();

  const parsed = parseAddress(candidate);

  return parsed ? `${parsed.local}@${parsed.domain}`.toLowerCase() : null;
}

/** The address with any `+tag` removed, which is the mailbox it really goes to. */
export function withoutTag(address: string): string | null {
  const bare = bareAddress(address);
  const parsed = bare ? parseAddress(bare) : null;
  if (!parsed) return null;

  const plus = parsed.local.indexOf("+");
  const local = plus === -1 ? parsed.local : parsed.local.slice(0, plus);

  return `${local}@${parsed.domain}`.toLowerCase();
}

function parseAddress(value: string): { local: string; domain: string } | null {
  const trimmed = value.trim().replace(/^<|>$/g, "");
  const at = trimmed.lastIndexOf("@");

  if (at <= 0 || at === trimmed.length - 1) return null;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  // A domain with no dot, or whitespace anywhere, is not an address we should match on.
  if (!domain.includes(".") || /\s/.test(trimmed)) return null;

  return { local, domain: domain.toLowerCase() };
}

/** Case-insensitive address comparison, for matching a source by its sender. */
export function sameAddress(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;

  const left = bareAddress(a);
  const right = bareAddress(b);

  return left !== null && left === right;
}
