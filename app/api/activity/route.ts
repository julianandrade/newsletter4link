import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface ActivityItem {
  id: string;
  type: "curation" | "article" | "edition" | "subscriber";
  action: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * GET /api/activity
 * Returns recent activity for the dashboard feed
 */
export async function GET() {
  try {
    const activities: ActivityItem[] = [];

    // Get recent curation jobs (last 10)
    const recentJobs = await prisma.curationJob.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        curated: true,
        totalFound: true,
        startedAt: true,
        completedAt: true,
      },
    });

    for (const job of recentJobs) {
      if (job.status === "COMPLETED" && job.completedAt) {
        activities.push({
          id: `curation-${job.id}`,
          type: "curation",
          action: "completed",
          description: `Curation completed: ${job.curated} articles curated from ${job.totalFound} found`,
          timestamp: job.completedAt,
          metadata: { jobId: job.id, curated: job.curated, found: job.totalFound },
        });
      } else if (job.status === "RUNNING") {
        activities.push({
          id: `curation-${job.id}`,
          type: "curation",
          action: "started",
          description: "Curation job started",
          timestamp: job.startedAt,
          metadata: { jobId: job.id },
        });
      } else if (job.status === "FAILED") {
        activities.push({
          id: `curation-${job.id}`,
          type: "curation",
          action: "failed",
          description: "Curation job failed",
          timestamp: job.completedAt || job.startedAt,
          metadata: { jobId: job.id },
        });
      }
    }

    // Get recently approved/rejected articles (last 20)
    const recentArticles = await prisma.article.findMany({
      where: {
        status: { in: ["APPROVED", "REJECTED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
      },
    });

    for (const article of recentArticles) {
      const action = article.status === "APPROVED" ? "approved" : "rejected";
      activities.push({
        id: `article-${article.id}`,
        type: "article",
        action,
        description: `Article ${action}: ${article.title.substring(0, 50)}${article.title.length > 50 ? "..." : ""}`,
        timestamp: article.updatedAt,
        metadata: { articleId: article.id, title: article.title },
      });
    }

    // Get recently sent editions (last 5)
    const recentEditions = await prisma.edition.findMany({
      where: { status: "SENT" },
      orderBy: { sentAt: "desc" },
      take: 5,
      select: {
        id: true,
        week: true,
        year: true,
        sentAt: true,
      },
    });

    for (const edition of recentEditions) {
      if (edition.sentAt) {
        activities.push({
          id: `edition-${edition.id}`,
          type: "edition",
          action: "sent",
          description: `Newsletter Week ${edition.week}, ${edition.year} sent`,
          timestamp: edition.sentAt,
          metadata: { editionId: edition.id, week: edition.week, year: edition.year },
        });
      }
    }

    // Get recent new subscribers (last 10)
    const recentSubscribers = await prisma.subscriber.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    for (const subscriber of recentSubscribers) {
      activities.push({
        id: `subscriber-${subscriber.id}`,
        type: "subscriber",
        action: "joined",
        description: subscriber.name
          ? `${subscriber.name} subscribed`
          : `New subscriber: ${subscriber.email.substring(0, 20)}...`,
        timestamp: subscriber.createdAt,
        metadata: { subscriberId: subscriber.id },
      });
    }

    // Sort all activities by timestamp, most recent first
    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Return top 15 activities
    return NextResponse.json({
      activities: activities.slice(0, 15),
    });
  } catch (error) {
    console.error("Error fetching activity:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }
}
