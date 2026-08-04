import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { isBuiltInTemplateId } from "@/lib/email/builtin-template";

/**
 * POST /api/templates/[id]/activate
 *
 * Sets which template a send uses when it names none. At most one stored
 * template holds the flag; when none does, the built-in edition is used, so
 * activating the built-in means clearing the flag from every stored template.
 *
 * RQ-003 fixed two things here. The flag was written and never read, so the
 * screen said "In use" about something that was not in use. And the query that
 * cleared the flag from "all others" had no organization filter, so activating a
 * template in one organization cleared it in every other one.
 *
 * Body: { active?: boolean } - omitted toggles the current state
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requireOrgContext();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    // The built-in has no row: activating it is the absence of an active row.
    if (isBuiltInTemplateId(id)) {
      const active = body.active !== undefined ? Boolean(body.active) : true;
      if (!active) {
        return NextResponse.json(
          {
            error:
              "The built-in edition cannot be switched off. Activate a stored template instead.",
          },
          { status: 400 }
        );
      }

      await db.emailTemplate.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      return NextResponse.json({
        success: true,
        active: true,
        message: "Sends without a named template now use the built-in edition",
      });
    }

    const template = await db.emailTemplate.findUnique({ where: { id } });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const newActiveState =
      body.active !== undefined ? Boolean(body.active) : !template.isActive;

    if (newActiveState) {
      // At most one active at a time, within this organization only.
      await db.emailTemplate.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      await db.emailTemplate.update({
        where: { id },
        data: { isActive: true },
      });
    } else {
      await db.emailTemplate.update({
        where: { id },
        data: { isActive: false },
      });
    }

    return NextResponse.json({
      success: true,
      active: newActiveState,
      message: newActiveState
        ? `Sends without a named template now use "${template.name}"`
        : "Sends without a named template now use the built-in edition",
    });
  } catch (error) {
    console.error("Error activating template:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to change which template is used" },
      { status: 500 }
    );
  }
}
