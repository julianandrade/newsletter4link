import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgContext } from "@/lib/auth/context";
import {
  parseJsonBody,
  errorResponse,
  emailField,
  languageField,
  styleField,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

// Each row is validated individually below so one bad row doesn't reject the
// whole import; here we only require the top-level shape and a sane size cap.
const importSchema = z.object({
  subscribers: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, "Provide at least one subscriber")
    .max(10000, "Too many subscribers in a single import (max 10000)"),
});

const importRowSchema = z.object({
  email: emailField,
  name: z.string().trim().max(200).optional(),
  preferredLanguage: languageField.optional(),
  preferredStyle: styleField.optional(),
});

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
    const { db } = await requireOrgContext();
    const { subscribers } = await parseJsonBody(request, importSchema);

    const results = {
      success: 0,
      failed: 0,
      duplicates: 0,
      errors: [] as string[],
    };

    for (const row of subscribers) {
      const parsed = importRowSchema.safeParse(row);

      if (!parsed.success) {
        results.failed++;
        const rawEmail =
          typeof row.email === "string" ? row.email : "missing";
        results.errors.push(`Invalid row (${rawEmail}): ${parsed.error.issues[0]?.message ?? "validation error"}`);
        continue;
      }

      const { email, name, preferredLanguage, preferredStyle } = parsed.data;

      try {
        // Check if subscriber exists in this org (email already normalized)
        const existing = await db.subscriber.findFirst({
          where: { email },
        });

        if (existing) {
          results.duplicates++;
          continue;
        }

        // Create subscriber
        await db.subscriber.create({
          data: {
            email,
            name: name || null,
            preferredLanguage: preferredLanguage || "en",
            preferredStyle: preferredStyle || "comprehensive",
            active: true,
          } as any,
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
    return errorResponse(error);
  }
}
