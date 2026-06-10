import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { parseJsonBody, errorResponse } from "@/lib/validation";

const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(5000),
    team: z.string().trim().min(1).max(300),
    projectDate: z.coerce.date(),
    impact: z.string().trim().max(2000).nullable(),
    imageUrl: z.string().trim().url().max(2000).nullable(),
    featured: z.boolean(),
  })
  .partial();

/**
 * GET /api/projects/:id
 * Get single project by ID - tenant-scoped
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireOrgContext();

    // Tenant findUnique returns null for projects of other orgs
    const project = await db.project.findUnique({ where: { id } });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error("Error fetching project:", error);
    return errorResponse(error);
  }
}

/**
 * PATCH /api/projects/:id
 * Update a project - requires EDITOR role, tenant-scoped
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    const updateData = await parseJsonBody(request, updateProjectSchema);

    // updateMany is org-scoped, so projects from other orgs are not matched
    const { count } = await ctx.db.project.updateMany({
      where: { id },
      data: updateData,
    });

    if (count === 0) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const project = await ctx.db.project.findUnique({ where: { id } });

    return NextResponse.json({
      success: true,
      data: project,
      message: "Project updated successfully",
    });
  } catch (error) {
    console.error("Error updating project:", error);
    return errorResponse(error);
  }
}

/**
 * DELETE /api/projects/:id
 * Delete a project - requires EDITOR role, tenant-scoped
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    // findUnique is org-scoped (returns null cross-org); verify before deleting
    const project = await ctx.db.project.findUnique({ where: { id } });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    await ctx.db.project.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting project:", error);
    return errorResponse(error);
  }
}
