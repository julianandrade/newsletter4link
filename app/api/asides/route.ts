import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { parseAsideCreate } from "@/lib/asides/input";
import { asidePickerQuery } from "@/lib/asides/select";
import type { AsideKind } from "@prisma/client";

export const dynamic = "force-dynamic";

const KINDS = ["JOKE", "NOTE", "SPOTLIGHT"];
const STATUSES = ["PENDING", "APPROVED", "RETIRED"];

/**
 * GET /api/asides
 *
 * The closing slot's library. VIEWER or above, this organization only.
 *
 * `?offerable=true` asks the question the send screen asks: what may go out right now, in
 * this kind and this language, ordered never-used first. Everything else is the library
 * screen's own filtering, where a retired or pending row is exactly what you want to see.
 */
export async function GET(request: Request) {
  try {
    const { db } = await requireOrgContext();
    const url = new URL(request.url);

    const kind = url.searchParams.get("kind");
    const status = url.searchParams.get("status");
    const language = url.searchParams.get("language");
    const offerable = url.searchParams.get("offerable") === "true";

    if (kind && !KINDS.includes(kind)) {
      return NextResponse.json(
        { success: false, error: `Kind must be one of ${KINDS.join(", ")}.` },
        { status: 400 }
      );
    }

    if (status && !STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Status must be one of ${STATUSES.join(", ")}.` },
        { status: 400 }
      );
    }

    if (offerable) {
      const query = asidePickerQuery({
        kind: (kind ?? "JOKE") as AsideKind,
        language: language ?? "pt-PT",
      });

      const asides = await db.aside.findMany({
        where: query.where,
        orderBy: query.orderBy,
        take: 50,
      });

      return NextResponse.json({ success: true, data: asides });
    }

    const asides = await db.aside.findMany({
      where: {
        ...(kind ? { kind: kind as AsideKind } : {}),
        ...(status ? { status: status as "PENDING" | "APPROVED" | "RETIRED" } : {}),
        ...(language ? { language } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ success: true, data: asides });
  } catch (error) {
    console.error("Error listing asides:", error);

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/asides
 *
 * Write a new aside. EDITOR or above.
 *
 * This is also the path the send screen's free-text field takes, with `reusable: false`,
 * so everything that appears in an edition is a row in this table and there is one answer
 * to "what did edition 32 send".
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    const body = await request.json().catch(() => null);
    const parsed = parseAsideCreate(body);

    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const aside = await ctx.db.aside.create({
      // Cast for the same reason mediaAsset.create carries one: the tenant client injects
      // organizationId at runtime, and Prisma's create type requires it up front.
      data: {
        ...parsed.value,
        // Never taken from the body: whether a person or a model wrote the line is a fact
        // about its origin, and a caller able to set it could relabel a suggestion.
        source: "HUMAN",
      } as never,
    });

    return NextResponse.json({ success: true, data: aside }, { status: 201 });
  } catch (error) {
    console.error("Error creating aside:", error);

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
