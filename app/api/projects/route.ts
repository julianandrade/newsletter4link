import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { createProject } from "@/lib/queries";
import { Prisma } from "@prisma/client";
import { parseSort } from "@/lib/list-sort";

export const dynamic = "force-dynamic";

/** Every column the projects table draws, and nothing that is not on screen. */
export const PROJECT_SORT_FIELDS = [
  "name",
  "team",
  "projectDate",
  "createdAt",
  "featured",
] as const;

/**
 * GET /api/projects
 * Get all projects with optional filters (tenant-scoped)
 *
 * Query params:
 * - teams=true: Return unique teams list instead of projects
 * - search: Search by name or description
 * - team: Filter by team
 * - featured: Filter by featured status ("true" or "false")
 * - dateFrom: Filter projects from this date
 * - dateTo: Filter projects until this date
 * - sortBy: Sort field (name, team, projectDate, createdAt, featured)
 * - sortOrder: Sort direction (asc, desc)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const searchParams = request.nextUrl.searchParams;

    // Handle teams list request
    if (searchParams.get("teams") === "true") {
      const projects = await db.project.findMany({
        select: { team: true },
      });

      // Get unique teams
      const teams = [...new Set(projects.map((p) => p.team))].sort();

      return NextResponse.json({
        success: true,
        data: teams,
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
        // The end of the named day, not its first instant. "Delivered to 8 August"
        // excluded everything shipped on 8 August.
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.projectDate.lte = end;
      }
    }

    const sort = parseSort(searchParams, PROJECT_SORT_FIELDS, {
      field: "createdAt",
      direction: "desc",
    });

    // `name` is the second key throughout: every other field has duplicates in a list this
    // size, so without it a team of six projects comes back in an arbitrary order that
    // changes between two identical requests.
    const orderBy: Prisma.ProjectOrderByWithRelationInput[] =
      sort.field === "name"
        ? [{ name: sort.direction }]
        : [{ [sort.field]: sort.direction }, { name: "asc" }];

    const projects = await db.project.findMany({
      where,
      orderBy,
    });

    return NextResponse.json({
      success: true,
      data: projects,
      count: projects.length,
      sort,
    });
  } catch (error) {
    console.error("Error fetching projects:", error);

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
 * POST /api/projects
 * Create a new project (tenant-scoped)
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

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

    const project = await createProject(db, {
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
