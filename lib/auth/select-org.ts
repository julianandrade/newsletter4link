/**
 * Which organization a request is for, given the cookie and what the user can still reach.
 *
 * Extracted from `getAuthContext()` because archiving created a case it could not express.
 * That code did `organizations.find(o => o.organization.id === selectedOrgId)` and left
 * `currentOrg` null when the find missed, which is correct for an organization you were
 * removed from and wrong for one that was archived while you were sitting in it: the user
 * gets a bare "Unauthorized: No organization selected" on a screen that worked a second
 * ago, and no way to recover except clearing a cookie they cannot see.
 *
 * Pure, so the archived, removed, absent and empty cases are asserted without a session.
 */

/**
 * The shape this needs, and nothing more.
 *
 * Generic over the whole entry rather than over the membership, so a caller passing rows
 * that carry a full `Organization` and `OrgUser` gets those types back out. An earlier
 * version narrowed `organization` to `{ id: string }`, which compiled here and then lost
 * `plan` and `name` at the call site.
 */
export interface SelectableOrg {
  organization: { id: string };
}

export interface OrgSelection<T extends SelectableOrg> {
  /** The organization to use, or null when the user has none available. */
  selected: T | null;
  /**
   * True when the cookie disagrees with `selected` and should be rewritten.
   *
   * Only set when a cookie was present and unusable. A user with no cookie at all is not
   * given one here, so first-visit behaviour is exactly what it was before.
   */
  rewriteCookie: boolean;
}

/**
 * @param available Organizations the user may currently use. Callers pass the list already
 *   filtered to live organizations, so this function never needs to know what archived
 *   means, and cannot forget to apply the filter on one branch.
 * @param cookieOrgId The `selected_org_id` cookie value, if any.
 */
export function resolveSelectedOrg<T extends SelectableOrg>(
  available: ReadonlyArray<T>,
  cookieOrgId: string | null | undefined
): OrgSelection<T> {
  if (available.length === 0) {
    // Nothing to select. `/onboarding` is the existing destination for this user, so the
    // cookie is left alone: rewriting it to nothing helps nobody and loses their last
    // choice if an organization is restored.
    return { selected: null, rewriteCookie: false };
  }

  if (!cookieOrgId) {
    return { selected: available[0], rewriteCookie: false };
  }

  const chosen = available.find((entry) => entry.organization.id === cookieOrgId);

  if (chosen) {
    return { selected: chosen, rewriteCookie: false };
  }

  // The cookie names something the user cannot use: archived, deleted, or a membership
  // that has been removed. Fall forward to a real organization and correct the cookie, so
  // the next request does not repeat the lookup and the user is not stuck.
  return { selected: available[0], rewriteCookie: true };
}
