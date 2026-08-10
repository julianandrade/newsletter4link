import { NextResponse } from "next/server";
import { Industry, Plan } from "@prisma/client";
import {
  PlatformForbiddenError,
  requirePlatformContext,
} from "@/lib/auth/platform-context";
import { canDeleteOrganization } from "@/lib/platform/delete-guard";
import { countCascade } from "@/lib/platform/inventory";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * GET /api/platform/orgs/[id]
 *
 * The record, plus the full inventory of what a delete would destroy. Expensive by design,
 * and only paid here: this is the number the confirmation dialog needs to be honest.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformContext();
    const { id } = await params;

    const organization = await prisma.organization.findUnique({ where: { id } });
    if (!organization) return notFound();

    const inventory = await countCascade(id);

    return NextResponse.json({ success: true, data: { organization, inventory } });
  } catch (error) {
    if (error instanceof PlatformForbiddenError) return notFound();

    console.error("[PLATFORM] Could not load organization:", error);
    return NextResponse.json(
      { success: false, error: "Could not load the organization" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/platform/orgs/[id]
 *
 * The record, and archive or restore.
 *
 * Archiving is `archived: true` and restoring is `archived: false`, both writing the one
 * `archivedAt` column, so restore needs no second endpoint, validator or test. Passing
 * neither leaves the column alone, which is how a plain rename avoids touching it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePlatformContext();
    const { id } = await params;

    const existing = await prisma.organization.findUnique({ where: { id } });
    if (!existing) return notFound();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "A JSON body is required" },
        { status: 400 }
      );
    }

    const data: {
      name?: string;
      slug?: string;
      plan?: Plan;
      industry?: Industry;
      subscriberLimit?: number;
      archivedAt?: Date | null;
    } = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json(
          { success: false, error: "A name cannot be empty" },
          { status: 400 }
        );
      }
      data.name = name;
    }

    if (typeof body.slug === "string") {
      const slug = body.slug.trim().toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return NextResponse.json(
          {
            success: false,
            error: "A slug may contain lowercase letters, digits and single hyphens only",
          },
          { status: 400 }
        );
      }
      data.slug = slug;
    }

    if (typeof body.plan === "string" && body.plan in Plan) data.plan = body.plan as Plan;
    if (typeof body.industry === "string" && body.industry in Industry) {
      data.industry = body.industry as Industry;
    }

    if (typeof body.subscriberLimit === "number" && Number.isFinite(body.subscriberLimit)) {
      data.subscriberLimit = Math.max(0, Math.floor(body.subscriberLimit));
    }

    /**
     * Archiving is idempotent on purpose: archiving an already-archived organization keeps
     * the original timestamp rather than moving it, so "when was this wound down" survives a
     * double click.
     */
    if (typeof body.archived === "boolean") {
      if (body.archived) {
        data.archivedAt = existing.archivedAt ?? new Date();
      } else {
        data.archivedAt = null;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: "Nothing to update" },
        { status: 400 }
      );
    }

    const organization = await prisma.organization.update({ where: { id }, data });

    if (typeof body.archived === "boolean" && body.archived !== Boolean(existing.archivedAt)) {
      console.log(
        `[PLATFORM] ${ctx.email} ${body.archived ? "archived" : "restored"} organization ${organization.slug} (${organization.id})`
      );
    }

    return NextResponse.json({ success: true, data: organization });
  } catch (error) {
    if (error instanceof PlatformForbiddenError) return notFound();

    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return NextResponse.json(
        { success: false, error: "That slug or domain is already taken" },
        { status: 409 }
      );
    }

    console.error("[PLATFORM] Could not update organization:", error);
    return NextResponse.json(
      { success: false, error: "Could not update the organization" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/platform/orgs/[id]
 *
 * Permanent, cascading into 19 relations, and unrecoverable. `canDeleteOrganization`
 * enforces the two rails in order: archived first, then the exact slug. Both are checked
 * here rather than only in the dialog, because a dialog is not a permission.
 *
 * The counts are read before the delete and returned with the response, since afterwards
 * there is nothing left to count and this schema has no audit table. That log line and this
 * response body are the only record the deletion ever happened.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePlatformContext();
    const { id } = await params;

    const organization = await prisma.organization.findUnique({ where: { id } });
    if (!organization) return notFound();

    const body = await request.json().catch(() => null);

    const verdict = canDeleteOrganization({
      archivedAt: organization.archivedAt,
      slug: organization.slug,
      confirmSlug: typeof body?.confirmSlug === "string" ? body.confirmSlug : null,
    });

    if (!verdict.ok) {
      return NextResponse.json(
        { success: false, error: verdict.message, reason: verdict.reason },
        { status: verdict.status }
      );
    }

    const destroyed = await countCascade(id);

    await prisma.organization.delete({ where: { id } });

    // Counts only, never subscriber data, per the project's A09 guidance.
    console.warn(
      `[PLATFORM] ${ctx.email} PERMANENTLY DELETED organization ${organization.slug} (${organization.id}); destroyed ${JSON.stringify(destroyed)}`
    );

    return NextResponse.json({
      success: true,
      data: { slug: organization.slug, destroyed },
    });
  } catch (error) {
    if (error instanceof PlatformForbiddenError) return notFound();

    console.error("[PLATFORM] Could not delete organization:", error);
    return NextResponse.json(
      { success: false, error: "Could not delete the organization" },
      { status: 500 }
    );
  }
}
