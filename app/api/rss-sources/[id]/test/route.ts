import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import Parser from "rss-parser";

// Create parser instance for RSS/Atom feed validation
const parser = new Parser({
  timeout: 10000, // 10 second timeout
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["description", "description"],
    ],
  },
});

interface TestResult {
  success: boolean;
  itemCount?: number;
  feedTitle?: string;
  feedDescription?: string;
  error?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<TestResult>> {
  try {
    const { id } = await params;

    // Fetch RSS source from database
    const source = await prisma.rSSSource.findUnique({
      where: { id },
    });

    if (!source) {
      return NextResponse.json(
        { success: false, error: "RSS source not found" },
        { status: 404 }
      );
    }

    // Validate URL format
    try {
      new URL(source.url);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid URL format in RSS source" },
        { status: 400 }
      );
    }

    // Fetch and parse the RSS feed
    try {
      const feed = await parser.parseURL(source.url);

      // Return success with feed info
      return NextResponse.json({
        success: true,
        itemCount: feed.items?.length ?? 0,
        feedTitle: feed.title || source.name,
        feedDescription: feed.description || undefined,
      });
    } catch (parseError) {
      // Handle specific parse errors
      const errorMessage = parseError instanceof Error
        ? parseError.message
        : "Unknown parsing error";

      // Provide more user-friendly error messages
      let friendlyError = errorMessage;

      if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("getaddrinfo")) {
        friendlyError = "Could not resolve hostname. Check if the URL is correct.";
      } else if (errorMessage.includes("ETIMEDOUT") || errorMessage.includes("timeout")) {
        friendlyError = "Connection timed out. The server may be slow or unavailable.";
      } else if (errorMessage.includes("ECONNREFUSED")) {
        friendlyError = "Connection refused. The server may be down.";
      } else if (errorMessage.includes("404")) {
        friendlyError = "Feed not found (404). Check if the URL is correct.";
      } else if (errorMessage.includes("403")) {
        friendlyError = "Access forbidden (403). The feed may require authentication.";
      } else if (errorMessage.includes("Non-whitespace before first tag") ||
                 errorMessage.includes("Invalid XML")) {
        friendlyError = "Invalid feed format. The URL does not return a valid RSS/Atom feed.";
      } else if (errorMessage.includes("certificate")) {
        friendlyError = "SSL certificate error. The server's certificate may be invalid.";
      }

      return NextResponse.json(
        { success: false, error: friendlyError },
        { status: 422 }
      );
    }
  } catch (error) {
    console.error("Error testing RSS source:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to test RSS source"
      },
      { status: 500 }
    );
  }
}
