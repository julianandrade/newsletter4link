/**
 * Which email domains may hold an account.
 *
 * Enforced in three places, deliberately: the login form (so the user is told
 * before a round trip), the middleware (so no page or API route is reachable),
 * and the org context (so a route that skips middleware still refuses). The
 * middleware and context checks are the ones that actually protect the app:
 * anyone with the public anon key can call Supabase's signup endpoint directly,
 * so a client-side check alone would keep nobody out.
 */

export const ALLOWED_EMAIL_DOMAINS = ["linkconsulting.com", "linkroad.com"] as const;

/** Human-readable list for error copy: "linkconsulting.com or linkroad.com". */
export function allowedDomainsLabel(): string {
  const domains = ALLOWED_EMAIL_DOMAINS.map((domain) => `@${domain}`);
  if (domains.length === 1) return domains[0];
  return `${domains.slice(0, -1).join(", ")} or ${domains[domains.length - 1]}`;
}

/**
 * Exact domain match, case-insensitive.
 *
 * Deliberately not a suffix test: `endsWith("linkroad.com")` would also accept
 * `evil-linkroad.com`. Subdomains such as `mail.linkroad.com` are also refused,
 * since no real address here uses one; add them explicitly if that changes.
 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const trimmed = email.trim().toLowerCase();

  // Exactly one @, and something either side of it.
  const parts = trimmed.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;

  return (ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(domain);
}

export const DOMAIN_REJECTED_MESSAGE = `Use your Linkroad account. Only ${allowedDomainsLabel()} addresses can sign in.`;
