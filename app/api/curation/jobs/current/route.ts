import { NextResponse } from "next/server";
import { getCurrentJob } from "@/lib/curation/job-manager";

export async function GET() {
  try {
    const job = await getCurrentJob();

    if (!job) {
      return NextResponse.json({ running: false });
    }

    return NextResponse.json({ running: true, job });
  } catch (error) {
    console.error("Error fetching current curation job:", error);
    return NextResponse.json(
      { error: "Failed to fetch current curation job" },
      { status: 500 }
    );
  }
}
