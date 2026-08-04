import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { isoWeekAndYear, isoWeekStart } from "@/lib/radar/week";
import { readPipelineStatus } from "@/lib/radar/pipeline";
import {
  ensureProposal,
  readProposal,
  refreshProposal,
  type ProposalWeek,
} from "@/lib/editions/proposal";

export const dynamic = "force-dynamic";

/**
 * RQ-005 action 1: the week's proposal, read and topped up.
 *
 * This route proposes. It does not send: it imports nothing from `lib/email/`
 * and writes no status other than the `DRAFT` that `ensureProposal` creates
 * (BR-011, AC-1.9).
 */

/** RQ-005 AC-1.8: one helper answers which week it is, for every surface. */
function currentWeek(now: Date): ProposalWeek {
  const { week, year } = isoWeekAndYear(now);
  return { week, year, startsAt: isoWeekStart(week, year) };
}

/**
 * GET /api/editions/proposal
 *
 * Ensures the current ISO week has a proposal, then returns it with the week's
 * counts (AC-1.1, AC-1.5). Any member may call it, VIEWER included: reading a
 * draft is not sending one, and the schedule would have created it anyway.
 *
 * Creating on a GET is deliberate. The alternative is a screen that opens on an
 * empty state and then posts, which is the "know the internal steps" problem
 * BR-010 exists to remove. The write is an idempotent upsert, so a second call
 * changes nothing.
 */
export async function GET() {
  try {
    const { db } = await requireOrgContext();

    const now = new Date();
    const week = currentWeek(now);

    const ensured = await ensureProposal(db, week);

    // A proposal that has just come into existence is empty, and AC-1.2 wants
    // the week's stories already in it. An existing proposal is left as the
    // editor left it: the schedule tops that one up.
    if (ensured.created) {
      await refreshProposal(db, ensured.id, now);
    }

    // AC-5.1 to AC-5.6: the collector's own state, read in the same request. The
    // screen has one data source, so a band saying "not reported yet" would mean a
    // second fetch, and it is what the screen showed while this was missing.
    const [data, pipeline] = await Promise.all([
      readProposal(db, ensured.id, { startsAt: week.startsAt, now }),
      readPipelineStatus(db, now),
    ]);

    return NextResponse.json({ success: true, data: { ...data, pipeline } });
  } catch (error) {
    return errorResponse(error, "reading the proposal");
  }
}

/**
 * POST /api/editions/proposal
 *
 * "Pull in what has been collected since", the same function the schedule calls.
 * EDITOR or above, because it changes what the proposal holds.
 */
export async function POST() {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");
    const { db } = ctx;

    const now = new Date();
    const week = currentWeek(now);

    const ensured = await ensureProposal(db, week);
    const refreshed = await refreshProposal(db, ensured.id, now);

    // AC-5.1 to AC-5.6: the collector's own state, read in the same request. The
    // screen has one data source, so a band saying "not reported yet" would mean a
    // second fetch, and it is what the screen showed while this was missing.
    const [data, pipeline] = await Promise.all([
      readProposal(db, ensured.id, { startsAt: week.startsAt, now }),
      readPipelineStatus(db, now),
    ]);

    return NextResponse.json({
      success: true,
      data: { ...data, pipeline },
      added: refreshed.added,
      projectsAdded: refreshed.projectsAdded,
      message: describeRefresh(refreshed),
    });
  } catch (error) {
    return errorResponse(error, "refreshing the proposal");
  }
}

/** RQ-005 BR-009: the response says what happened, including when the honest
 *  answer is that nothing new had arrived. */
function describeRefresh(refreshed: {
  added: number;
  projectsAdded: number;
  skipped: "not-found" | "not-draft" | null;
}): string {
  if (refreshed.skipped === "not-draft") {
    return "This week's edition is no longer a draft, so it was left as it is";
  }
  if (refreshed.skipped === "not-found") {
    return "No proposal for this week was found";
  }
  if (refreshed.added === 0 && refreshed.projectsAdded === 0) {
    return "Nothing new has been collected since the last refresh";
  }

  const parts: string[] = [];
  if (refreshed.added > 0) {
    parts.push(`${refreshed.added} ${refreshed.added === 1 ? "story" : "stories"}`);
  }
  if (refreshed.projectsAdded > 0) {
    parts.push(
      `${refreshed.projectsAdded} ${refreshed.projectsAdded === 1 ? "project" : "projects"}`
    );
  }
  return `Added ${parts.join(" and ")} to this week's proposal`;
}

function errorResponse(error: unknown, whileDoing: string) {
  console.error(`Error ${whileDoing}:`, error);

  if (error instanceof Error && error.message.startsWith("Unauthorized")) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 401 }
    );
  }

  if (error instanceof Error && error.message.startsWith("Forbidden")) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 403 }
    );
  }

  return NextResponse.json(
    { success: false, error: `Failed while ${whileDoing}` },
    { status: 500 }
  );
}
