import { NextResponse } from "next/server";
import { getAllProjects, createProject } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects
 * Get all projects
 */
export async function GET() {
  try {
    const projects = await getAllProjects();

    return NextResponse.json({
      success: true,
      data: projects,
      count: projects.length,
    });
  } catch (error) {
    console.error("Error fetching projects:", error);

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
 * POST /api/projects
 * Create a new project
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, team, projectDate, impact, imageUrl } = body;

    // Validation
    if (!name || !description || !team || !projectDate) {
      return NextResponse.json(
        {
          success: false,
          error: "Name, description, team, and projectDate are required",
        },
        { status: 400 }
      );
    }

    const project = await createProject({
      name,
      description,
      team,
      projectDate: new Date(projectDate),
      impact,
      imageUrl,
    });

    return NextResponse.json(
      {
        success: true,
        data: project,
        message: "Project created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating project:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
