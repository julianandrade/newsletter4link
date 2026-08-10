import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { createTenantClient, TenantClient } from "@/lib/db/tenant";
import { cookies } from "next/headers";
import { Organization, OrgRole, OrgUser, Plan } from "@prisma/client";
import { getPlanFeatures, hasFeature, PlanFeatures } from "@/lib/plans/features";
import { isAllowedEmail } from "@/lib/auth/allowed-domains";
import { hasRoleAtLeast } from "@/lib/auth/roles";
import { resolveSelectedOrg } from "@/lib/auth/select-org";

const ORG_COOKIE_NAME = "selected_org_id";

/**
 * Organization context for the current request
 */
export interface OrgContext {
  organization: Organization;
  membership: OrgUser;
  features: PlanFeatures;
  db: TenantClient;
}

/**
 * Full auth context including Supabase user
 */
export interface AuthContext {
  supabaseUserId: string;
  email: string;
  organizations: Array<{
    organization: Organization;
    membership: OrgUser;
  }>;
  currentOrg: OrgContext | null;
}

/**
 * Get the Supabase user from the current session
 */
export async function getSupabaseUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Get all organizations the current user is a member of.
 *
 * Archived organizations are excluded, and that single filter is what makes archiving mean
 * something rather than being a label. Because `currentOrg` is chosen from this list, an
 * archived organization can never become the current one, so every organization-scoped
 * route refuses it through the `requireOrgContext()` it already calls. There is therefore
 * no per-route guard against acting on an archived organization, and none to forget on a
 * route added later.
 *
 * A superadmin is not an exception here. Seeing every organization is what
 * `/dashboard/platform` is for, and it reads through `requirePlatformContext()` and the raw
 * client. Widening this function for a superadmin would mean inventing a membership row for
 * organizations they are not in, and that fabricated row would then flow through
 * `requireRole()` and every audit trail.
 */
export async function getUserOrganizations(supabaseUserId: string) {
  const memberships = await prisma.orgUser.findMany({
    where: {
      supabaseUserId,
      organization: { archivedAt: null },
    },
    include: { organization: true },
  });

  return memberships.map((m) => ({
    organization: m.organization,
    membership: m,
  }));
}

/**
 * Get the currently selected organization ID from cookie
 */
export async function getSelectedOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ORG_COOKIE_NAME)?.value ?? null;
}

/**
 * Set the selected organization ID in cookie
 */
export async function setSelectedOrgId(orgId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE_NAME, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

/**
 * Get the full auth context for the current request
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getSupabaseUser();
  if (!user) return null;

  // Last line of the domain allowlist. The middleware already refuses these,
  // but a route reached outside the matcher, or a future change to it, must not
  // become the one way in. Treated as unauthenticated rather than throwing, so
  // callers handle it through the path they already have for no session.
  if (!isAllowedEmail(user.email)) {
    console.warn("Blocked request from a disallowed domain", {
      domain: user.email?.split("@")[1] ?? "unknown",
    });
    return null;
  }

  const organizations = await getUserOrganizations(user.id);
  const selectedOrgId = await getSelectedOrgId();

  /**
   * Which organization this request is for.
   *
   * The selection moved into `lib/auth/select-org.ts` because archiving created a case the
   * old expression could not express. It did `selectedOrgId ? organizations.find(...) :
   * organizations[0]` and left `currentOrg` null when the find missed, which is right for a
   * membership that was removed and wrong for an organization archived while the user was
   * sitting in it: they got a bare "Unauthorized: No organization selected" on a screen that
   * worked a second earlier, recoverable only by clearing a cookie they cannot see.
   */
  const { selected, rewriteCookie } = resolveSelectedOrg(organizations, selectedOrgId);

  let currentOrg: OrgContext | null = null;

  if (selected) {
    if (rewriteCookie) {
      /**
       * Correcting the cookie is best effort, deliberately.
       *
       * `getAuthContext` is called from server components as well as route handlers, and
       * Next refuses a cookie write during render. Swallowing that keeps a read-only page
       * working: the fallback above has already chosen a usable organization, so the only
       * cost of not persisting it is repeating this resolution on the next request.
       */
      await setSelectedOrgId(selected.organization.id).catch(() => {});
    }

    currentOrg = {
      organization: selected.organization,
      membership: selected.membership,
      features: getPlanFeatures(selected.organization.plan),
      db: createTenantClient(selected.organization.id),
    };
  }

  return {
    supabaseUserId: user.id,
    email: user.email ?? "",
    organizations,
    currentOrg,
  };
}

