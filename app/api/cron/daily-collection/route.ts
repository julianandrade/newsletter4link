import { NextResponse } from "next/server";
import { runCurationPipeline } from "@/lib/curation/curator";
import { authorizeCron } from "@/lib/auth/cron";
import {
  addJobLog,
  completeJob,
  createJob,
  failJob,
  updateJobStats,
} from "@/lib/curation/job-manager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/cron/daily-collection
 *
 * Runs the content curation pipeline for all organizations.
 *
 * Fired by Vercel Cron at 09:00 UTC (see vercel.json) and again by
 * .github/workflows/curation.yml, which exists only because Hobby accounts cap a
 * Vercel cron at once per day. Both callers are authorized the same way and the
 * pipeline is safe to run twice: an article already seen is counted as a duplicate
 * rather than written again.
 *
 * Every run writes a CurationJob row. It did not, for months, and that is why this
 * job looked dead: /dashboard/curation lists CurationJob rows, only the dashboard's
 * own streaming path created any, and so a scheduled run that collected 45 articles
 * left no trace anywhere the product could show it. A job nobody can see is
 * indistinguishable from a job that never ran.
 */
export async function GET(request: Request) {
  try {
    const auth = authorizeCron(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    console.log("[CRON] Starting daily content collection for all organizations...");

    /**
     * Every live organization. Archived ones are skipped, because an organization that is
     * hidden but still collecting is a bill with no reader: it spends model credits on
     * articles nobody can open, and its scoring failures fill the job list of a product
     * that has been parked.
     */
    const organizations = await prisma.organization.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
    });

    const results: Array<{
      organizationId: string;
      organizationName: string;
      jobId: string | null;
      curated: number;
      duplicates: number;
      lowScore: number;
      errors: number;
    }> = [];

    /**
     * Which caller this was, recorded on the job so the two schedules are told apart
     * in the job's own log rather than by guessing from its start time.
     */
    const trigger = new URL(request.url).searchParams.get("trigger") ?? "schedule";

    for (const org of organizations) {
      /**
       * The job row is created before the work and closed after it, in a shape the
       * dashboard already knows how to render.
       *
       * Deliberately not guarded by getCurrentJob(): that lock is global rather than
       * per-organization, so a manual run left mid-flight would make the scheduled run
       * skip every organization silently. A silent skip is the failure mode this whole
       * route is being fixed for, and running twice only inflates the duplicate count.
       */
      let jobId: string | null = null;

      try {
        console.log(`[CRON] Processing organization: ${org.name}`);

        const job = await createJob(org.id);
        jobId = job.id;
        await addJobLog(job.id, "info", `Started by ${trigger} (daily-collection)`);

        const result = await runCurationPipeline(org.id);

        await updateJobStats(job.id, {
          totalFound: result.total,
          processed: result.processed,
          duplicates: result.duplicates,
          lowScore: result.lowScore,
          curated: result.curated,
          errorsCount: result.errors.length,
        });

        // Kept on the job rather than only in the platform log, which on Hobby is
        // retained for one hour and so is gone before anybody asks.
        for (const message of result.errors.slice(0, 20)) {
          await addJobLog(job.id, "error", message);
        }

        await completeJob(job.id);

        results.push({
          organizationId: org.id,
          organizationName: org.name,
          jobId: job.id,
          curated: result.curated,
          duplicates: result.duplicates,
          lowScore: result.lowScore,
          errors: result.errors.length,
        });
        console.log(`[CRON] ${org.name}: ${result.curated} curated, ${result.duplicates} duplicates`);
      } catch (error) {
        console.error(`[CRON] Error processing ${org.name}:`, error);

        // A row already opened has to be closed, or cleanupStaleJobs finds it ten
        // minutes later and reports the cause as a timeout it was not.
        if (jobId) {
          await failJob(
            jobId,
            error instanceof Error ? error.message : "Unknown error"
          ).catch((closeError) => {
            console.error(`[CRON] Could not close job ${jobId}:`, closeError);
          });
        }

        results.push({
          organizationId: org.id,
          organizationName: org.name,
          jobId,
          curated: 0,
          duplicates: 0,
          lowScore: 0,
          errors: 1,
        });
      }
    }

    console.log("[CRON] Daily content collection complete for all organizations");

    return NextResponse.json({
      success: true,
      message: "Daily content collection completed",
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] Daily collection failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
