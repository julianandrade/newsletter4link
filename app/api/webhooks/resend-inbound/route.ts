import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { verifyResendWebhook } from "@/lib/webhooks/verify";
import { bareAddress, subaddressTag } from "@/lib/inbound/address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/resend-inbound
 *
 * RQ-007 step 1: an email arrived. Write down that it arrived, and stop.
 *
 * From here nothing is lost, which is the reason this is the first thing built:
 * subscriptions can accumulate before any of the processing exists, and Resend retains
 * every inbound email on its side as well, so a row here plus their copy means two
 * independent records.
 *
 * The `email.received` payload carries metadata only, no body. The content is fetched by
 * the job, not here: this handler runs on someone else's timeout, and the retry loop that
 * recovers a failed fetch has to exist regardless, so making the fetch inline would buy
 * content a few minutes earlier at the cost of the only part of this system that must not
 * be slow. Rows therefore start at CONTENT_PENDING.
 *
 * Reachability and authorization are one subject here. This route is public, because a
 * webhook caller has no session, so the signature is the whole of its authorization.
 * `verifyResendWebhook` fails closed on a missing secret and on a bad signature.
 */

interface InboundEvent {
  type?: string;
  data?: {
    email_id?: string;
    id?: string;
    from?: string | { address?: string };
    to?: string | string[];
    subject?: string;
    created_at?: string;
  };
  created_at?: string;
}

const firstRecipient = (to: InboundEvent["data"] extends undefined ? never : unknown) => {
  if (typeof to === "string") return to;
  if (Array.isArray(to) && typeof to[0] === "string") return to[0];
  return null;
};

export async function POST(request: Request) {
  try {
    const body = await request.text();

    const verified = verifyResendWebhook(
      body,
      request.headers,
      config.email.resend.inboundWebhookSecret
    );

    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: verified.status });
    }

    const event = verified.payload as InboundEvent;

    // Anything other than a received email is acknowledged and dropped. Returning an error
    // for an event we did not ask for would put the delivery into Resend's retry loop for
    // no reason.
    if (event.type !== "email.received") {
      return NextResponse.json({ received: true, ignored: event.type ?? "unknown" });
    }

    const resendEmailId = event.data?.email_id ?? event.data?.id;

    if (!resendEmailId) {
      // 200, not 400: a payload we cannot key is not a transport failure, and retrying it
      // will produce the same payload. Logged so it can be found in Resend's dashboard,
      // which keeps its own copy either way.
      console.error("Inbound webhook payload had no email id:", body.slice(0, 500));
      return NextResponse.json({ received: true, stored: false });
    }

    const from =
      typeof event.data?.from === "string"
        ? event.data.from
        : (event.data?.from?.address ?? "");
    const to = firstRecipient(event.data?.to) ?? "";

    const record = {
      from: bareAddress(from) ?? from,
      to,
      subaddressTag: subaddressTag(to),
      subject: event.data?.subject ?? null,
      receivedAt: event.data?.created_at
        ? new Date(event.data.created_at)
        : event.created_at
          ? new Date(event.created_at)
          : new Date(),
    };

    /**
     * Upsert on the email id, so a replay from the dashboard and a transport retry both
     * land on the same row.
     *
     * The update deliberately touches only the metadata. It must not reset `status`,
     * `retryCount` or `processedAt`: a replay of an email already processed would otherwise
     * send it through extraction a second time and create the articles again.
     */
    await prisma.inboundEmail.upsert({
      where: { resendEmailId },
      create: { resendEmailId, ...record },
      update: record,
    });

    return NextResponse.json({ received: true, stored: true });
  } catch (error) {
    console.error("Error handling inbound email webhook:", error);

    // 500 here is correct: an unexpected failure is exactly the case Resend's retry is for,
    // and their copy of the email is not lost either way.
    return NextResponse.json(
      { error: "Failed to record the inbound email" },
      { status: 500 }
    );
  }
}

/** A GET is how a person checks the endpoint exists. It says nothing about configuration. */
export async function GET() {
  return NextResponse.json({ status: "Inbound email webhook active" });
}
