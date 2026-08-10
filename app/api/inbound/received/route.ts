import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import {
  getEmailArticles,
  getReceivedEmails,
  RECEIVED_SORT_FIELDS,
} from "@/lib/inbound/received";
import { parseSort } from "@/lib/list-sort";
import type { InboundEmailStatus } from "@prisma/client";

const STATUSES = [
  "RECEIVED",
  "CONTENT_PENDING",
  "PROCESSED",
  "FAILED",
  "IGNORED_UNKNOWN_SENDER",
];

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

    const params = new URL(request.url).searchParams;
    const statusParam = params.get("status");
    const sort = parseSort(params, RECEIVED_SORT_FIELDS, {
      field: "receivedAt",
      direction: "desc",
    });

    const received = await getReceivedEmails(organization.id, {
      status: STATUSES.includes(statusParam ?? "")
        ? (statusParam as InboundEmailStatus)
        : undefined,
      search: params.get("search"),
      sortBy: sort.field,
      sortOrder: sort.direction,
    });

    return NextResponse.json({ success: true, ...received, sort });
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
