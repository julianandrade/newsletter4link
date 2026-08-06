import { config } from "@/lib/config";
import { generateToken } from "./unsubscribe-token";

/**
 * Signed links to the browser copy of an edition.
 *
 * The email's only accent call to action used to point at /dashboard, which middleware.ts
 * guards with a Supabase session, then a domain allowlist, then MFA. For a subscriber who
 * reads the newsletter and does not administer the app it was a dead end.
 *
 * The archive is not public either. An internal newsletter citing paid sources should be
 * readable by whoever received the email and nobody else, which is exactly what the HMAC that
 * already signs unsubscribe links provides, with no login and no second factor.
 *
 * Server only: signing needs node crypto. The send loop calls these once per subscriber, which
 * is the only place a subscriber id is in hand.
 */

function base(): string {
  return config.app.url.replace(/\/$/, "");
}

/**
 * The permalink for one edition.
 *
 * Without a subscriber id the URL is returned unsigned, which is correct for a preview or a
 * test send. The page answers 404 for it, so nothing leaks: an unsigned link is simply not a
 * key.
 */
export function buildArchiveUrl(editionId: string, subscriberId?: string): string {
  if (!subscriberId) return `${base()}/editions/${editionId}`;
  return `${base()}/editions/${editionId}?t=${generateToken("archive", subscriberId)}`;
}

/** The index of editions this subscriber received. */
export function buildEditionIndexUrl(subscriberId?: string): string {
  if (!subscriberId) return `${base()}/editions`;
  return `${base()}/editions?t=${generateToken("archive", subscriberId)}`;
}
