import { NextResponse } from "next/server";
import { getJobs } from "@/lib/curation/job-manager";
import { CurationJobStatus } from "@prisma/client";

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

    const result = await getJobs({ page, limit, status });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching curation jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch curation jobs" },
      { status: 500 }
    );
  }
}
