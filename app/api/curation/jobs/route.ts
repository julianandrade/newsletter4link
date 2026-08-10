import { NextResponse } from "next/server";
import {
  getJobs,
  deleteJobsOlderThan,
  JOB_SORT_FIELDS,
} from "@/lib/curation/job-manager";
import { CurationJobStatus } from "@prisma/client";
import { parseSort } from "@/lib/list-sort";

/**
 * GET /api/curation/jobs?page=&limit=&status=&from=&to=&sortBy=&sortOrder=
 *
 * The date range and the order are parameters now. They were applied in the browser to the
 * ten rows this route had already chosen, which made "Longest first" a claim about page one
 * and made a date range blank the pager without changing it.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const statusParam = searchParams.get("status");

    let status: CurationJobStatus | undefined;
    if (statusParam && ["RUNNING", "COMPLETED", "FAILED", "CANCELLED"].includes(statusParam)) {
      status = statusParam as CurationJobStatus;
    }

    const sort = parseSort(searchParams, JOB_SORT_FIELDS, {
      field: "startedAt",
      direction: "desc",
    });

    const result = await getJobs({
      page,
      limit,
      status,
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      sortBy: sort.field,
      sortOrder: sort.direction,
    });

    return NextResponse.json({ ...result, sort });
  } catch (error) {
    console.error("Error fetching curation jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch curation jobs" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/curation/jobs?olderThanDays=30
 * Bulk delete jobs older than specified number of days
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const olderThanDaysParam = searchParams.get("olderThanDays");

    if (!olderThanDaysParam) {
      return NextResponse.json(
        { error: "olderThanDays query parameter is required" },
        { status: 400 }
      );
    }

    const olderThanDays = parseInt(olderThanDaysParam);

    if (isNaN(olderThanDays) || olderThanDays < 1) {
      return NextResponse.json(
        { error: "olderThanDays must be a positive integer" },
        { status: 400 }
      );
    }

    const deletedCount = await deleteJobsOlderThan(olderThanDays);

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} job(s) older than ${olderThanDays} day(s)`,
    });
  } catch (error) {
    console.error("Error deleting curation jobs:", error);
    return NextResponse.json(
      { error: "Failed to delete curation jobs" },
      { status: 500 }
    );
  }
}
