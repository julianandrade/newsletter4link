import { NextResponse } from "next/server";
import { getAuthContext, setSelectedOrgId } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/switch
 * Switch to a different organization
 */
export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 }
      );
    }

    // Verify user has access to this org
    const membership = auth.organizations.find(
      (o) => o.organization.id === organizationId
    );

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found or access denied" },
        { status: 404 }
      );
    }

    // Set the selected org cookie
    await setSelectedOrgId(organizationId);

    return NextResponse.json({
      success: true,
      data: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.membership.role,
      },
      message: `Switched to ${membership.organization.name}`,
    });
  } catch (error) {
    console.error("Error switching organization:", error);
    return NextResponse.json(
      { error: "Failed to switch organization" },
      { status: 500 }
    );
  }
}
