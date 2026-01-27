import { NextResponse } from "next/server";
import { getAuthContext, createOrganization } from "@/lib/auth/context";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/organizations
 * Get all organizations the current user is a member of
 */
export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const organizations = auth.organizations.map(({ organization, membership }) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
      industry: organization.industry,
      logoUrl: organization.logoUrl,
      subscriberLimit: organization.subscriberLimit,
      currentSubscribers: organization.currentSubscribers,
      role: membership.role,
      createdAt: organization.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: organizations,
      currentOrgId: auth.currentOrg?.organization.id ?? null,
    });
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/organizations
 * Create a new organization
 */
export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, slug, industry } = body;

    // Validation
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Name is required and must be at least 2 characters" },
        { status: 400 }
      );
    }

    if (!slug || typeof slug !== "string") {
      return NextResponse.json(
        { error: "Slug is required" },
        { status: 400 }
      );
    }

    // Validate slug format (lowercase, alphanumeric, hyphens)
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug) || slug.length < 3 || slug.length > 50) {
      return NextResponse.json(
        { error: "Slug must be 3-50 characters, lowercase letters, numbers, and hyphens only" },
        { status: 400 }
      );
    }

    // Check if slug is already taken
    const existing = await prisma.organization.findUnique({
      where: { slug },
    });

    if (existing) {
      return NextResponse.json(
        { error: "This slug is already taken" },
        { status: 409 }
      );
    }

    const organization = await createOrganization(
      auth.supabaseUserId,
      auth.email,
      name.trim(),
      slug,
      industry
    );

    return NextResponse.json(
      {
        success: true,
        data: organization,
        message: "Organization created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating organization:", error);

    if (error instanceof Error && error.message === "Organization slug already exists") {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    );
  }
}
