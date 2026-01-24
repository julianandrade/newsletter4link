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

// Verify webhook signature
function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = config.email.resend.webhookSecret;

    // Get raw body for signature verification
    const payload = await request.text();

    // Verify signature if webhook secret is configured
    if (webhookSecret) {
      const signature = request.headers.get("svix-signature");

      if (!signature) {
        console.warn("Missing webhook signature");
        return NextResponse.json(
          { error: "Missing signature" },
          { status: 401 }
        );
      }

      // Resend uses Svix for webhooks - extract the signature from the header
      // Format: v1,<signature>
      const signatureParts = signature.split(",");
      const v1Signature = signatureParts
        .find((part) => part.startsWith("v1,"))
        ?.replace("v1,", "");

      if (v1Signature) {
        const svixId = request.headers.get("svix-id") || "";
        const svixTimestamp = request.headers.get("svix-timestamp") || "";
        const signedPayload = `${svixId}.${svixTimestamp}.${payload}`;

        const isValid = verifySignature(
          signedPayload,
          v1Signature,
          webhookSecret
        );

        if (!isValid) {
          console.warn("Invalid webhook signature");
          return NextResponse.json(
            { error: "Invalid signature" },
            { status: 401 }
          );
        }
      }
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

    // Find the subscriber by email
    const subscriber = await prisma.subscriber.findUnique({
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
