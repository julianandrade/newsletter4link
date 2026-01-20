import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/subscribers/import
 * Import subscribers from CSV data
 *
 * Body format:
 * {
 *   "subscribers": [
 *     { "email": "user@example.com", "name": "John Doe" },
 *     ...
 *   ]
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { subscribers } = body;

    if (!Array.isArray(subscribers)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid data format. Expected array of subscribers.",
        },
        { status: 400 }
      );
    }

    const results = {
      success: 0,
      failed: 0,
      duplicates: 0,
      errors: [] as string[],
    };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const sub of subscribers) {
      const { email, name, preferredLanguage, preferredStyle } = sub;

      // Validate email
      if (!email || typeof email !== "string") {
        results.failed++;
        results.errors.push(`Invalid email: ${email || "missing"}`);
        continue;
      }

      if (!emailRegex.test(email)) {
        results.failed++;
        results.errors.push(`Invalid email format: ${email}`);
        continue;
      }

      try {
        // Check if subscriber exists
        const existing = await prisma.subscriber.findUnique({
          where: { email: email.toLowerCase().trim() },
        });

        if (existing) {
          results.duplicates++;
          continue;
        }

        // Create subscriber
        await prisma.subscriber.create({
          data: {
            email: email.toLowerCase().trim(),
            name: name || null,
            preferredLanguage: preferredLanguage || "en",
            preferredStyle: preferredStyle || "comprehensive",
            active: true,
          },
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Error importing ${email}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `Import completed: ${results.success} added, ${results.duplicates} duplicates, ${results.failed} failed`,
      data: results,
    });
  } catch (error) {
    console.error("Error importing subscribers:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
