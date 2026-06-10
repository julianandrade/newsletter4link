import { NextResponse } from "next/server";
import { getCurrentJob } from "@/lib/curation/job-manager";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const job = await getCurrentJob();

    if (!job) {
      return NextResponse.json({ running: false });
    }

    return NextResponse.json({ running: true, job });
  } catch (error) {
    logger.error("Error fetching current curation job", error);
    return NextResponse.json(
      { error: "Failed to fetch current curation job" },
      { status: 500 }
    );
  }
}
