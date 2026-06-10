import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";

// Resend webhook event types
type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.complained"
  | "email.bounced"
  | "email.opened"
  | "email.clicked";

interface ResendWebhookEvent {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // For click events
    click?: {
      link: string;
      timestamp: string;
    };
    // For bounce events
    bounce?: {
      message: string;
    };
  };
}

// Map Resend event types to our EmailEventType enum
function mapEventType(
  resendType: ResendEventType
): "DELIVERED" | "OPENED" | "CLICKED" | "BOUNCED" | null {
  switch (resendType) {
    case "email.delivered":
      return "DELIVERED";
    case "email.opened":
      return "OPENED";
    case "email.clicked":
      return "CLICKED";
    case "email.bounced":
      return "BOUNCED";
    default:
      return null;
  }
}

// Verify a Svix webhook signature (Resend uses Svix).
// The svix-signature header is a space-delimited list of "v1,<base64 hmac>"
// entries; the HMAC key is the base64-decoded secret after the "whsec_" prefix.
function verifySvixSignature(
  payload: string,
  headers: { id: string; timestamp: string; signature: string },
  secret: string
): boolean {
  const secretKey = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedPayload = `${headers.id}.${headers.timestamp}.${payload}`;
  const expected = crypto
    .createHmac("sha256", secretKey)
    .update(signedPayload)
    .digest();

  return headers.signature.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    const provided = Buffer.from(signature, "base64");
    return (
      provided.length === expected.length &&
      crypto.timingSafeEqual(provided, expected)
    );
  });
}

// Reject events older than 5 minutes to limit replay attacks
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = config.email.resend.webhookSecret;

    // Fail closed: this route is public, so an unset secret must not
    // mean unverified events get processed
    if (!webhookSecret) {
      console.error("RESEND_WEBHOOK_SECRET is not configured; rejecting webhook");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 503 }
      );
    }

    // Get raw body for signature verification
    const payload = await request.text();

    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn("Missing webhook signature headers");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    const timestampAge = Math.abs(
      Date.now() / 1000 - Number(svixTimestamp)
    );
    if (!Number.isFinite(timestampAge) || timestampAge > TIMESTAMP_TOLERANCE_SECONDS) {
      console.warn("Webhook timestamp outside tolerance");
      return NextResponse.json({ error: "Invalid timestamp" }, { status: 401 });
    }

    const isValid = verifySvixSignature(
      payload,
      { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret
    );

    if (!isValid) {
      console.warn("Invalid webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event: ResendWebhookEvent = JSON.parse(payload);
    console.log(`Received Resend webhook: ${event.type}`);

    // Map to our event type
    const eventType = mapEventType(event.type);
    if (!eventType) {
      // Event type we don't track (e.g., email.sent, email.delivery_delayed)
      console.log(`Ignoring event type: ${event.type}`);
      return NextResponse.json({ received: true });
    }

    const { email_id: messageId, to } = event.data;
    const recipientEmail = to[0]; // Newsletter emails are sent individually

    if (!recipientEmail) {
      console.warn("No recipient email in webhook event");
      return NextResponse.json({ received: true });
    }

    // Find the subscriber by email (across all organizations)
    const subscriber = await prisma.subscriber.findFirst({
      where: { email: recipientEmail },
    });

    if (!subscriber) {
      console.warn(`Subscriber not found for email: ${recipientEmail}`);
      return NextResponse.json({ received: true });
    }

    // Find the SENT event with this messageId to get the editionId
    const sentEvent = await prisma.emailEvent.findFirst({
      where: {
        subscriberId: subscriber.id,
        eventType: "SENT",
        metadata: {
          path: ["messageId"],
          equals: messageId,
        },
      },
      orderBy: { timestamp: "desc" },
    });

    if (!sentEvent) {
      console.warn(`No SENT event found for messageId: ${messageId}`);
      return NextResponse.json({ received: true });
    }

    // Build metadata for the event
    const metadata: Record<string, string> = {
      messageId,
      resendEventType: event.type,
    };

    if (eventType === "CLICKED" && event.data.click) {
      metadata.url = event.data.click.link;
      metadata.clickedAt = event.data.click.timestamp;
    }

    if (eventType === "BOUNCED" && event.data.bounce) {
      metadata.reason = event.data.bounce.message;
    }

    // Create the email event
    await prisma.emailEvent.create({
      data: {
        subscriberId: subscriber.id,
        editionId: sentEvent.editionId,
        eventType,
        metadata,
        timestamp: new Date(event.created_at),
      },
    });

    console.log(
      `Created ${eventType} event for subscriber ${subscriber.email}`
    );

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Handle webhook verification (GET request from Resend)
export async function GET() {
  return NextResponse.json({ status: "Webhook endpoint active" });
}
