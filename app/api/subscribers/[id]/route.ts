import { NextResponse } from "next/server";
import { unsubscribeUser } from "@/lib/queries";
import { prisma } from "@/lib/db";

/**
 * GET /api/subscribers/:id
 * Get single subscriber by ID
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const subscriber = await prisma.subscriber.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { timestamp: "desc" },
          take: 10,
        },
      },
    });

    if (!subscriber) {
      return NextResponse.json(
        {
          success: false,
          error: "Subscriber not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: subscriber,
    });
  } catch (error) {
    console.error("Error fetching subscriber:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/subscribers/:id
 * Update subscriber preferences
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, preferredLanguage, preferredStyle, active } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (preferredLanguage !== undefined)
      updateData.preferredLanguage = preferredLanguage;
    if (preferredStyle !== undefined)
      updateData.preferredStyle = preferredStyle;
    if (active !== undefined) updateData.active = active;

    const subscriber = await prisma.subscriber.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: subscriber,
      message: "Subscriber updated successfully",
    });
  } catch (error) {
    console.error("Error updating subscriber:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/subscribers/:id
 * Unsubscribe user (soft delete - sets active to false)
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    await unsubscribeUser(id);

    return NextResponse.json({
      success: true,
      message: "Subscriber unsubscribed successfully",
    });
  } catch (error) {
    console.error("Error unsubscribing user:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
