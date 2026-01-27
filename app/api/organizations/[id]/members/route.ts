import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, hasRole, inviteToOrganization } from "@/lib/auth/context";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/organizations/[id]/members
 * List all members of an organization
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

    // Get all members
    const members = await prisma.orgUser.findMany({
      where: { organizationId: id },
      orderBy: [
        { role: "asc" }, // OWNER first, then ADMIN, EDITOR, VIEWER
        { createdAt: "asc" },
      ],
    });

    // Get pending invites if user is admin+
    let invites: Array<{
      id: string;
      email: string;
      role: string;
      expiresAt: Date;
      createdAt: Date;
    }> = [];

    if (hasRole(membership.membership.role, "ADMIN")) {
      invites = await prisma.orgInvite.findMany({
        where: { organizationId: id },
        orderBy: { createdAt: "desc" },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        members: members.map((m) => ({
          id: m.id,
          email: m.email,
          name: m.name,
          role: m.role,
          createdAt: m.createdAt,
        })),
        invites: invites.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt,
          createdAt: i.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/organizations/[id]/members
 * Invite a new member to the organization
 */
export async function POST(
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
        { error: "Forbidden: Requires ADMIN role to invite members" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, role = "EDITOR" } = body;

    // Validate email
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["VIEWER", "EDITOR", "ADMIN"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be VIEWER, EDITOR, or ADMIN" },
        { status: 400 }
      );
    }

    // Can't invite someone who's already a member
    const existingMember = await prisma.orgUser.findFirst({
      where: { organizationId: id, email },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "This person is already a member" },
        { status: 409 }
      );
    }

    // Create or update invite
    const invite = await inviteToOrganization(id, email, role as "VIEWER" | "EDITOR" | "ADMIN");

    return NextResponse.json({
      success: true,
      data: {
        email,
        role,
        expiresAt: invite.expiresAt,
      },
      message: `Invitation sent to ${email}`,
    });
  } catch (error) {
    console.error("Error inviting member:", error);
    return NextResponse.json(
      { error: "Failed to send invitation" },
      { status: 500 }
    );
  }
}
