import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { builtInTemplate } from "@/lib/email/builtin-template";

export async function GET() {
  try {
    const { db } = await requireOrgContext();
    const templates = await db.emailTemplate.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        designJson: true,
        isActive: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    /**
     * RQ-003: the built-in edition leads the list.
     *
     * It is code rather than a stored row, so its flags are derived: it is the
     * active and preselected template precisely when no stored template holds
     * those flags. Listed first because it is the one a fresh organization uses.
     */
    const builtIn = builtInTemplate(
      templates.some((template) => template.isActive),
      templates.some((template) => template.isDefault)
    );

    return NextResponse.json([builtIn, ...templates]);
  } catch (error) {
    console.error("Error fetching templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { db } = await requireOrgContext();
    const body = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "name is required and must be a string" },
        { status: 400 }
      );
    }

    if (!body.html || typeof body.html !== "string") {
      return NextResponse.json(
        { error: "html is required and must be a string" },
        { status: 400 }
      );
    }

    const template = await db.emailTemplate.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim() || null,
        designJson: body.designJson || null,
        html: body.html,
        isActive: false,
      } as any,
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Error creating template:", error);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}
