import { NextResponse } from "next/server";
import { Industry, Plan } from "@prisma/client";
import {
  PlatformForbiddenError,
  requirePlatformContext,
} from "@/lib/auth/platform-context";
import { createOrganization } from "@/lib/auth/context";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Every failure that is not a genuine fault answers 404.
 *
 * A 403 would confirm that `/api/platform` exists and name it as a target. The typed error
 * is matched rather than a message, so a future error that happens to share the wording
 * cannot silently start returning 404 and hiding a real fault.
 */
function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * GET /api/platform/orgs
 *
 * Every organization, live and archived, with the three counts cheap enough to compute per
 * row. Prisma resolves `_count` in the same query, so this is one round trip for the page.
 *
 * The full nineteen-relation inventory is deliberately not here: it is nineteen counts per
 * organization, and on a list it would be nineteen times N on every page load. It belongs
 * on the detail route, which is where the number is actually needed.
 */
export async function GET() {
  try {
    await requirePlatformContext();

    const organizations = await prisma.organization.findMany({
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: { articles: true, subscribers: true, editions: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: organizations.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        industry: org.industry,
        archivedAt: org.archivedAt,
        createdAt: org.createdAt,
        subscriberLimit: org.subscriberLimit,
        counts: {
          articles: org._count.articles,
          subscribers: org._count.subscribers,
          editions: org._count.editions,
        },
      })),
    });
  } catch (error) {
    if (error instanceof PlatformForbiddenError) return notFound();

    console.error("[PLATFORM] Could not list organizations:", error);
    return NextResponse.json(
      { success: false, error: "Could not load organizations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/platform/orgs
 *
 * Delegates to `createOrganization()`, which already enforces slug uniqueness and creates
 * the `OrgSettings` row. What is added here is the permission check and the caller becoming
 * OWNER, not a second way for an organization to be born: a later change to how
 * organizations are created cannot leave this path behind.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformContext();

    const body = await request.json().catch(() => null);

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";

    if (!name || !slug) {
      return NextResponse.json(
        { success: false, error: "A name and a slug are both required" },
        { status: 400 }
      );
    }

    /**
     * The slug is in URLs and is what has to be typed to delete an organization, so its
     * shape is checked here rather than left to whatever the caller sends.
     */
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json(
        {
          success: false,
          error: "A slug may contain lowercase letters, digits and single hyphens only",
        },
        { status: 400 }
      );
    }

    const industry =
      typeof body?.industry === "string" && body.industry in Industry
        ? (body.industry as Industry)
        : undefined;

    const organization = await createOrganization(
      ctx.supabaseUserId,
      ctx.email,
      name,
      slug,
      industry
    );

    // Set only when asked. createOrganization owns the default, and repeating it here is how
    // the two drift.
    if (typeof body?.plan === "string" && body.plan in Plan) {
      await prisma.organization.update({
        where: { id: organization.id },
        data: { plan: body.plan as Plan },
      });
    }

    console.log(
      `[PLATFORM] ${ctx.email} created organization ${organization.slug} (${organization.id})`
    );

    return NextResponse.json({ success: true, data: organization }, { status: 201 });
  } catch (error) {
    if (error instanceof PlatformForbiddenError) return notFound();

    // The one expected conflict, raised by createOrganization.
    if (error instanceof Error && error.message.includes("slug already exists")) {
      return NextResponse.json(
        { success: false, error: "That slug is already taken" },
        { status: 409 }
      );
    }

    console.error("[PLATFORM] Could not create organization:", error);
    return NextResponse.json(
      { success: false, error: "Could not create the organization" },
      { status: 500 }
    );
  }
}
