/**
 * API Keys Management
 *
 * GET /api/api-keys - List all API keys for the current organization
 * POST /api/api-keys - Create a new API key
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { hasFeature } from "@/lib/plans/features";
import { randomBytes, createHash } from "crypto";

export const dynamic = "force-dynamic";

/**
 * Generate a new API key with a prefix
 */
function generateApiKey(): { key: string; hash: string; prefix: string } {
  const prefix = "nl4l_";
  const randomPart = randomBytes(24).toString("base64url");
  const key = `${prefix}${randomPart}`;
  const hash = createHash("sha256").update(key).digest("hex");
  const keyPrefix = key.substring(0, 12); // "nl4l_xxxx" for display

  return { key, hash, prefix: keyPrefix };
}

/**
 * GET /api/api-keys - List API keys
 */
export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const { db, organization } = ctx;

    // Check feature access
    if (!hasFeature(organization.plan, "apiAccess")) {
      return NextResponse.json(
        {
          success: false,
          error: "API access requires Professional or Enterprise plan",
        },
        { status: 403 }
      );
    }

    const apiKeys = await db.apiKey.findMany({
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: apiKeys,
    });
  } catch (error) {
    console.error("Error listing API keys:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to list API keys" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/api-keys - Create a new API key
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const { db, organization, membership } = ctx;

    // Check feature access
    if (!hasFeature(organization.plan, "apiAccess")) {
      return NextResponse.json(
        {
          success: false,
          error: "API access requires Professional or Enterprise plan",
        },
        { status: 403 }
      );
    }

    // Only ADMIN+ can create API keys
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: "Only admins can create API keys" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, expiresInDays } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: "Name is required (min 2 characters)" },
        { status: 400 }
      );
    }

    // Generate the key
    const { key, hash, prefix } = generateApiKey();

    // Calculate expiration if provided
    let expiresAt: Date | null = null;
    if (expiresInDays && typeof expiresInDays === "number" && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Create the key record
    const apiKey = await db.apiKey.create({
      data: {
        name: name.trim(),
        keyHash: hash,
        keyPrefix: prefix,
        expiresAt,
        organizationId: organization.id,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Return the full key ONLY on creation (never stored, never shown again)
    return NextResponse.json({
      success: true,
      data: {
        ...apiKey,
        key, // Full key - show only once!
      },
      message: "Save this API key now. It won't be shown again.",
    });
  } catch (error) {
    console.error("Error creating API key:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to create API key" },
      { status: 500 }
    );
  }
}