/**
 * Get organization context for API routes - requires org to exist
 * Throws error if user not authenticated or no org access
 */
export async function requireOrgContext(): Promise<OrgContext> {
  const auth = await getAuthContext();

  if (!auth) {
    throw new Error("Unauthorized: Not authenticated");
  }

  if (!auth.currentOrg) {
    throw new Error("Unauthorized: No organization selected");
  }

  return auth.currentOrg;
}

/**
 * Get organization context by slug (for org-scoped routes)
 */
export async function getOrgContextBySlug(slug: string): Promise<OrgContext | null> {
  const user = await getSupabaseUser();
  if (!user) return null;

  const membership = await prisma.orgUser.findFirst({
    where: {
      supabaseUserId: user.id,
      organization: { slug },
    },
    include: { organization: true },
  });

  if (!membership) return null;

  return {
    organization: membership.organization,
    membership,
    features: getPlanFeatures(membership.organization.plan),
    db: createTenantClient(membership.organization.id),
  };
}

/**
 * Check if user has a specific role or higher
 *
 * RQ-005 tech spec 4.1.1: delegates to `lib/auth/roles.ts` so the hierarchy has
 * one definition that a client component can also import. The previous body
 * compared `indexOf` results directly, so an unrecognized role name on either
 * side resolved to -1 and `-1 >= -1` returned true.
 */
export function hasRole(userRole: OrgRole, requiredRole: OrgRole): boolean {
  return hasRoleAtLeast(userRole, requiredRole);
}

/**
 * Check if organization has access to a feature
 */
export function orgHasFeature(
  org: Organization,
  feature: keyof Omit<PlanFeatures, "subscriberLimit">
): boolean {
  return hasFeature(org.plan, feature);
}

/**
 * Verify the user has required role and throw if not
 */
export function requireRole(ctx: OrgContext, requiredRole: OrgRole): void {
  if (!hasRole(ctx.membership.role, requiredRole)) {
    throw new Error(
      `Forbidden: Requires ${requiredRole} role, but user has ${ctx.membership.role}`
    );
  }
}

/**
 * Verify the organization has required feature and throw if not
 */
export function requireFeature(
  ctx: OrgContext,
  feature: keyof Omit<PlanFeatures, "subscriberLimit">
): void {
  if (!ctx.features[feature]) {
    throw new Error(
      `Feature not available: ${feature} requires plan upgrade`
    );
  }
}

/**
 * Create a new organization and add the user as owner
 */
export async function createOrganization(
  supabaseUserId: string,
  email: string,
  name: string,
  slug: string,
  industry?: string
): Promise<Organization> {
  // Check slug is unique
  const existing = await prisma.organization.findUnique({
    where: { slug },
  });
  if (existing) {
    throw new Error("Organization slug already exists");
  }

  // Create org with owner membership
  const organization = await prisma.organization.create({
    data: {
      name,
      slug,
      industry: industry as Organization["industry"] ?? "TECHNOLOGY",
      members: {
        create: {
          supabaseUserId,
          email,
          role: "OWNER",
        },
      },
      settings: {
        create: {},
      },
    },
  });

  return organization;
}

/**
 * Invite a user to an organization
 */
export async function inviteToOrganization(
  organizationId: string,
  email: string,
  role: OrgRole = "EDITOR"
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  const invite = await prisma.orgInvite.upsert({
    where: {
      email_organizationId: { email, organizationId },
    },
    create: {
      email,
      role,
      organizationId,
      expiresAt,
    },
    update: {
      role,
      expiresAt,
      token: undefined, // Generate new token
    },
  });

  return {
    token: invite.token,
    expiresAt: invite.expiresAt,
  };
}

/**
 * Accept an organization invite
 */
export async function acceptInvite(
  token: string,
  supabaseUserId: string,
  email: string
): Promise<Organization> {
  const invite = await prisma.orgInvite.findUnique({
    where: { token },
    include: { organization: true },
  });

  if (!invite) {
    throw new Error("Invalid invite token");
  }

  if (invite.expiresAt < new Date()) {
    throw new Error("Invite has expired");
  }

  // Create membership
  await prisma.orgUser.create({
    data: {
      supabaseUserId,
      email,
      role: invite.role,
      organizationId: invite.organizationId,
    },
  });

  // Delete invite
  await prisma.orgInvite.delete({ where: { token } });

  return invite.organization;
}
