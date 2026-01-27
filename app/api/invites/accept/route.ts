import { NextResponse } from "next/server";
import { getAuthContext, acceptInvite, setSelectedOrgId } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * POST /api/invites/accept
 * Accept an organization invitation
 */
export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Invite token is required" },
        { status: 400 }
      );
    }

    const organization = await acceptInvite(
      token,
      auth.supabaseUserId,
      auth.email
    );

    // Switch to the new organization
    await setSelectedOrgId(organization.id);

    return NextResponse.json({
      success: true,
      data: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      message: `Successfully joined ${organization.name}`,
    });
  } catch (error) {
    console.error("Error accepting invite:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
