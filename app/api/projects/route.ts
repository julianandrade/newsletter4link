import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { createProject } from "@/lib/queries";
import { parseJsonBody, errorResponse } from "@/lib/validation";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(5000),
  team: z.string().trim().min(1).max(300),
  projectDate: z.coerce.date(),
  impact: z.string().trim().max(2000).optional(),
  imageUrl: z.string().trim().url().max(2000).optional(),
});

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
 * - sortBy: Sort field (name, team, projectDate, createdAt)
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

    const projects = await db.project.findMany({
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
    return errorResponse(error);
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
    requireRole(ctx, "EDITOR");

    const { name, description, team, projectDate, impact, imageUrl } =
      await parseJsonBody(request, createProjectSchema);

    const project = await createProject(db, {
      name,
      description,
      team,
      projectDate,
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
    return errorResponse(error);
  }
}
