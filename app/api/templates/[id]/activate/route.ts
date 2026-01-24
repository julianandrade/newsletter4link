import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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

    // Deactivate all other templates and activate this one
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

    return NextResponse.json({
      success: true,
      message: `Template "${template.name}" is now active`,
    });
  } catch (error) {
    console.error("Error activating template:", error);
    return NextResponse.json(
      { error: "Failed to activate template" },
      { status: 500 }
    );
  }
}
