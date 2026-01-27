import { NextResponse } from "next/server";
import { getSupabaseUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";

const DEFAULT_ORG_ID = "default-org-001";

export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/join-default
 * Auto-join the default organization (for migration period)
 */
export async function POST() {
  try {
    const user = await getSupabaseUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user is already a member
    const existingMember = await prisma.orgUser.findFirst({
      where: {
        supabaseUserId: user.id,
        organizationId: DEFAULT_ORG_ID,
      },
    });

    if (existingMember) {
      return NextResponse.json({
        success: true,
        message: "Already a member of the default organization",
        organizationId: DEFAULT_ORG_ID,
      });
    }

    // Check if the default org exists
    const org = await prisma.organization.findUnique({
      where: { id: DEFAULT_ORG_ID },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Default organization not found" },
        { status: 404 }
      );
    }

    // Add user as OWNER (for the original admin)
    await prisma.orgUser.create({
      data: {
        supabaseUserId: user.id,
        email: user.email || "",
        name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
        role: "OWNER",
        organizationId: DEFAULT_ORG_ID,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Joined default organization successfully",
      organizationId: DEFAULT_ORG_ID,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
    });
  } catch (error) {
    console.error("Error joining default organization:", error);
    return NextResponse.json(
      { error: "Failed to join default organization" },
      { status: 500 }
    );
  }
}
