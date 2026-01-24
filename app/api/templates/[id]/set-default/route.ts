import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/templates/[id]/set-default
 * Sets a template as the default template.
 * Only one template can be default at a time.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if template exists
    const template = await prisma.emailTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Unset default on all templates and set this one as default
    await prisma.$transaction([
      prisma.emailTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      }),
      prisma.emailTemplate.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `Template "${template.name}" is now the default`,
    });
  } catch (error) {
    console.error("Error setting default template:", error);
    return NextResponse.json(
      { error: "Failed to set default template" },
      { status: 500 }
    );
  }
}
