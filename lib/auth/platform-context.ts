/**
 * Authorization for the platform area, which sits above the tenant line.
 *
 * The sibling of `requireOrgContext()` in `lib/auth/context.ts`, and deliberately not part
 * of it. `OrgContext` carries a `membership` row that really exists and a `TenantClient`
 * scoped to one organization; a superadmin reading across organizations has neither. The
 * rejected alternative was to widen `getUserOrganizations()` and fabricate an `OrgUser`
 * with `role: "OWNER"` for organizations the caller is not in, which would put a row that
 * does not exist through `requireRole()` and every audit trail in the product.
 *
 * So nothing here touches `OrgContext`, and nothing outside `/dashboard/platform` and
 * `/api/platform` calls anything here. The tenant guard never learns superadmin exists.
 *
 * Three gates, all of which must pass:
 *   1. a Supabase session
 *   2. `isAllowedEmail`, so the domain allowlist still applies and this is not a way around it
 *   3. `isSuperAdmin`, which fails closed on an unset `SUPERADMIN_EMAILS`
 */

import { prisma } from "@/lib/db";
import { isAllowedEmail } from "@/lib/auth/allowed-domains";
import { isSuperAdmin } from "@/lib/auth/superadmin";
import { getSupabaseUser } from "@/lib/auth/context";

export interface PlatformContext {
  supabaseUserId: string;
  email: string;
  /**
   * The raw client, not a `TenantClient`.
   *
   * Reading across tenants is the entire purpose of this context, so the tenant wrapper
   * would have to be bypassed anyway. Naming it here makes that explicit rather than
   * leaving a caller to reach for `prisma` directly and lose the permission check.
   */
  db: typeof prisma;
}

/**
 * The non-throwing form, for a layout or a nav decision.
 *
 * Returns null rather than throwing so the caller can answer `notFound()`, which is the
 * required response: a 403 confirms the platform area exists and names it as a target.
 */
export async function getPlatformContext(): Promise<PlatformContext | null> {
  const user = await getSupabaseUser();
  if (!user) return null;

  if (!isAllowedEmail(user.email)) {
    console.warn("Blocked platform request from a disallowed domain", {
      domain: user.email?.split("@")[1] ?? "unknown",
    });
    return null;
  }

  if (!isSuperAdmin(user.email)) return null;

  return {
    supabaseUserId: user.id,
    email: user.email ?? "",
    db: prisma,
  };
}

/**
 * Error thrown by `requirePlatformContext`, so a route handler's catch can tell "not a
 * superadmin" from a genuine failure and answer 404 for the former without swallowing the
 * latter. A bare `Error` with a matched message would silently start returning 404 for any
 * future error that happened to share the wording.
 */
export class PlatformForbiddenError extends Error {
  constructor() {
    super("Not found");
    this.name = "PlatformForbiddenError";
  }
}

/**
 * The throwing form, for route handlers. Call it as the first statement.
 */
export async function requirePlatformContext(): Promise<PlatformContext> {
  const context = await getPlatformContext();

  if (!context) {
    throw new PlatformForbiddenError();
  }

  return context;
}
