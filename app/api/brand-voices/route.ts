/**
 * Brand Voice API
 *
 * GET /api/brand-voices - List all brand voices
 * POST /api/brand-voices - Create a new brand voice
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth/context";

export async function GET() {
  try {
    const auth = await getAuthContext();
    const organizationId = auth?.currentOrg?.organization.id;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 401 }
      );
    }

    const brandVoices = await prisma.brandVoice.findMany({
      where: {
        organizationId,
      },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json({ brandVoices });
  } catch (error) {
    console.error("Failed to fetch brand voices:", error);
    return NextResponse.json(
      { error: "Failed to fetch brand voices" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    const organizationId = auth?.currentOrg?.organization.id;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 401 }
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

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    // If this is being set as default, unset existing defaults
    if (isDefault) {
      await prisma.brandVoice.updateMany({
        where: {
          organizationId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const brandVoice = await prisma.brandVoice.create({
      data: {
        name,
        personality: personality || null,
        toneAttributes: toneAttributes || [],
        styleGuidelines: styleGuidelines || null,
        dos: dos || [],
        donts: donts || [],
        useEmoji: useEmoji ?? false,
        greetings: greetings || [],
        closings: closings || [],
        examplePhrases: examplePhrases || null,
        isDefault: isDefault ?? false,
        organizationId,
      },
    });

    return NextResponse.json({ brandVoice }, { status: 201 });
  } catch (error) {
    console.error("Failed to create brand voice:", error);
    return NextResponse.json(
      { error: "Failed to create brand voice" },
      { status: 500 }
    );
  }
}
