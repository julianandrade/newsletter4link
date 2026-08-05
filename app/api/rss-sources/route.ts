import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const sources = await db.rSSSource.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(sources);
  } catch (error) {
    console.error("Error fetching RSS sources:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch RSS sources" },
      { status: 500 }
    );
  }
}

/**
 * RQ-007 step 3: an EMAIL source has no feed URL.
 *
 * The sender address goes in `url`. It is naturally unique per organization, so the existing
 * `@@unique([url, organizationId])` keeps doing useful work, and the column keeps meaning
 * "where this source comes from". Making `url` optional instead would weaken a constraint
 * that earns its place for feeds.
 */
function normalizeEmailSource(body: Record<string, unknown>):
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string } {
  const senderAddress =
    typeof body.senderAddress === "string" ? body.senderAddress.trim().toLowerCase() : "";

  if (!senderAddress) {
    return { ok: false, error: "senderAddress is required for an EMAIL source" };
  }

  // Deliberately loose. A stricter pattern rejects real addresses, and the cost of a typo
  // here is visible immediately: the source never receives, and the health check says so.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderAddress)) {
    return { ok: false, error: `"${senderAddress}" is not a valid email address` };
  }

  if (body.parseMode !== "DIGEST" && body.parseMode !== "ESSAY") {
    return {
      ok: false,
      error: "parseMode must be DIGEST (one email, many linked articles) or ESSAY (the email is the article)",
    };
  }

  const rawTag = typeof body.inboundTag === "string" ? body.inboundTag.trim() : "";
  // Stored lowercased, because that is how the webhook records the tag it parsed off the
  // address. Comparing a mixed-case tag against a lowercased one silently never matches.
  const inboundTag = rawTag ? rawTag.toLowerCase().replace(/^\+/, "") : null;

  let expectedCadenceDays: number | null = null;
  if (body.expectedCadenceDays !== undefined && body.expectedCadenceDays !== null && body.expectedCadenceDays !== "") {
    const cadence = Number(body.expectedCadenceDays);
    if (!Number.isInteger(cadence) || cadence < 1 || cadence > 365) {
      return { ok: false, error: "expectedCadenceDays must be a whole number of days between 1 and 365" };
    }
    expectedCadenceDays = cadence;
  }

  return {
    ok: true,
    data: {
      type: "EMAIL",
      url: senderAddress,
      senderAddress,
      inboundTag,
      parseMode: body.parseMode,
      expectedCadenceDays,
    },
  };
}

export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const body = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "name is required and must be a string" },
        { status: 400 }
      );
    }

    if (!body.category || typeof body.category !== "string") {
      return NextResponse.json(
        { error: "category is required and must be a string" },
        { status: 400 }
      );
    }

    const isEmailSource = body.type === "EMAIL";
    let typeSpecific: Record<string, unknown>;

    if (isEmailSource) {
      const normalized = normalizeEmailSource(body);
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 });
      }
      typeSpecific = normalized.data;
    } else {
      if (!body.url || typeof body.url !== "string") {
        return NextResponse.json(
          { error: "url is required and must be a string" },
          { status: 400 }
        );
      }

      // Validate URL format. Only for a feed: an EMAIL source's `url` is an address.
      try {
        new URL(body.url);
      } catch {
        return NextResponse.json(
          { error: "Invalid URL format" },
          { status: 400 }
        );
      }

      typeSpecific = { type: "RSS", url: body.url.trim() };
    }

    // Check for duplicate URL in this org
    const existing = await db.rSSSource.findFirst({
      where: { url: typeSpecific.url as string },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: isEmailSource
            ? `A source for ${typeSpecific.url} already exists in this organization`
            : "An RSS source with this URL already exists",
        },
        { status: 409 }
      );
    }

    const source = await db.rSSSource.create({
      data: {
        name: body.name.trim(),
        category: body.category.trim(),
        active: body.active !== false,
        ...typeSpecific,
      } as any,
    });

    return NextResponse.json(source, { status: 201 });
  } catch (error) {
    console.error("Error creating RSS source:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create RSS source" },
      { status: 500 }
    );
  }
}
