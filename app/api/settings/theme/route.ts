import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const orgSettings = await ctx.db.orgSettings.findUnique();
    const membership = await prisma.orgUser.findUnique({
      where: {
        supabaseUserId_organizationId: {
          supabaseUserId: ctx.membership.supabaseUserId,
          organizationId: ctx.organization.id,
        },
      },
    });

    return NextResponse.json({
      orgTheme: orgSettings?.theme ?? "linkroad-dark",
      userTheme: membership?.theme ?? null,
      role: ctx.membership.role,
    });
  } catch (error) {
    console.error("Error fetching theme settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch theme settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const body = await request.json();
    const { scope, theme } = body as { scope?: "org" | "user"; theme?: string | null };

    if (!scope || (scope !== "org" && scope !== "user")) {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }

    if (scope === "org") {
      requireRole(ctx, "ADMIN");
      const settings = await ctx.db.orgSettings.upsert({
        update: { theme: theme ?? null },
      });
      return NextResponse.json({ orgTheme: settings.theme ?? "linkroad-dark" });
    }

    const membership = await prisma.orgUser.update({
      where: {
        supabaseUserId_organizationId: {
          supabaseUserId: ctx.membership.supabaseUserId,
          organizationId: ctx.organization.id,
        },
      },
      data: { theme: theme ?? null },
    });

    return NextResponse.json({ userTheme: membership.theme ?? null });
  } catch (error) {
    console.error("Error updating theme settings:", error);
    return NextResponse.json(
      { error: "Failed to update theme settings" },
      { status: 500 }
    );
  }
}
