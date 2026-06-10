import { NextResponse } from "next/server";
import { unsubscribeUser } from "@/lib/queries";
import { requireOrgContext } from "@/lib/auth/context";

/**
 * GET /api/subscribers/:id
 * Get single subscriber by ID - tenant-scoped
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireOrgContext();

    // Tenant findUnique returns null for subscribers of other orgs
    const subscriber = await db.subscriber.findUnique({
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

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

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
 * Update subscriber preferences - tenant-scoped
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

    const updateData: {
      name?: string;
      preferredLanguage?: string;
      preferredStyle?: string;
      active?: boolean;
    } = {};
    if (name !== undefined) updateData.name = name;
    if (preferredLanguage !== undefined)
      updateData.preferredLanguage = preferredLanguage;
    if (preferredStyle !== undefined)
      updateData.preferredStyle = preferredStyle;
    if (active !== undefined) updateData.active = active;

    // updateMany is org-scoped, so subscribers from other orgs are not matched
    const { count } = await db.subscriber.updateMany({
      where: { id },
      data: updateData,
    });

    if (count === 0) {
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
    console.error("Error updating subscriber:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

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
 * Unsubscribe user (soft delete - sets active to false) - tenant-scoped
 * Email recipients unsubscribe via POST /api/unsubscribe with a signed token
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireOrgContext();

    // Verify the subscriber belongs to this org before deactivating
    const subscriber = await db.subscriber.findUnique({ where: { id } });

    if (!subscriber) {
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
    console.error("Error unsubscribing user:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
