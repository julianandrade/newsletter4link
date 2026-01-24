import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const sources = await prisma.rSSSource.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(sources);
  } catch (error) {
    console.error("Error fetching RSS sources:", error);
    return NextResponse.json(
      { error: "Failed to fetch RSS sources" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "name is required and must be a string" },
        { status: 400 }
      );
    }

    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json(
        { error: "url is required and must be a string" },
        { status: 400 }
      );
    }

    if (!body.category || typeof body.category !== "string") {
      return NextResponse.json(
        { error: "category is required and must be a string" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(body.url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Check for duplicate URL
    const existing = await prisma.rSSSource.findUnique({
      where: { url: body.url },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An RSS source with this URL already exists" },
        { status: 409 }
      );
    }

    const source = await prisma.rSSSource.create({
      data: {
        name: body.name.trim(),
        url: body.url.trim(),
        category: body.category.trim(),
        active: body.active !== false,
      },
    });

    return NextResponse.json(source, { status: 201 });
  } catch (error) {
    console.error("Error creating RSS source:", error);
    return NextResponse.json(
      { error: "Failed to create RSS source" },
      { status: 500 }
    );
  }
}
