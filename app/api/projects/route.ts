import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { createProject } from "@/lib/queries";
import { pageArgs } from "@/lib/list-page";
import { projectListArgs, PROJECT_SORT_FIELDS } from "@/lib/projects/list-query";

export const dynamic = "force-dynamic";

/** Every column the projects table draws, and nothing that is not on screen. */
/** Re-exported: the list lives beside the query it orders, in lib/projects/list-query.ts. */
export { PROJECT_SORT_FIELDS };

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

    const { where, orderBy, sort, page, idsOnly } = projectListArgs(searchParams);

    /** Every matching id, through the same filter and order the list uses. */
    if (idsOnly) {
      const rows = await db.project.findMany({ where, orderBy, select: { id: true } });
      return NextResponse.json({
        success: true,
        ids: rows.map((row) => row.id),
        total: rows.length,
      });
    }

    const [projects, total] = await Promise.all([
      db.project.findMany({
        where,
        orderBy,
        // Unpaged unless a page was asked for, matching /api/subscribers. An absent
        // parameter means the whole list on both, so no caller has to remember which.
        ...(page.paged ? pageArgs(page.page, page.pageSize) : {}),
      }),
      page.paged ? db.project.count({ where }) : Promise.resolve(0),
    ]);

    return NextResponse.json({
      success: true,
      data: projects,
      count: projects.length,
      sort,
      // Present only for a paged request, so an unpaged response keeps its old shape.
      ...(page.paged
        ? { total, page: page.page, pageSize: page.pageSize }
        : {}),
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
