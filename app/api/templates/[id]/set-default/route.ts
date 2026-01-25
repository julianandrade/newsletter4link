import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/templates/[id]/set-default
 * Toggle template default status.
 * Body: { default?: boolean } - if not provided, toggles current state
 * Only one template can be default at a time.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

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

    // Determine new default state
    const newDefaultState = body.default !== undefined ? body.default : !template.isDefault;

    if (newDefaultState) {
      // Setting as default: unset others first
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
    } else {
      // Unsetting default: just turn off this one
      await prisma.emailTemplate.update({
        where: { id },
        data: { isDefault: false },
      });
    }

    return NextResponse.json({
      success: true,
      default: newDefaultState,
      message: newDefaultState
        ? `Template "${template.name}" is now the default`
        : `Template "${template.name}" is no longer the default`,
    });
  } catch (error) {
    console.error("Error toggling default template:", error);
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}
