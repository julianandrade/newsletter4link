import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseOPML, fetchOPML } from "@/lib/opml/parser";

interface ImportRequest {
  opmlContent?: string;
  opmlUrl?: string;
  category?: string;
  activeByDefault?: boolean;
  skipDuplicates?: boolean;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ name: string; url: string; error: string }>;
  feeds: Array<{
    id: string;
    name: string;
    url: string;
    category: string;
    active: boolean;
  }>;
}

export async function POST(request: Request) {
  try {
    const body: ImportRequest = await request.json();

    // Validate that we have either content or URL
    if (!body.opmlContent && !body.opmlUrl) {
      return NextResponse.json(
        { error: "Either opmlContent or opmlUrl is required" },
        { status: 400 }
      );
    }

    // Get OPML content
    let opmlContent: string;
    if (body.opmlContent) {
      opmlContent = body.opmlContent;
    } else {
      try {
        new URL(body.opmlUrl!);
      } catch {
        return NextResponse.json(
          { error: "Invalid opmlUrl format" },
          { status: 400 }
        );
      }

      try {
        opmlContent = await fetchOPML(body.opmlUrl!);
      } catch (error) {
        return NextResponse.json(
          {
            error: `Failed to fetch OPML: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
          { status: 400 }
        );
      }
    }

    // Parse OPML content
    const parseResult = parseOPML(opmlContent);

    if (parseResult.feeds.length === 0) {
      return NextResponse.json(
        {
          error: "No valid feeds found in OPML",
          parseErrors: parseResult.errors,
        },
        { status: 400 }
      );
    }

    // Get existing URLs if we need to skip duplicates
    const skipDuplicates = body.skipDuplicates !== false; // Default to true
    let existingUrls = new Set<string>();

    if (skipDuplicates) {
      const existingSources = await prisma.rSSSource.findMany({
        select: { url: true },
      });
      existingUrls = new Set(existingSources.map((s) => s.url.toLowerCase()));
    }

    // Import feeds
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
      feeds: [],
    };

    const defaultCategory = body.category || "Imported";
    const activeByDefault = body.activeByDefault === true; // Default to false

    for (const feed of parseResult.feeds) {
      // Check for duplicate
      if (skipDuplicates && existingUrls.has(feed.url.toLowerCase())) {
        result.skipped++;
        continue;
      }

      try {
        const source = await prisma.rSSSource.create({
          data: {
            name: feed.name,
            url: feed.url,
            category: feed.category || defaultCategory,
            active: activeByDefault,
          },
        });

        result.imported++;
        result.feeds.push({
          id: source.id,
          name: source.name,
          url: source.url,
          category: source.category,
          active: source.active,
        });

        // Add to existing URLs set to prevent duplicates within the same import
        existingUrls.add(feed.url.toLowerCase());
      } catch (error) {
        // Handle unique constraint violation (duplicate URL)
        if (
          error instanceof Error &&
          error.message.includes("Unique constraint")
        ) {
          result.skipped++;
        } else {
          result.errors.push({
            name: feed.name,
            url: feed.url,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }

    // Include parse errors in response if any
    if (parseResult.errors.length > 0) {
      result.errors.push(
        ...parseResult.errors.map((e) => ({
          name: "Parse Error",
          url: "",
          error: e,
        }))
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error importing OPML:", error);
    return NextResponse.json(
      { error: "Failed to import OPML" },
      { status: 500 }
    );
  }
}
