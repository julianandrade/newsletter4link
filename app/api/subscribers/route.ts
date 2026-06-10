import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgContext } from "@/lib/auth/context";
import { getActiveSubscribers, createSubscriber } from "@/lib/queries";
import {
  parseJsonBody,
  errorResponse,
  emailField,
  languageField,
  styleField,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

const createSubscriberSchema = z.object({
  email: emailField,
  name: z.string().trim().max(200).optional(),
  preferredLanguage: languageField.optional(),
  preferredStyle: styleField.optional(),
});

/**
 * GET /api/subscribers
 * Get all subscribers (active by default, or all with ?all=true) - tenant-scoped
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get("all") === "true";

    const subscribers = showAll
      ? await db.subscriber.findMany({
          orderBy: { createdAt: "desc" },
        })
      : await getActiveSubscribers(db);

    return NextResponse.json({
      success: true,
      data: subscribers,
      count: subscribers.length,
    });
  } catch (error) {
    console.error("Error fetching subscribers:", error);
    return errorResponse(error);
  }
}

/**
 * POST /api/subscribers
 * Create a new subscriber - tenant-scoped
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const { db, organization } = ctx;

    const { email, name, preferredLanguage, preferredStyle } =
      await parseJsonBody(request, createSubscriberSchema);

    // Check if subscriber already exists in this org
    const existing = await db.subscriber.findFirst({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Subscriber with this email already exists",
        },
        { status: 409 }
      );
    }

    // Check subscriber limit
    const currentCount = await db.subscriber.count({ where: { active: true } });
    if (currentCount >= organization.subscriberLimit) {
      return NextResponse.json(
        {
          success: false,
          error: `Subscriber limit reached (${organization.subscriberLimit}). Upgrade your plan for more subscribers.`,
        },
        { status: 403 }
      );
    }

    const subscriber = await createSubscriber(db, {
      email,
      name,
      preferredLanguage: preferredLanguage || "en",
      preferredStyle: preferredStyle || "comprehensive",
    });

    // Update org subscriber count
    await db.organization.update({
      currentSubscribers: currentCount + 1,
    });

    return NextResponse.json(
      {
        success: true,
        data: subscriber,
        message: "Subscriber added successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating subscriber:", error);
    return errorResponse(error);
  }
}
