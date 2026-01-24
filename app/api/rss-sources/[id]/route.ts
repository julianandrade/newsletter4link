import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const source = await prisma.rSSSource.findUnique({
      where: { id },
    });

    if (!source) {
      return NextResponse.json(
        { error: "RSS source not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(source);
  } catch (error) {
    console.error("Error fetching RSS source:", error);
    return NextResponse.json(
      { error: "Failed to fetch RSS source" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Check if source exists
    const existing = await prisma.rSSSource.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "RSS source not found" },
        { status: 404 }
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      updates.name = body.name.trim();
    }

    if (typeof body.url === "string") {
      // Validate URL format
      try {
        new URL(body.url);
      } catch {
        return NextResponse.json(
          { error: "Invalid URL format" },
          { status: 400 }
        );
      }

      // Check for duplicate URL (excluding current source)
      const duplicateUrl = await prisma.rSSSource.findFirst({
        where: {
          url: body.url,
          NOT: { id },
        },
      });

      if (duplicateUrl) {
        return NextResponse.json(
          { error: "An RSS source with this URL already exists" },
          { status: 409 }
        );
      }

      updates.url = body.url.trim();
    }

    if (typeof body.category === "string") {
      updates.category = body.category.trim();
    }

    if (typeof body.active === "boolean") {
      updates.active = body.active;
    }

    const source = await prisma.rSSSource.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json(source);
  } catch (error) {
    console.error("Error updating RSS source:", error);
    return NextResponse.json(
      { error: "Failed to update RSS source" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if source exists
    const existing = await prisma.rSSSource.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "RSS source not found" },
        { status: 404 }
      );
    }

    await prisma.rSSSource.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting RSS source:", error);
    return NextResponse.json(
      { error: "Failed to delete RSS source" },
      { status: 500 }
    );
  }
}
