/**
 * Brand Voice API - Individual Operations
 *
 * GET /api/brand-voices/[id] - Get a brand voice
 * PATCH /api/brand-voices/[id] - Update a brand voice
 * DELETE /api/brand-voices/[id] - Delete a brand voice
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth/context";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await getAuthContext();
    const organizationId = auth?.currentOrg?.organization.id;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 401 }
      );
    }

    const brandVoice = await prisma.brandVoice.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!brandVoice) {
      return NextResponse.json(
        { error: "Brand voice not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ brandVoice });
  } catch (error) {
    console.error("Failed to fetch brand voice:", error);
    return NextResponse.json(
      { error: "Failed to fetch brand voice" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await getAuthContext();
    const organizationId = auth?.currentOrg?.organization.id;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 401 }
      );
    }

    // Verify ownership
    const existing = await prisma.brandVoice.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Brand voice not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      name,
      personality,
      toneAttributes,
      styleGuidelines,
      dos,
      donts,
      useEmoji,
      greetings,
      closings,
      examplePhrases,
      isDefault,
    } = body;

    // If setting as default, unset other defaults
    if (isDefault && !existing.isDefault) {
      await prisma.brandVoice.updateMany({
        where: {
          organizationId,
          isDefault: true,
          id: { not: id },
        },
        data: {
          isDefault: false,
        },
      });
    }

    const brandVoice = await prisma.brandVoice.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(personality !== undefined && { personality }),
        ...(toneAttributes !== undefined && { toneAttributes }),
        ...(styleGuidelines !== undefined && { styleGuidelines }),
        ...(dos !== undefined && { dos }),
        ...(donts !== undefined && { donts }),
        ...(useEmoji !== undefined && { useEmoji }),
        ...(greetings !== undefined && { greetings }),
        ...(closings !== undefined && { closings }),
        ...(examplePhrases !== undefined && { examplePhrases }),
        ...(isDefault !== undefined && { isDefault }),
      },
    });

    return NextResponse.json({ brandVoice });
  } catch (error) {
    console.error("Failed to update brand voice:", error);
    return NextResponse.json(
      { error: "Failed to update brand voice" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await getAuthContext();
    const organizationId = auth?.currentOrg?.organization.id;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 401 }
      );
    }

    // Verify ownership
    const existing = await prisma.brandVoice.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Brand voice not found" },
        { status: 404 }
      );
    }

    await prisma.brandVoice.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete brand voice:", error);
    return NextResponse.json(
      { error: "Failed to delete brand voice" },
      { status: 500 }
    );
  }
}
