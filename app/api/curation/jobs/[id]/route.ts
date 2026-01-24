import { NextResponse } from "next/server";
import { getJob } from "@/lib/curation/job-manager";

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
