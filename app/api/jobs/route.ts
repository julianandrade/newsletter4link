/**
 * Jobs API
 *
 * GET /api/jobs
 * List jobs for the current organization
 *
 * Query params:
 * - type: JobType (optional, filter by type)
 * - status: JobStatus (optional, filter by status)
 * - page: number (optional, default 1)
 * - limit: number (optional, default 10)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { getJobs, getRunningJob, JobType, JobStatus } from "@/lib/jobs";

export async function GET(request: NextRequest) {
  try {
    const { organization } = await requireOrgContext();

    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type");
    const statusParam = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    // Validate type param
    let type: JobType | undefined;
    if (typeParam) {
      if (!Object.values(JobType).includes(typeParam as JobType)) {
        return NextResponse.json(
          { error: `Invalid job type: ${typeParam}` },
          { status: 400 }
        );
      }
      type = typeParam as JobType;
    }

    // Validate status param
    let status: JobStatus | undefined;
    if (statusParam) {
      if (!Object.values(JobStatus).includes(statusParam as JobStatus)) {
        return NextResponse.json(
          { error: `Invalid job status: ${statusParam}` },
          { status: 400 }
        );
      }
      status = statusParam as JobStatus;
    }

    // If asking for running jobs of a specific type, use the optimized query
    if (type && status === "RUNNING") {
      const runningJob = await getRunningJob(organization.id, type);
      return NextResponse.json({
        jobs: runningJob ? [runningJob] : [],
        total: runningJob ? 1 : 0,
        page: 1,
        totalPages: 1,
      });
    }

    const result = await getJobs(organization.id, { page, limit, type, status });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching jobs:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
