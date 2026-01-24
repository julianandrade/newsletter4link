import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createProject } from "@/lib/queries";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects
 * Get all projects with optional filters
 *
 * Query params:
 * - teams=true: Return unique teams list instead of projects
 * - search: Search by name or description
 * - team: Filter by team
 * - featured: Filter by featured status ("true" or "false")
 * - dateFrom: Filter projects from this date
 * - dateTo: Filter projects until this date
 * - sortBy: Sort field (name, team, projectDate, createdAt)
 * - sortOrder: Sort direction (asc, desc)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Handle teams list request
    if (searchParams.get("teams") === "true") {
      const teams = await prisma.project.findMany({
        select: { team: true },
        distinct: ["team"],
        orderBy: { team: "asc" },
      });

      return NextResponse.json({
        success: true,
        data: teams.map((t) => t.team),
      });
    }

    // Build filter conditions
    const where: Prisma.ProjectWhereInput = {};

    const search = searchParams.get("search");
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { team: { contains: search, mode: "insensitive" } },
      ];
    }

    const team = searchParams.get("team");
    if (team) {
      where.team = team;
    }

    const featured = searchParams.get("featured");
    if (featured === "true") {
      where.featured = true;
    } else if (featured === "false") {
      where.featured = false;
    }

    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      where.projectDate = {};
      if (dateFrom) {
        where.projectDate.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.projectDate.lte = new Date(dateTo);
      }
    }

    // Build sort options
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const validSortFields = ["name", "team", "projectDate", "createdAt"];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const orderByDirection = sortOrder === "asc" ? "asc" : "desc";

    const orderBy: Prisma.ProjectOrderByWithRelationInput = {
      [orderByField]: orderByDirection,
    };

    const projects = await prisma.project.findMany({
      where,
      orderBy,
    });

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
