import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * GET /api/editions
 * Get all editions with article/project counts, sorted by year desc, week desc (tenant-scoped)
 */
export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const editions = await db.edition.findMany({
      orderBy: [
        { year: "desc" },
        { week: "desc" },
      ],
      include: {
        _count: {
          select: {
            articles: true,
            projects: true,
          },
        },
      },
    });

    // Transform to include count in a cleaner format
    const editionsWithCounts = editions.map((edition: any) => ({
      id: edition.id,
      week: edition.week,
      year: edition.year,
      status: edition.status,
      scheduledDate: edition.scheduledDate,
      finalizedAt: edition.finalizedAt,
      sentAt: edition.sentAt,
      generatedContent: edition.generatedContent,
      generatedAt: edition.generatedAt,
      createdAt: edition.createdAt,
      updatedAt: edition.updatedAt,
      articleCount: edition._count?.articles ?? 0,
      projectCount: edition._count?.projects ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data: editionsWithCounts,
      count: editionsWithCounts.length,
    });
  } catch (error) {
    console.error("Error fetching editions:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/editions
 * Create a new edition with optional auto-population of approved articles and featured projects (tenant-scoped)
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const body = await request.json();
    const { week, year, autoPopulate = true } = body;

    // Validation
    if (week === undefined || year === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: "Week and year are required",
        },
        { status: 400 }
      );
    }

    if (typeof week !== "number" || week < 1 || week > 53) {
      return NextResponse.json(
        {
          success: false,
          error: "Week must be a number between 1 and 53",
        },
        { status: 400 }
      );
    }

    if (typeof year !== "number" || year < 2000 || year > 2100) {
      return NextResponse.json(
        {
          success: false,
          error: "Year must be a valid year between 2000 and 2100",
        },
        { status: 400 }
      );
    }

    // Check if edition already exists in this org
    const existingEdition = await db.edition.findFirst({
      where: { week, year },
    });

    if (existingEdition) {
      return NextResponse.json(
        {
          success: false,
          error: `Edition for week ${week}, ${year} already exists`,
        },
        { status: 409 }
      );
    }

    // Create the edition
    const edition = await db.edition.create({
      data: {
        week,
        year,
        status: "DRAFT",
      } as any,
    });

    let articlesAdded = 0;
    let projectsAdded = 0;

    // Auto-populate with approved articles and featured projects if requested
    if (autoPopulate) {
      // Get approved articles not yet in any edition, sorted by relevance
      const approvedArticles = await db.article.findMany({
        where: {
          status: "APPROVED",
          editions: {
            none: {},
          },
        },
        orderBy: [
          { relevanceScore: "desc" },
          { publishedAt: "desc" },
        ],
        take: 10, // Limit to 10 articles
      });

      // Add articles to edition
      if (approvedArticles.length > 0) {
        await db.editionArticle.createMany({
          data: approvedArticles.map((article, index) => ({
            editionId: edition.id,
            articleId: article.id,
            order: index + 1,
          })),
        });
        articlesAdded = approvedArticles.length;
      }

      // Get featured projects not yet in any edition
      const featuredProjects = await db.project.findMany({
        where: {
          featured: true,
          editions: {
            none: {},
          },
        },
        orderBy: { projectDate: "desc" },
        take: 5, // Limit to 5 projects
      });

      // Add projects to edition
      if (featuredProjects.length > 0) {
        await db.editionProject.createMany({
          data: featuredProjects.map((project, index) => ({
            editionId: edition.id,
            projectId: project.id,
            order: index + 1,
          })),
        });
        projectsAdded = featuredProjects.length;
      }
    }

    // Fetch the complete edition with counts
    const completeEdition = await db.edition.findUnique({
      where: { id: edition.id },
      include: {
        _count: {
          select: {
            articles: true,
            projects: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          ...completeEdition,
          articleCount: (completeEdition as any)?._count?.articles ?? 0,
          projectCount: (completeEdition as any)?._count?.projects ?? 0,
        },
        message: autoPopulate
          ? `Edition created with ${articlesAdded} articles and ${projectsAdded} projects`
          : "Edition created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating edition:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
