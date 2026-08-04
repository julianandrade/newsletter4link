import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeCron } from "@/lib/auth/cron";
import { createTenantClient } from "@/lib/db/tenant";
import { isoWeekAndYear, isoWeekStart } from "@/lib/radar/week";
import {
  ensureProposal,
  refreshProposal,
  type ProposalWeek,
} from "@/lib/editions/proposal";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/cron/weekly-proposal
 *
 * RQ-005 action 1, and the resolution of conflict C1. This schedule assembles
 * the week's proposal for every organization and stops there. It replaces
 * `weekly-send`, which finalized and sent an edition with no human in the loop:
 * BR-011 and decision D1 both forbid that, so the route was deleted rather than
 * unscheduled, because a route that exists can be called.
 *
 * What that means for anyone editing this file: it must not import anything from
 * `lib/email/`, must not call `sendNewsletterToAll` or `markEditionSent`, and
 * must not write `FINALIZED` or `SENT`. Automation may propose. Only a person
 * may approve (AC-1.9, AC-2.7).
 *
 * It runs daily, half an hour after collection, so the proposal is current
 * whenever someone opens the product rather than only on a Monday.
 */
export async function GET(request: Request) {
  try {
    const auth = authorizeCron(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const now = new Date();
    const { week, year } = isoWeekAndYear(now);
    const proposalWeek: ProposalWeek = {
      week,
      year,
      startsAt: isoWeekStart(week, year),
    };

    console.log(`[CRON] Topping up week ${week} of ${year} for all organizations...`);

    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true },
    });

    const results: Array<{
      organizationId: string;
      organizationName: string;
      created: boolean;
      added: number;
      projectsAdded: number;
      articles: number;
      thin: boolean;
      skipped: string | null;
      error?: string;
    }> = [];

    for (const org of organizations) {
      try {
        // Tenant-scoped per organization: a proposal is never created for one
        // organization from another's data (AC-1.4).
        const db = createTenantClient(org.id);

        const ensured = await ensureProposal(db, proposalWeek);
        const refreshed = await refreshProposal(db, ensured.id, now);

        results.push({
          organizationId: org.id,
          organizationName: org.name,
          created: ensured.created,
          added: refreshed.added,
          projectsAdded: refreshed.projectsAdded,
          articles: refreshed.articleCount,
          thin: refreshed.thin,
          skipped: refreshed.skipped,
        });

        console.log(
          `[CRON] ${org.name}: ${ensured.created ? "created" : "found"}, ` +
            `${refreshed.added} added, ${refreshed.articleCount} in the proposal` +
            `${refreshed.thin ? ", thin" : ""}`
        );
      } catch (error) {
        // One organization's failure must not stop the rest.
        console.error(`[CRON] Error proposing for ${org.name}:`, error);
        results.push({
          organizationId: org.id,
          organizationName: org.name,
          created: false,
          added: 0,
          projectsAdded: 0,
          articles: 0,
          thin: true,
          skipped: null,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Proposed week ${week} of ${year} for ${organizations.length} organizations`,
      data: { week, year, results },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] Weekly proposal failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
