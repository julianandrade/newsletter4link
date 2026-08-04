/**
 * RQ-005 tech spec 4.1.1: the role hierarchy, in a module a client component may
 * import.
 *
 * `lib/auth/context.ts` already answered this question, but it imports
 * `next/headers` and the Supabase server client, so no client component can touch
 * it. That is why a second copy appeared in `components/proposal/use-can-edit.ts`.
 * The hierarchy belongs in one place: this module has no dependencies, and both
 * the server context and the client hook now delegate to it.
 */

export const ROLE_ORDER = ["VIEWER", "EDITOR", "ADMIN", "OWNER"] as const;

export type RoleName = (typeof ROLE_ORDER)[number];

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === "string" && ROLE_ORDER.includes(value as RoleName);
}

/**
 * Whether `role` is at least `min`.
 *
 * Fails closed on anything unrecognized, which the previous implementation did
 * not: it compared `indexOf` results, so an unknown role and an unknown minimum
 * both resolved to -1 and `-1 >= -1` granted access. A typo in a required role
 * name was an open door.
 */
export function hasRoleAtLeast(
  role: RoleName | string | null | undefined,
  min: RoleName
): boolean {
  if (!isRoleName(role) || !isRoleName(min)) return false;

  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(min);
}
