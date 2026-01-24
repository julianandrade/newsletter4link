import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/branding
 * Returns the current branding settings (singleton record)
 */
export async function GET() {
  try {
    const settings = await prisma.brandingSettings.findUnique({
      where: { id: "default" },
    });

    // Return empty object if no settings exist yet
    return NextResponse.json({
      success: true,
      data: settings || { logoUrl: null, bannerUrl: null },
    });
  } catch (error) {
    console.error("Error fetching branding settings:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch branding settings",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/branding
 * Update branding settings (upsert singleton record)
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { logoUrl, bannerUrl } = body;

    // Validate URL format if provided
    if (logoUrl && typeof logoUrl !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "logoUrl must be a string",
        },
        { status: 400 }
      );
    }

    if (bannerUrl && typeof bannerUrl !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "bannerUrl must be a string",
        },
        { status: 400 }
      );
    }

    // Upsert the singleton branding settings record
    const settings = await prisma.brandingSettings.upsert({
      where: { id: "default" },
      update: {
        logoUrl: logoUrl ?? null,
        bannerUrl: bannerUrl ?? null,
      },
      create: {
        id: "default",
        logoUrl: logoUrl ?? null,
        bannerUrl: bannerUrl ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      data: settings,
      message: "Branding settings saved successfully",
    });
  } catch (error) {
    console.error("Error saving branding settings:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to save branding settings",
      },
      { status: 500 }
    );
  }
}
