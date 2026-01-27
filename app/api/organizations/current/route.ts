/**
 * Current Organization API
 *
 * GET /api/organizations/current - Get the current user's selected organization
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";

export async function GET() {
  try {
    const auth = await getAuthContext();

    if (!auth) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    if (!auth.currentOrg) {
      return NextResponse.json(
        { error: "No organization selected" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      organization: {
        id: auth.currentOrg.organization.id,
        name: auth.currentOrg.organization.name,
        slug: auth.currentOrg.organization.slug,
        industry: auth.currentOrg.organization.industry,
        plan: auth.currentOrg.organization.plan,
        customDomain: auth.currentOrg.organization.customDomain,
        createdAt: auth.currentOrg.organization.createdAt,
      },
      membership: {
        role: auth.currentOrg.membership.role,
        joinedAt: auth.currentOrg.membership.createdAt,
      },
    });
  } catch (error) {
    console.error("Failed to get current organization:", error);
    return NextResponse.json(
      { error: "Failed to get organization" },
      { status: 500 }
    );
  }
}
