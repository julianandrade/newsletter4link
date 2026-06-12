import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createTenantClient, TenantClient } from "@/lib/db/tenant";
import { cookies } from "next/headers";
import { Organization, OrgRole, OrgUser } from "@prisma/client";
import { getPlanFeatures, hasFeature, PlanFeatures } from "@/lib/plans/features";

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
 * The authenticated identity for the current request, resolved from the Auth.js
 * session. `userId` is the stable Entra `oid` (or the e2e credentials id).
 */
export interface AuthUser {
  userId: string;
  email: string;
}

/**
 * Full auth context including the resolved identity + org memberships.
 */
export interface AuthContext {
  userId: string;
  email: string;
  organizations: Array<{
    organization: Organization;
    membership: OrgUser;
  }>;
  currentOrg: OrgContext | null;
}

/**
 * Resolve the current user from the Auth.js session (replaces the old
 * Supabase getUser()). Returns null when unauthenticated.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return {
    userId,
    email: (session.user.email ?? "").toLowerCase(),
  };
}

/**
 * Get all organizations the current user is a member of.
 *
 * Membership is keyed on the Entra `oid` (entraOid). During the migration we
 * also fall back to matching by email (case-insensitive) and backfill entraOid
 * when found, so accounts that pre-date Entra sign-in resolve transparently.
 */
export async function getUserOrganizations(user: AuthUser) {
  let memberships = await prisma.orgUser.findMany({
    where: { entraOid: user.userId },
    include: { organization: true },
  });

  // Transition fallback: resolve by email and backfill entraOid for matches
  // that don't yet carry it (skip the synthetic e2e id).
  if (memberships.length === 0 && user.email) {
    const byEmail = await prisma.orgUser.findMany({
      where: { email: { equals: user.email, mode: "insensitive" } },
      include: { organization: true },
    });

    const isEntraOid = !user.userId.startsWith("e2e:");
    const toBackfill = byEmail.filter((m) => m.entraOid == null);
    if (isEntraOid && toBackfill.length > 0) {
      await prisma.orgUser.updateMany({
        where: { id: { in: toBackfill.map((m) => m.id) } },
        data: { entraOid: user.userId },
      });
      // Reflect the backfill in the objects we return this request.
      for (const m of byEmail) {
        if (m.entraOid == null) m.entraOid = user.userId;
      }
    }
    memberships = byEmail;
  }

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
  const user = await getAuthUser();
  if (!user) return null;

  const organizations = await getUserOrganizations(user);
  const selectedOrgId = await getSelectedOrgId();

  // Find current org - either selected or first available
  let currentOrg: OrgContext | null = null;

  if (organizations.length > 0) {
    const selected = selectedOrgId
      ? organizations.find((o) => o.organization.id === selectedOrgId)
      : organizations[0];

    if (selected) {
      currentOrg = {
        organization: selected.organization,
        membership: selected.membership,
        features: getPlanFeatures(selected.organization.plan),
        db: createTenantClient(selected.organization.id),
      };
    }
  }

  return {
    userId: user.userId,
    email: user.email,
    organizations,
    currentOrg,
  };
}

/**
 * Get organization context for API routes - requires org to exist
 * Throws error if user not authenticated or no org access
 */
export async function requireOrgContext(): Promise<OrgContext> {
  const ctx = await getAuthContext();

  if (!ctx) {
    throw new Error("Unauthorized: Not authenticated");
  }

  if (!ctx.currentOrg) {
    throw new Error("Unauthorized: No organization selected");
  }

  return ctx.currentOrg;
}

/**
 * Get organization context by slug (for org-scoped routes)
 */
export async function getOrgContextBySlug(slug: string): Promise<OrgContext | null> {
  const user = await getAuthUser();
  if (!user) return null;

  // Reuse the membership resolver (entraOid first, email fallback) then narrow
  // to the requested slug.
  const organizations = await getUserOrganizations(user);
  const match = organizations.find((o) => o.organization.slug === slug);
  if (!match) return null;

  return {
    organization: match.organization,
    membership: match.membership,
    features: getPlanFeatures(match.organization.plan),
    db: createTenantClient(match.organization.id),
  };
}

/**
 * Check if user has a specific role or higher
 */
export function hasRole(userRole: OrgRole, requiredRole: OrgRole): boolean {
  const roleHierarchy: OrgRole[] = ["VIEWER", "EDITOR", "ADMIN", "OWNER"];
  const userRoleIndex = roleHierarchy.indexOf(userRole);
  const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);
  return userRoleIndex >= requiredRoleIndex;
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
 * Create a new organization and add the user as owner.
 *
 * `entraOid` is the stable Entra identity (or e2e id) of the creator.
 */
export async function createOrganization(
  entraOid: string,
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
          entraOid,
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
  entraOid: string,
  email: string,
  token: string
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
      entraOid,
      email,
      role: invite.role,
      organizationId: invite.organizationId,
    },
  });

  // Delete invite
  await prisma.orgInvite.delete({ where: { token } });

  return invite.organization;
}
