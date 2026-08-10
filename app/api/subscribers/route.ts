import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { createSubscriber } from "@/lib/queries";
import { Prisma } from "@prisma/client";
import { parseSort } from "@/lib/list-sort";

export const dynamic = "force-dynamic";

/** The columns the subscribers table draws. `variant` orders by language then style. */
export const SUBSCRIBER_SORT_FIELDS = [
  "email",
  "name",
  "variant",
  "active",
  "createdAt",
] as const;

/**
 * GET /api/subscribers
 * Get all subscribers (active by default, or all with ?all=true) - tenant-scoped
 *
 * Query params:
 * - all=true: include unsubscribed people as well as active ones
 * - search: matches the email address or the name
 * - sortBy: email, name, variant, active, createdAt
 * - sortOrder: asc or desc
 *
 * The search and the order used to live in the browser, over whatever the route happened to
 * return. That is survivable at seventeen rows and wrong at the organization ceiling, and
 * it meant the header said "17 of 17 shown" while the sort was reordering a subset.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get("all") === "true";
    const search = searchParams.get("search")?.trim();

    const where: Prisma.SubscriberWhereInput = {};
    if (!showAll) where.active = true;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const sort = parseSort(searchParams, SUBSCRIBER_SORT_FIELDS, {
      field: "createdAt",
      direction: "desc",
    });

    // Email is the second key because it is the only column guaranteed to be distinct: two
    // people with no name and the same variant would otherwise swap places between loads.
    const orderBy: Prisma.SubscriberOrderByWithRelationInput[] =
      sort.field === "variant"
        ? [
            { preferredLanguage: sort.direction },
            { preferredStyle: sort.direction },
            { email: "asc" },
          ]
        : sort.field === "email"
          ? [{ email: sort.direction }]
          : [
              // A subscriber with no name goes to the end of the column rather than to the
              // top of it, matching how every other list here treats a missing value.
              sort.field === "name"
                ? { name: { sort: sort.direction, nulls: "last" } }
                : { [sort.field]: sort.direction },
              { email: "asc" },
            ];

    /**
     * The three figures above the table, counted over the whole list rather than over the
     * rows that came back.
     *
     * They were derived in the browser from the loaded array, which was harmless only
     * because the search was in the browser too. Now that the search narrows the query, the
     * same code would have reported "3 active" while someone typed, and "Languages: 1" is a
     * statement about the audience, not about a search.
     */
    const [subscribers, activeCount, inactiveCount, languages] = await Promise.all([
      db.subscriber.findMany({ where, orderBy }),
      db.subscriber.count({ where: { active: true } }),
      db.subscriber.count({ where: { active: false } }),
      db.subscriber.findMany({
        distinct: ["preferredLanguage"],
        select: { preferredLanguage: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: subscribers,
      count: subscribers.length,
      sort,
      meta: {
        activeCount,
        inactiveCount,
        languageCount: languages.length,
      },
    });
  } catch (error) {
    console.error("Error fetching subscribers:", error);

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
 * POST /api/subscribers
 * Create a new subscriber - tenant-scoped
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const { db, organization } = ctx;

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
