import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { isBuiltInTemplateId } from "@/lib/email/builtin-template";

/**
 * POST /api/templates/[id]/set-default
 *
 * Sets which template the edition builder preselects. At most one stored
 * template holds the flag; when none does, the builder preselects the built-in
 * edition, so setting the built-in as default means clearing the flag.
 *
 * RQ-003 fixed the same two problems as the activate route: nothing read this
 * flag, so "Preselected" was decorative, and the query clearing it from "all
 * others" was not scoped to the organization.
 *
 * Body: { default?: boolean } - omitted toggles the current state
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requireOrgContext();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    if (isBuiltInTemplateId(id)) {
      const isDefault = body.default !== undefined ? Boolean(body.default) : true;
      if (!isDefault) {
        return NextResponse.json(
          {
            error:
              "The built-in edition cannot be unset. Choose a stored template to preselect instead.",
          },
          { status: 400 }
        );
      }

      await db.emailTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });

      return NextResponse.json({
        success: true,
        default: true,
        message: "New editions now open on the built-in edition",
      });
    }

    const template = await db.emailTemplate.findUnique({ where: { id } });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const newDefaultState =
      body.default !== undefined ? Boolean(body.default) : !template.isDefault;

    if (newDefaultState) {
      // At most one default at a time, within this organization only.
      await db.emailTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
      await db.emailTemplate.update({
        where: { id },
        data: { isDefault: true },
      });
    } else {
      await db.emailTemplate.update({
        where: { id },
        data: { isDefault: false },
      });
    }

    return NextResponse.json({
      success: true,
      default: newDefaultState,
      message: newDefaultState
        ? `New editions now open on "${template.name}"`
        : "New editions now open on the built-in edition",
    });
  } catch (error) {
    console.error("Error setting the default template:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to change which template is preselected" },
      { status: 500 }
    );
  }
}
