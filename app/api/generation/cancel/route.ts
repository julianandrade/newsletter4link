/**
 * Cancel Generation Job API
 *
 * POST /api/generation/cancel
 *
 * Cancels the currently running generation job for the organization.
 */

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { getRunningJob, cancelJob, JobType } from "@/lib/jobs";

export async function POST() {
  try {
    const { organization } = await requireOrgContext();

    const runningJob = await getRunningJob(organization.id, JobType.GENERATION);

    if (!runningJob) {
      return NextResponse.json(
        { error: "No running generation job to cancel" },
        { status: 404 }
      );
    }

    const cancelledJob = await cancelJob(runningJob.id);

    return NextResponse.json({
      success: true,
      job: {
        id: cancelledJob.id,
        status: cancelledJob.status,
      },
      message: "Generation job cancellation requested",
    });
  } catch (error) {
    console.error("Error cancelling generation job:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to cancel generation job" },
      { status: 500 }
    );
  }
}
