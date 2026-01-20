import { NextResponse } from "next/server";
import { updateProject, deleteProject } from "@/lib/queries";
import { prisma } from "@/lib/db";

/**
 * GET /api/projects/:id
 * Get single project by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
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
    console.error("Error fetching project:", error);

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
 * PATCH /api/projects/:id
 * Update a project
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, team, projectDate, impact, imageUrl, featured } =
      body;

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
    console.error("Error updating project:", error);

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
 * DELETE /api/projects/:id
 * Delete a project
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await deleteProject(id);

    return NextResponse.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting project:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
