import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/templates/[id]/activate
 * Toggle template active status.
 * Body: { active?: boolean } - if not provided, toggles current state
 * Only one template can be active at a time.
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

    // Determine new active state
    const newActiveState = body.active !== undefined ? body.active : !template.isActive;

    if (newActiveState) {
      // Activating: deactivate all others first
      await prisma.$transaction([
        prisma.emailTemplate.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        }),
        prisma.emailTemplate.update({
          where: { id },
          data: { isActive: true },
        }),
      ]);
    } else {
      // Deactivating: just turn off this one
      await prisma.emailTemplate.update({
        where: { id },
        data: { isActive: false },
      });
    }

    return NextResponse.json({
      success: true,
      active: newActiveState,
      message: newActiveState
        ? `Template "${template.name}" is now active`
        : `Template "${template.name}" is now inactive`,
    });
  } catch (error) {
    console.error("Error toggling template active status:", error);
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}
