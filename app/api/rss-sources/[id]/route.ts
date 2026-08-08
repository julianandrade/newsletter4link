import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

/**
 * One source, read and written through the tenant client.
 *
 * These three handlers used the raw `prisma` client and looked a source up by id alone,
 * so any member of any organization could read, rewrite or delete another tenant's feeds
 * by guessing an id. `db` scopes every query to the caller's organization, which turns
 * that into a 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requireOrgContext();
    const { id } = await params;

    const source = await db.rSSSource.findFirst({
      where: { id },
    });

    if (!source) {
      return NextResponse.json(
        { error: "RSS source not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(source);
  } catch (error) {
    console.error("Error fetching RSS source:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to fetch RSS source" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requireOrgContext();
    const { id } = await params;
    const body = await request.json();

    // Check if source exists, within this organization.
    const existing = await db.rSSSource.findFirst({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "RSS source not found" },
        { status: 404 }
      );
    }

    const isEmailSource = existing.type === "EMAIL";

    // Build update object
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      updates.name = body.name.trim();
    }

    if (typeof body.url === "string") {
      /**
       * A feed's `url` is a URL; an EMAIL source's is its sender address.
       *
       * Validating an address with `new URL` rejected it, so this branch made an email
       * source uneditable through any field once `url` was sent alongside. The address is
       * changed through `senderAddress` below, which keeps the two columns in step.
       */
      if (isEmailSource) {
        return NextResponse.json(
          {
            error:
              "An email source's address is changed with senderAddress, not url",
          },
          { status: 400 }
        );
      }

      try {
        new URL(body.url);
      } catch {
        return NextResponse.json(
          { error: "Invalid URL format" },
          { status: 400 }
        );
      }

      // Check for duplicate URL in this organization (excluding current source)
      const duplicateUrl = await db.rSSSource.findFirst({
        where: {
          url: body.url,
          NOT: { id },
        },
      });

      if (duplicateUrl) {
        return NextResponse.json(
          { error: "An RSS source with this URL already exists" },
          { status: 409 }
        );
      }

      updates.url = body.url.trim();
    }

    if (typeof body.category === "string") {
      updates.category = body.category.trim();
    }

    if (typeof body.active === "boolean") {
      updates.active = body.active;
    }

    /**
     * The email-source fields, which this route used to ignore entirely.
     *
     * `parseMode` above all. Nothing infers it: it is a human's answer to "is this
     * newsletter a list of links or a piece of writing", chosen once in the creation form
     * and, until now, never changeable. Getting it wrong is not a small mistake. A digest
     * read as an essay produces one article that is the whole newsletter instead of the
     * fifteen it points at, which is what happened to fourteen sources here.
     */
    if (body.parseMode !== undefined) {
      if (!isEmailSource) {
        return NextResponse.json(
          { error: "parseMode only applies to an email source" },
          { status: 400 }
        );
      }

      if (body.parseMode !== "DIGEST" && body.parseMode !== "ESSAY") {
        return NextResponse.json(
          {
            error:
              "parseMode must be DIGEST (one email, many linked articles) or ESSAY (the email is the article)",
          },
          { status: 400 }
        );
      }

      updates.parseMode = body.parseMode;
    }

    if (typeof body.senderAddress === "string") {
      if (!isEmailSource) {
        return NextResponse.json(
          { error: "senderAddress only applies to an email source" },
          { status: 400 }
        );
      }

      const senderAddress = body.senderAddress.trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderAddress)) {
        return NextResponse.json(
          { error: `"${senderAddress}" is not a valid email address` },
          { status: 400 }
        );
      }

      const duplicate = await db.rSSSource.findFirst({
        where: { url: senderAddress, NOT: { id } },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: `A source for ${senderAddress} already exists in this organization` },
          { status: 409 }
        );
      }

      // Both columns, together. `url` carries the uniqueness constraint and
      // `senderAddress` is what the matcher reads; letting them drift means a source that
      // matches nothing while looking correctly configured.
      updates.senderAddress = senderAddress;
      updates.url = senderAddress;
    }

    if (body.inboundTag !== undefined) {
      if (!isEmailSource) {
        return NextResponse.json(
          { error: "inboundTag only applies to an email source" },
          { status: 400 }
        );
      }

      const raw = typeof body.inboundTag === "string" ? body.inboundTag.trim() : "";
      // Lowercased, because that is how the webhook records the tag it parsed off the
      // address. Comparing a mixed-case tag against a lowercased one never matches.
      updates.inboundTag = raw ? raw.toLowerCase().replace(/^\+/, "") : null;
    }

    if (body.expectedCadenceDays !== undefined) {
      if (body.expectedCadenceDays === null || body.expectedCadenceDays === "") {
        updates.expectedCadenceDays = null;
      } else {
        const cadence = Number(body.expectedCadenceDays);

        if (!Number.isInteger(cadence) || cadence < 1 || cadence > 365) {
          return NextResponse.json(
            {
              error:
                "expectedCadenceDays must be a whole number of days between 1 and 365",
            },
            { status: 400 }
          );
        }

        updates.expectedCadenceDays = cadence;
      }
    }

    const source = await db.rSSSource.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json(source);
  } catch (error) {
    console.error("Error updating RSS source:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to update RSS source" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requireOrgContext();
    const { id } = await params;

    // Check if source exists, within this organization.
    const existing = await db.rSSSource.findFirst({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "RSS source not found" },
        { status: 404 }
      );
    }

    await db.rSSSource.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting RSS source:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to delete RSS source" },
      { status: 500 }
    );
  }
}
