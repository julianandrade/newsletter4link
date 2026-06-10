import { NextResponse } from "next/server";
import { unsubscribeUser } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { logger } from "@/lib/logger";

/**
 * POST /api/unsubscribe
 * Public endpoint used by unsubscribe links in newsletter emails.
 * Requires a valid HMAC-signed token; raw subscriber IDs are not accepted.
 *
 * Body: { token: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const token = body?.token;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid unsubscribe link" },
        { status: 400 }
      );
    }

    const subscriberId = verifyUnsubscribeToken(token);

    if (!subscriberId) {
      return NextResponse.json(
        { success: false, error: "Invalid unsubscribe link" },
        { status: 400 }
      );
    }

    const subscriber = await prisma.subscriber.findUnique({
      where: { id: subscriberId },
      select: { id: true, active: true },
    });

    if (!subscriber) {
      return NextResponse.json(
        { success: false, error: "Subscriber not found" },
        { status: 404 }
      );
    }

    if (subscriber.active) {
      await unsubscribeUser(subscriberId);
    }

    return NextResponse.json({
      success: true,
      message: "You have been unsubscribed successfully",
    });
  } catch (error) {
    logger.error("Error processing unsubscribe", error);

    return NextResponse.json(
      { success: false, error: "Unable to process unsubscribe request" },
      { status: 500 }
    );
  }
}
