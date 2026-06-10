import { NextResponse } from "next/server";
import { z } from "zod";
import { unsubscribeUser } from "@/lib/queries";
import { requireOrgContext } from "@/lib/auth/context";
import {
  parseJsonBody,
  errorResponse,
  languageField,
  styleField,
} from "@/lib/validation";

const updateSubscriberSchema = z
  .object({
    name: z.string().trim().max(200),
    preferredLanguage: languageField,
    preferredStyle: styleField,
    active: z.boolean(),
  })
  .partial();

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
    return errorResponse(error);
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

    const updateData = await parseJsonBody(request, updateSubscriberSchema);

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
    return errorResponse(error);
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
    return errorResponse(error);
  }
}
