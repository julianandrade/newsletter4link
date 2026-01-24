import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { EditionStatus } from "@prisma/client";

/**
 * GET /api/editions/:id
 * Get edition details with full article and project data
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const edition = await prisma.edition.findUnique({
      where: { id },
      include: {
        articles: {
          include: {
            article: {
              select: {
                id: true,
                title: true,
                sourceUrl: true,
                author: true,
                publishedAt: true,
                relevanceScore: true,
                summary: true,
                category: true,
                status: true,
              },
            },
          },
          orderBy: { order: "asc" },
        },
        projects: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                description: true,
                team: true,
                projectDate: true,
                impact: true,
                imageUrl: true,
                featured: true,
              },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!edition) {
      return NextResponse.json(
        {
          success: false,
          error: "Edition not found",
        },
        { status: 404 }
      );
    }

    // Transform to flatten the nested structure
    const transformedEdition = {
      id: edition.id,
      week: edition.week,
      year: edition.year,
      status: edition.status,
      finalizedAt: edition.finalizedAt,
      sentAt: edition.sentAt,
      createdAt: edition.createdAt,
      updatedAt: edition.updatedAt,
      articles: edition.articles.map((ea) => ({
        ...ea.article,
        order: ea.order,
      })),
      projects: edition.projects.map((ep) => ({
        ...ep.project,
        order: ep.order,
      })),
      articleCount: edition.articles.length,
      projectCount: edition.projects.length,
    };

    return NextResponse.json({
      success: true,
      data: transformedEdition,
    });
  } catch (error) {
    console.error("Error fetching edition:", error);

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
 * PATCH /api/editions/:id
 * Update edition (status, articles, projects)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, articles, projects } = body;

    // Check if edition exists
    const existingEdition = await prisma.edition.findUnique({
      where: { id },
    });

    if (!existingEdition) {
      return NextResponse.json(
        {
          success: false,
          error: "Edition not found",
        },
        { status: 404 }
      );
    }

    // Prevent modification of SENT editions
    if (existingEdition.status === "SENT") {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot modify a sent edition",
        },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: {
      status?: EditionStatus;
      finalizedAt?: Date | null;
      sentAt?: Date | null;
    } = {};

    // Handle status updates
    if (status !== undefined) {
      if (!["DRAFT", "FINALIZED", "SENT"].includes(status)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid status. Must be DRAFT, FINALIZED, or SENT",
          },
          { status: 400 }
        );
      }

      updateData.status = status as EditionStatus;

      // Set timestamps based on status transition
      // Note: existingEdition.status is guaranteed to be DRAFT or FINALIZED here
      // (we return early above if it's SENT)
      if (status === "FINALIZED" && existingEdition.status === "DRAFT") {
        updateData.finalizedAt = new Date();
      } else if (status === "SENT") {
        // Transitioning to SENT from DRAFT or FINALIZED
        updateData.sentAt = new Date();
        if (!existingEdition.finalizedAt) {
          updateData.finalizedAt = new Date();
        }
      } else if (status === "DRAFT") {
        // Reverting to DRAFT from FINALIZED (SENT case already handled above)
        updateData.finalizedAt = null;
      }
    }

    // Use transaction to handle all updates atomically
    const updatedEdition = await prisma.$transaction(async (tx) => {
      // Update edition basic data
      if (Object.keys(updateData).length > 0) {
        await tx.edition.update({
          where: { id },
          data: updateData,
        });
      }

      // Update articles if provided
      if (articles !== undefined) {
        // Validate articles array
        if (!Array.isArray(articles)) {
          throw new Error("Articles must be an array");
        }

        // Remove all existing article associations
        await tx.editionArticle.deleteMany({
          where: { editionId: id },
        });

        // Add new article associations
        if (articles.length > 0) {
          // Validate all article IDs exist
          const articleIds = articles.map((a: { articleId: string }) => a.articleId);
          const existingArticles = await tx.article.findMany({
            where: { id: { in: articleIds } },
            select: { id: true },
          });

          const existingArticleIds = new Set(existingArticles.map((a) => a.id));
          const missingArticles = articleIds.filter((id: string) => !existingArticleIds.has(id));

          if (missingArticles.length > 0) {
            throw new Error(`Articles not found: ${missingArticles.join(", ")}`);
          }

          await tx.editionArticle.createMany({
            data: articles.map((a: { articleId: string; order: number }, index: number) => ({
              editionId: id,
              articleId: a.articleId,
              order: a.order ?? index + 1,
            })),
          });
        }
      }

      // Update projects if provided
      if (projects !== undefined) {
        // Validate projects array
        if (!Array.isArray(projects)) {
          throw new Error("Projects must be an array");
        }

        // Remove all existing project associations
        await tx.editionProject.deleteMany({
          where: { editionId: id },
        });

        // Add new project associations
        if (projects.length > 0) {
          // Validate all project IDs exist
          const projectIds = projects.map((p: { projectId: string }) => p.projectId);
          const existingProjects = await tx.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true },
          });

          const existingProjectIds = new Set(existingProjects.map((p) => p.id));
          const missingProjects = projectIds.filter((id: string) => !existingProjectIds.has(id));

          if (missingProjects.length > 0) {
            throw new Error(`Projects not found: ${missingProjects.join(", ")}`);
          }

          await tx.editionProject.createMany({
            data: projects.map((p: { projectId: string; order: number }, index: number) => ({
              editionId: id,
              projectId: p.projectId,
              order: p.order ?? index + 1,
            })),
          });
        }
      }

      // Return updated edition with all data
      return tx.edition.findUnique({
        where: { id },
        include: {
          articles: {
            include: {
              article: {
                select: {
                  id: true,
                  title: true,
                  sourceUrl: true,
                  author: true,
                  publishedAt: true,
                  relevanceScore: true,
                  summary: true,
                  category: true,
                  status: true,
                },
              },
            },
            orderBy: { order: "asc" },
          },
          projects: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  team: true,
                  projectDate: true,
                  impact: true,
                  imageUrl: true,
                  featured: true,
                },
              },
            },
            orderBy: { order: "asc" },
          },
        },
      });
    });

    if (!updatedEdition) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update edition",
        },
        { status: 500 }
      );
    }

    // Transform response
    const transformedEdition = {
      id: updatedEdition.id,
      week: updatedEdition.week,
      year: updatedEdition.year,
      status: updatedEdition.status,
      finalizedAt: updatedEdition.finalizedAt,
      sentAt: updatedEdition.sentAt,
      createdAt: updatedEdition.createdAt,
      updatedAt: updatedEdition.updatedAt,
      articles: updatedEdition.articles.map((ea) => ({
        ...ea.article,
        order: ea.order,
      })),
      projects: updatedEdition.projects.map((ep) => ({
        ...ep.project,
        order: ep.order,
      })),
      articleCount: updatedEdition.articles.length,
      projectCount: updatedEdition.projects.length,
    };

    return NextResponse.json({
      success: true,
      data: transformedEdition,
      message: "Edition updated successfully",
    });
  } catch (error) {
    console.error("Error updating edition:", error);

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
 * DELETE /api/editions/:id
 * Delete edition (only if DRAFT status)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if edition exists and its status
    const edition = await prisma.edition.findUnique({
      where: { id },
    });

    if (!edition) {
      return NextResponse.json(
        {
          success: false,
          error: "Edition not found",
        },
        { status: 404 }
      );
    }

    // Only allow deletion of DRAFT editions
    if (edition.status !== "DRAFT") {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete a ${edition.status.toLowerCase()} edition. Only draft editions can be deleted.`,
        },
        { status: 400 }
      );
    }

    // Delete the edition (cascade will handle EditionArticle and EditionProject)
    await prisma.edition.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Edition deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting edition:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
