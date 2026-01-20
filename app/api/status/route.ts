import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/status
 * Health check and system status
 */
export async function GET() {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    // Get stats
    const [
      totalArticles,
      pendingArticles,
      approvedArticles,
      totalProjects,
      totalSubscribers,
      activeSubscribers,
    ] = await Promise.all([
      prisma.article.count(),
      prisma.article.count({ where: { status: "PENDING_REVIEW" } }),
      prisma.article.count({ where: { status: "APPROVED" } }),
      prisma.project.count(),
      prisma.subscriber.count(),
      prisma.subscriber.count({ where: { active: true } }),
    ]);

    // Get latest edition
    const latestEdition = await prisma.edition.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        week: true,
        year: true,
        status: true,
        sentAt: true,
      },
    });

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected",
      stats: {
        articles: {
          total: totalArticles,
          pending: pendingArticles,
          approved: approvedArticles,
        },
        projects: {
          total: totalProjects,
        },
        subscribers: {
          total: totalSubscribers,
          active: activeSubscribers,
        },
        latestEdition,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
