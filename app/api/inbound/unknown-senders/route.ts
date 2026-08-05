import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { getUnknownSenders, requeueSender } from "@/lib/inbound/unknown-senders";

/**
 * RQ-007 step 3: the unknown senders panel, and the promote action behind it.
 *
 * ## Why OWNER, and why that is stated rather than hidden
 *
 * `InboundEmail` has no organizationId, deliberately: an email arriving at a shared address
 * does not belong to a tenant until a source claims it. Every view over these rows is
 * therefore platform-wide, and a member of one organization would read the other's subject
 * lines and could promote a sender whose mail was meant for them.
 *
 * Restricting this to OWNER and documenting it as platform-wide is the honest resolution.
 * The alternative considered was recording which organization claimed a matched email and
 * showing only unmatched rows plus that organization's own, which costs a schema change and
 * still cannot isolate the unmatched rows the panel exists to show. With one real tenant the
 * restriction costs nothing, and it does not pretend to an isolation the shared address
 * cannot provide.
 */

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message.startsWith("Unauthorized")) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof Error && error.message.startsWith("Forbidden")) {
    // Said plainly. A 403 with no reason sends someone hunting for a bug that is a policy.
    return NextResponse.json(
      {
        error:
          "Only an organization OWNER can see inbound senders. Inbound emails arrive at a shared address and belong to no organization until a source claims them, so this view is platform-wide.",
      },
      { status: 403 }
    );
  }

  return null;
}

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "OWNER");

    const report = await getUnknownSenders();

    return NextResponse.json({
      ...report,
      // Serialized explicitly so the client is not guessing at Date handling.
      groups: report.groups.map((group) => ({
        ...group,
        firstSeenAt: group.firstSeenAt.toISOString(),
        lastSeenAt: group.lastSeenAt.toISOString(),
      })),
    });
  } catch (error) {
    const mapped = errorResponse(error);
    if (mapped) return mapped;

    console.error("Error listing unknown senders:", error);
    return NextResponse.json(
      { error: "Failed to list unknown senders" },
      { status: 500 }
    );
  }
}

/**
 * Requeue one sender's held emails.
 *
 * Separate from source creation on purpose. The source is created through
 * `POST /api/rss-sources` like any other, so there is one code path that writes a source and
 * one set of validation rules; this only puts the mail that was already discarded back in
 * the queue. Creating the source without requeueing is a valid thing to want, and coupling
 * them would remove the choice.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "OWNER");

    const body = await request.json().catch(() => null);
    const sender = typeof body?.sender === "string" ? body.sender.trim() : "";

    if (!sender) {
      return NextResponse.json(
        { error: "sender is required" },
        { status: 400 }
      );
    }

    const { requeued } = await requeueSender(sender);

    return NextResponse.json({
      sender,
      requeued,
      message:
        requeued === 0
          ? `Nothing held for ${sender}. Either its emails were never discarded, or they are already queued.`
          : `${requeued} email${requeued === 1 ? "" : "s"} from ${sender} back in the queue. The next ingest run will read them.`,
    });
  } catch (error) {
    const mapped = errorResponse(error);
    if (mapped) return mapped;

    console.error("Error requeueing sender:", error);
    return NextResponse.json(
      { error: "Failed to requeue this sender" },
      { status: 500 }
    );
  }
}
