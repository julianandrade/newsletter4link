import { NextResponse } from "next/server";
import { getCurrentJob, cancelJob } from "@/lib/curation/job-manager";

export async function POST() {
  try {
    const currentJob = await getCurrentJob();

    if (!currentJob) {
      return NextResponse.json(
        { error: "No running curation job to cancel" },
        { status: 404 }
      );
    }

    const cancelledJob = await cancelJob(currentJob.id);

    return NextResponse.json({
      success: true,
      job: cancelledJob,
      message: "Curation job cancellation requested",
    });
  } catch (error) {
    console.error("Error cancelling curation job:", error);
    return NextResponse.json(
      { error: "Failed to cancel curation job" },
      { status: 500 }
    );
  }
}
