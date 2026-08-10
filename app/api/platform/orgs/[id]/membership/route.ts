import { NextResponse } from "next/server";
import {
  PlatformForbiddenError,
  requirePlatformContext,
} from "@/lib/auth/platform-context";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * POST /api/platform/orgs/[id]/membership
 *
 * Write a real `OrgUser` OWNER row for the caller, so they can use the normal dashboard on
 * this organization.
 *
 * This is what the platform area offers instead of cross-organization content editing. A
 * second copy of the dashboard reading through the raw client would need its own permission
 * check on every screen, and every action taken there would be attributed to nobody. One
 * real row means every existing screen works, `requireOrgContext` is untouched, and the audit
 * trail says exactly who did the thing: a superadmin who granted themselves access, which is
 * the honest description of what happened.
 *
 * Refused on an archived organization. Granting access to something that cannot appear in the
 * switcher would produce a membership that silently does nothing.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePlatformContext();
    const { id } = await params;

    const organization = await prisma.organization.findUnique({ where: { id } });
    if (!organization) return notFound();

    if (organization.archivedAt) {
      return NextResponse.json(
        {
          success: false,
          error: "Restore this organization before granting yourself access to it.",
        },
        { status: 409 }
      );
    }

    /**
     * Upsert rather than create, and it does not touch an existing row's role.
     *
     * Pressing this twice must not be an error, and it must not quietly promote a real
     * EDITOR membership the caller already holds to OWNER: that would be this endpoint
     * rewriting a genuine role as a side effect of a button meant to grant access.
     */
    const membership = await prisma.orgUser.upsert({
      where: {
        supabaseUserId_organizationId: {
          supabaseUserId: ctx.supabaseUserId,
          organizationId: id,
        },
      },
      create: {
        supabaseUserId: ctx.supabaseUserId,
        email: ctx.email,
        role: "OWNER",
        organizationId: id,
      },
      update: {},
    });

    console.log(
      `[PLATFORM] ${ctx.email} granted themselves ${membership.role} on ${organization.slug} (${organization.id})`
    );

    return NextResponse.json({
      success: true,
      data: { role: membership.role, organizationId: id },
    });
  } catch (error) {
    if (error instanceof PlatformForbiddenError) return notFound();

    console.error("[PLATFORM] Could not grant membership:", error);
    return NextResponse.json(
      { success: false, error: "Could not grant membership" },
      { status: 500 }
    );
  }
}
