import { NextResponse } from "next/server";
import { getJob, deleteJob } from "@/lib/curation/job-manager";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await getJob(id);

    if (!job) {
      return NextResponse.json(
        { error: "Curation job not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error("Error fetching curation job:", error);
    return NextResponse.json(
      { error: "Failed to fetch curation job" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/curation/jobs/[id]
 * Delete a single curation job by ID
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if job exists and is not running
    const existingJob = await getJob(id);

    if (!existingJob) {
      return NextResponse.json(
        { error: "Curation job not found" },
        { status: 404 }
      );
    }

    if (existingJob.status === "RUNNING") {
      return NextResponse.json(
        { error: "Cannot delete a running job. Cancel it first." },
        { status: 400 }
      );
    }

    const deletedJob = await deleteJob(id);

    if (!deletedJob) {
      return NextResponse.json(
        { error: "Failed to delete curation job" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Curation job deleted successfully",
      deletedJob,
    });
  } catch (error) {
    console.error("Error deleting curation job:", error);
    return NextResponse.json(
      { error: "Failed to delete curation job" },
      { status: 500 }
    );
  }
}
