import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { getEmailArticles, getReceivedEmails } from "@/lib/inbound/received";

export const dynamic = "force-dynamic";

/**
 * GET /api/inbound/received
 * GET /api/inbound/received?emailId=<id>
 *
 * Finding D2: the emails this organization received, and what each one produced.
 *
 * No OWNER restriction, unlike the unknown-senders panel beside it. That panel is
 * platform-wide because an unmatched email belongs to nobody; these rows are matched, and
 * `Article.inboundEmailId` is what lets a matched email be attributed to an organization.
 * See `lib/inbound/received.ts` for the two ways a row qualifies.
 */
export async function GET(request: Request) {
  try {
    const { organization } = await requireOrgContext();
    const emailId = new URL(request.url).searchParams.get("emailId");

    if (emailId) {
      const articles = await getEmailArticles(organization.id, emailId);

      if (articles === null) {
        // 404 rather than 403: an email outside this organization must not be
        // distinguishable from one that does not exist.
        return NextResponse.json(
          { success: false, error: "Email not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, data: articles });
    }

    const received = await getReceivedEmails(organization.id);

    return NextResponse.json({ success: true, ...received });
  } catch (error) {
    console.error("Error reading received emails:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to read the received emails" },
      { status: 500 }
    );
  }
}
