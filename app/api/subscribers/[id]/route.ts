import { NextResponse } from "next/server";
import { unsubscribeUser } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/context";
import { logger } from "@/lib/logger";

function authErrorResponse(error: unknown) {
  if (error instanceof Error && error.message.startsWith("Unauthorized")) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 401 }
    );
  }
  return null;
}

/**
 * GET /api/subscribers/:id
 * Get single subscriber by ID (tenant-scoped)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireOrgContext();

    // findUnique on the tenant client returns null if the row isn't in this org.
    const owned = await db.subscriber.findUnique({ where: { id } });
    if (!owned) {
      return NextResponse.json(
        {
          success: false,
          error: "Subscriber not found",
        },
        { status: 404 }
      );
    }

    const subscriber = await prisma.subscriber.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { timestamp: "desc" },
          take: 10,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: subscriber,
    });
  } catch (error) {
    logger.error("Error fetching subscriber", error);

    return (
      authErrorResponse(error) ??
      NextResponse.json(
        {
          success: false,
          error: "Internal server error",
        },
        { status: 500 }
      )
    );
  }
}

/**
 * PATCH /api/subscribers/:id
 * Update subscriber preferences (tenant-scoped)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireOrgContext();
    const body = await request.json();
    const { name, preferredLanguage, preferredStyle, active } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (preferredLanguage !== undefined)
      updateData.preferredLanguage = preferredLanguage;
    if (preferredStyle !== undefined)
      updateData.preferredStyle = preferredStyle;
    if (active !== undefined) updateData.active = active;

    // updateMany scopes to the caller's org; count === 0 means not found here.
    const updated = await db.subscriber.updateMany({
      where: { id },
      data: updateData,
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: "Subscriber not found" },
        { status: 404 }
      );
    }

    const subscriber = await db.subscriber.findUnique({ where: { id } });

    return NextResponse.json({
      success: true,
      data: subscriber,
      message: "Subscriber updated successfully",
    });
  } catch (error) {
    logger.error("Error updating subscriber", error);

    return (
      authErrorResponse(error) ??
      NextResponse.json(
        {
          success: false,
          error: "Internal server error",
        },
        { status: 500 }
      )
    );
  }
}

/**
 * DELETE /api/subscribers/:id
 * Unsubscribe user (soft delete - sets active to false) (tenant-scoped)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireOrgContext();

    const owned = await db.subscriber.findUnique({ where: { id } });
    if (!owned) {
      return NextResponse.json(
        { success: false, error: "Subscriber not found" },
        { status: 404 }
      );
    }

    await unsubscribeUser(id);

    return NextResponse.json({
      success: true,
      message: "Subscriber unsubscribed successfully",
    });
  } catch (error) {
    logger.error("Error unsubscribing user", error);

    return (
      authErrorResponse(error) ??
      NextResponse.json(
        {
          success: false,
          error: "Internal server error",
        },
        { status: 500 }
      )
    );
  }
}
