import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, hasRole } from "@/lib/auth/context";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/organizations/[id]
 * Get a specific organization's details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user has access to this org
    const membership = auth.organizations.find(
      (o) => o.organization.id === id
    );

    if (!membership) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { organization } = membership;

    // Get member count
    const memberCount = await prisma.orgUser.count({
      where: { organizationId: id },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
        industry: organization.industry,
        logoUrl: organization.logoUrl,
        subscriberLimit: organization.subscriberLimit,
        currentSubscribers: organization.currentSubscribers,
        customDomain: organization.customDomain,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
        memberCount,
        role: membership.membership.role,
      },
    });
  } catch (error) {
    console.error("Error fetching organization:", error);
    return NextResponse.json(
      { error: "Failed to fetch organization" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/organizations/[id]
 * Update an organization
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user has access and is admin+
    const membership = auth.organizations.find(
      (o) => o.organization.id === id
    );

    if (!membership) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    if (!hasRole(membership.membership.role, "ADMIN")) {
      return NextResponse.json(
        { error: "Forbidden: Requires ADMIN role" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Validate and collect updates
    if (typeof body.name === "string" && body.name.trim().length >= 2) {
      updates.name = body.name.trim();
    }

    if (typeof body.industry === "string") {
      const validIndustries = [
        "TECHNOLOGY", "FINANCE", "INSURANCE", "HEALTHCARE",
        "RETAIL", "UTILITIES", "MANUFACTURING", "PROFESSIONAL_SERVICES", "OTHER"
      ];
      if (validIndustries.includes(body.industry)) {
        updates.industry = body.industry;
      }
    }

    if (typeof body.logoUrl === "string" || body.logoUrl === null) {
      updates.logoUrl = body.logoUrl;
    }

    // Custom domain - requires ENTERPRISE plan and ADMIN role
    if (typeof body.customDomain === "string" || body.customDomain === null) {
      if (membership.organization.plan !== "ENTERPRISE") {
        return NextResponse.json(
          { error: "Custom domains are only available on the Enterprise plan" },
          { status: 403 }
        );
      }

      if (body.customDomain !== null) {
        // Validate domain format
        const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
        if (!domainRegex.test(body.customDomain)) {
          return NextResponse.json(
            { error: "Invalid domain format" },
            { status: 400 }
          );
        }

        // Check domain is not already in use
        const existingDomain = await prisma.organization.findUnique({
          where: { customDomain: body.customDomain },
        });

        if (existingDomain && existingDomain.id !== id) {
          return NextResponse.json(
            { error: "This domain is already in use by another organization" },
            { status: 409 }
          );
        }
      }

      updates.customDomain = body.customDomain;
    }

    // Slug changes require OWNER role
    if (typeof body.slug === "string" && body.slug !== membership.organization.slug) {
      if (!hasRole(membership.membership.role, "OWNER")) {
        return NextResponse.json(
          { error: "Forbidden: Only owners can change the organization slug" },
          { status: 403 }
        );
      }

      const slugRegex = /^[a-z0-9-]+$/;
      if (!slugRegex.test(body.slug) || body.slug.length < 3 || body.slug.length > 50) {
        return NextResponse.json(
          { error: "Invalid slug format" },
          { status: 400 }
        );
      }

      // Check slug is unique
      const existing = await prisma.organization.findUnique({
        where: { slug: body.slug },
      });

      if (existing && existing.id !== id) {
        return NextResponse.json(
          { error: "This slug is already taken" },
          { status: 409 }
        );
      }

      updates.slug = body.slug;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided" },
        { status: 400 }
      );
    }

    const organization = await prisma.organization.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json({
      success: true,
      data: organization,
    });
  } catch (error) {
    console.error("Error updating organization:", error);
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/organizations/[id]
 * Delete an organization (OWNER only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user has access and is owner
    const membership = auth.organizations.find(
      (o) => o.organization.id === id
    );

    if (!membership) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    if (membership.membership.role !== "OWNER") {
      return NextResponse.json(
        { error: "Forbidden: Only owners can delete organizations" },
        { status: 403 }
      );
    }

    // Prevent deleting if it's the user's only organization
    if (auth.organizations.length === 1) {
      return NextResponse.json(
        { error: "Cannot delete your only organization" },
        { status: 400 }
      );
    }

    // Delete the organization (cascades to all related data)
    await prisma.organization.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Organization deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting organization:", error);
    return NextResponse.json(
      { error: "Failed to delete organization" },
      { status: 500 }
    );
  }
}
