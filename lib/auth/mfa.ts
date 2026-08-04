/**
 * Second factor for password sign-ins.
 *
 * Password accounts must carry a TOTP factor: a password alone is one stolen
 * credential away from the whole subscriber list. Office 365 accounts are
 * exempt here because Entra ID already applies the tenant's own MFA and
 * Conditional Access before Supabase ever sees the identity, so forcing a
 * second app-level code would be theatre.
 *
 * The decision is a pure function so it can be tested without a session, and
 * so the middleware and the client agree on what "enrolled" means.
 */

import type { User } from "@supabase/supabase-js";

export type MfaRequirement =
  /** Nothing to do: OAuth identity, or already stepped up to aal2. */
  | { kind: "satisfied" }
  /** Has a verified factor but the session is still aal1: ask for a code. */
  | { kind: "challenge" }
  /** Password account with no verified factor: must set one up now. */
  | { kind: "enroll" };

/** Assurance levels as Supabase reports them. */
export interface AalState {
  currentLevel: string | null;
  nextLevel: string | null;
}

/**
 * True when the identity signed in with a password rather than an external
 * provider. Supabase records the provider in app_metadata; `providers` holds
 * every identity linked to the account, and an account that can sign in with a
 * password is only as strong as that password, even if Azure is also linked.
 */
export function isPasswordIdentity(user: User | null | undefined): boolean {
  if (!user) return false;

  const metadata = user.app_metadata ?? {};
  const providers = Array.isArray(metadata.providers)
    ? (metadata.providers as string[])
    : metadata.provider
      ? [metadata.provider as string]
      : [];

  return providers.includes("email");
}

/** Verified TOTP factors only: an unverified enrollment protects nothing. */
export function verifiedTotpFactors(user: User | null | undefined) {
  return (user?.factors ?? []).filter(
    (factor) => factor.factor_type === "totp" && factor.status === "verified"
  );
}

export function resolveMfaRequirement(
  user: User | null | undefined,
  aal: AalState | null | undefined
): MfaRequirement {
  if (!user) return { kind: "satisfied" };

  // Already at aal2: whatever got them there, they are done.
  if (aal?.currentLevel === "aal2") return { kind: "satisfied" };

  if (!isPasswordIdentity(user)) return { kind: "satisfied" };

  if (verifiedTotpFactors(user).length === 0) return { kind: "enroll" };

  return { kind: "challenge" };
}

/** Path that resolves the outstanding requirement. */
export const MFA_PATH = "/login/mfa";

/** Six digits, as every authenticator app produces. */
export function isValidTotpCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}
