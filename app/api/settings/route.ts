import { NextResponse } from "next/server";
import { requireOrgContext, hasRole } from "@/lib/auth/context";
import { getOrgSettings, updateOrgSettings } from "@/lib/settings";
import { parseSettingsPatch } from "@/lib/settings-input";

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const settings = await getOrgSettings(ctx.db);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching settings:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireOrgContext();

    // Require at least ADMIN role to update settings
    if (!hasRole(ctx.membership.role, "ADMIN")) {
      return NextResponse.json(
        { error: "Forbidden: Requires ADMIN role to update settings" },
        { status: 403 }
      );
    }

    // Every field this may write, and every bound it is held to, lives in one pure module
    // so it can be tested without a session. The route decides the status code.
    const parsed = parseSettingsPatch(await request.json());

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const settings = await updateOrgSettings(ctx.db, parsed.updates);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error updating settings:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
