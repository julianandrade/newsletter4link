import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { createTenantClient, TenantClient } from "@/lib/db/tenant";
import { cookies } from "next/headers";
import { Organization, OrgRole, OrgUser, Plan } from "@prisma/client";
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
 * Get all organizations the current user is a member of
 */
export async function getUserOrganizations(supabaseUserId: string) {
  const memberships = await prisma.orgUser.findMany({
    where: { supabaseUserId },
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

  const organizations = await getUserOrganizations(user.id);
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
