/**
 * Who may administer the platform rather than an organization.
 *
 * A superadmin can see every organization, edit its record, archive it and delete an
 * archived one. That is a permission above the tenant line, and the whole product below
 * this line is organization-scoped, so it is deliberately kept out of the database.
 *
 * `SUPERADMIN_EMAILS` is an environment variable. The consequence that matters: the
 * application cannot grant the permission that guards the application. A database write
 * cannot make anyone a superadmin, a compromised session cannot escalate into one, and
 * `OrgRole` stays honest as a per-organization role. Changing who holds it needs a Vercel
 * environment change and a redeploy, which for a permission this broad is the point.
 *
 * Modelled on `lib/auth/allowed-domains.ts`, which already does this shape for the domain
 * allowlist, and composed with it rather than replacing it: a superadmin still has to hold
 * an allowed domain. Being on this list is not a way around the allowlist.
 */

/**
 * Parse the allowlist.
 *
 * Exported for the settings screen and for tests. Empty entries are dropped, so a
 * trailing comma or a value of `","` yields an empty list rather than an entry that
 * matches an empty email.
 */
export function parseSuperAdminEmails(
  raw: string | null | undefined
): readonly string[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Is this address a platform superadmin?
 *
 * **Fails closed.** An unset, empty or whitespace-only `SUPERADMIN_EMAILS` means nobody
 * is a superadmin, so a misconfigured deployment locks the door rather than opening it.
 * This is the same choice `lib/auth/cron.ts` makes for a missing `CRON_SECRET`: a
 * capability that silently disappears is visible, one that silently opens is not.
 *
 * The environment is a parameter so this stays a pure function that a test can drive
 * without mutating `process.env`, which is shared across a Vitest worker.
 */
export function isSuperAdmin(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (!email) return false;

  const allowed = parseSuperAdminEmails(env.SUPERADMIN_EMAILS);
  if (allowed.length === 0) return false;

  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Answered to anyone who is not a superadmin.
 *
 * A 404 rather than a 403, and this message rather than "forbidden", because a 403
 * confirms the platform area exists and names it as a target. `app/editions/[id]` already
 * answers the same 404 for four distinct failures for the same reason.
 */
export const PLATFORM_NOT_FOUND_MESSAGE = "Not found";
