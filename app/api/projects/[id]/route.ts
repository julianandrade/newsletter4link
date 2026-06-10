import { NextResponse } from "next/server";
import { updateProject, deleteProject } from "@/lib/queries";
import { requireOrgContext } from "@/lib/auth/context";
import { logger } from "@/lib/logger";

function authErrorResponse(error: unknown) {
  if (error instanceof Error && error.message.startsWith("Unauthorized")) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 401 }
    );
  }
  return null;
}

/**
 * GET /api/projects/:id
 * Get single project by ID (tenant-scoped)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireOrgContext();

    const project = await db.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json(
        {
          success: false,
          error: "Project not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: project,
    });
  } catch (error) {
    logger.error("Error fetching project", error);

    return (
      authErrorResponse(error) ??
      NextResponse.json(
        {
          success: false,
          error: "Internal server error",
        },
        { status: 500 }
      )
    );
  }
}

/**
 * PATCH /api/projects/:id
 * Update a project (tenant-scoped)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireOrgContext();
    const body = await request.json();
    const { name, description, team, projectDate, impact, imageUrl, featured } =
      body;

    // Ownership check: findUnique returns null if the project isn't in this org.
    const existing = await db.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (team !== undefined) updateData.team = team;
    if (projectDate !== undefined)
      updateData.projectDate = new Date(projectDate);
    if (impact !== undefined) updateData.impact = impact;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (featured !== undefined) updateData.featured = featured;

    const project = await updateProject(id, updateData);

    return NextResponse.json({
      success: true,
      data: project,
      message: "Project updated successfully",
    });
  } catch (error) {
    logger.error("Error updating project", error);

    return (
      authErrorResponse(error) ??
      NextResponse.json(
        {
          success: false,
          error: "Internal server error",
        },
        { status: 500 }
      )
    );
  }
}

/**
 * DELETE /api/projects/:id
 * Delete a project (tenant-scoped)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireOrgContext();

    // Ownership check before deleting cross-org rows.
    const existing = await db.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    await deleteProject(id);

    return NextResponse.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting project", error);

    return (
      authErrorResponse(error) ??
      NextResponse.json(
        {
          success: false,
          error: "Internal server error",
        },
        { status: 500 }
      )
    );
  }
}
