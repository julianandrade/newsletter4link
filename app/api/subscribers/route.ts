import { NextResponse } from "next/server";
import { getActiveSubscribers, createSubscriber } from "@/lib/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/subscribers
 * Get all subscribers (active by default, or all with ?all=true)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get("all") === "true";

    const subscribers = showAll
      ? await prisma.subscriber.findMany({
          orderBy: { createdAt: "desc" },
        })
      : await getActiveSubscribers();

    return NextResponse.json({
      success: true,
      data: subscribers,
      count: subscribers.length,
    });
  } catch (error) {
    console.error("Error fetching subscribers:", error);

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
 * POST /api/subscribers
 * Create a new subscriber
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, name, preferredLanguage, preferredStyle } = body;

    // Validation
    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: "Email is required",
        },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid email format",
        },
        { status: 400 }
      );
    }

    // Check if subscriber already exists
    const existing = await prisma.subscriber.findUnique({
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

    const subscriber = await createSubscriber({
      email,
      name,
      preferredLanguage: preferredLanguage || "en",
      preferredStyle: preferredStyle || "comprehensive",
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

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
