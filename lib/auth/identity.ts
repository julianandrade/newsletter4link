/**
 * Who is making this request, independent of which service answered that question.
 *
 * Every server-side identity read in the app went through `getSupabaseUser()`, which returned
 * Supabase's `User` type. Five call sites used it and, between them, read exactly two fields:
 * `id` and `email`. That is the whole dependency, and this file is it stated as a type instead
 * of inherited from a vendor SDK.
 *
 * The point is Phase F. Swapping Supabase Auth for Identity Platform is otherwise a change to
 * five files that each know about a specific provider; with this seam it is a change to one.
 * Nothing in the application should have to care whether a subject id came from Supabase or
 * from Google, and today nothing does except this module.
 *
 * `supabaseUserId` on `OrgUser` keeps its name deliberately. Renaming a column is a migration
 * against a live database in exchange for a nicer word, and the plan for this migration
 * already says to add a column beside it rather than rename it if the two ever need to
 * coexist. What it holds is "the identity provider's subject id", which is what it always
 * held.
 */

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SESSION_COOKIE, verifySessionCookie } from "@/lib/gcip/admin";

/** The subset of an authenticated user that this application actually uses. */
export interface Identity {
  /** The provider's subject id. Stored as `OrgUser.supabaseUserId`. */
  id: string;
  /** Verified email. Null is possible in principle and refused by the domain allowlist. */
  email: string | null;
  /**
   * Display name as the provider knows it, when it knows one.
   *
   * Present because one route writes it to `OrgUser.name` on first join, reading Supabase's
   * `user_metadata.full_name`. That field is Supabase's own shape, and Identity Platform
   * carries the same thing as `displayName`, so the difference is normalised here rather than
   * left for a route to know about.
   */
  name: string | null;
}

/** Which service is answering. Exported so a diagnostic can say it without guessing. */
export type IdentityProvider = "supabase" | "identity-platform";

export function identityProvider(): IdentityProvider {
  // Identity Platform announces itself the same way the storage seam does, by the presence of
  // the configuration it cannot work without, rather than by a separate flag that could
  // disagree with it. Phase F part two adds the branch below; until then this returns
  // "supabase" everywhere and behaviour is unchanged.
  return process.env.NEXT_PUBLIC_GCIP_API_KEY ? "identity-platform" : "supabase";
}

/**
 * The current request's identity, or null when there is no valid session.
 *
 * Null rather than throwing, because every caller already has a path for "not signed in" and
 * an exception here would turn an ordinary logged-out request into a 500.
 */
export async function getCurrentIdentity(): Promise<Identity | null> {
  if (identityProvider() === "identity-platform") {
    const store = await cookies();
    const decoded = await verifySessionCookie(store.get(SESSION_COOKIE)?.value);
    if (!decoded) return null;

    // `name` is Identity Platform's normalised display name, which for a Microsoft sign-in is
    // populated from the same claim Supabase surfaced as `user_metadata.full_name`.
    const name = typeof decoded.name === "string" ? decoded.name : null;

    return {
      id: decoded.uid,
      email: decoded.email ?? null,
      name: name && name.length > 0 ? name : null,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // `full_name` is what Supabase's Azure provider populates. Identity Platform will supply
  // `displayName` in its place, and the shape callers see does not change.
  const fullName = user.user_metadata?.full_name;

  return {
    id: user.id,
    email: user.email ?? null,
    name: typeof fullName === "string" && fullName.length > 0 ? fullName : null,
  };
}
