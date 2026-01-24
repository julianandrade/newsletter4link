import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/settings";

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    // Validate input
    const updates: Record<string, unknown> = {};

    if (typeof body.relevanceThreshold === "number") {
      if (body.relevanceThreshold < 0 || body.relevanceThreshold > 10) {
        return NextResponse.json(
          { error: "relevanceThreshold must be between 0 and 10" },
          { status: 400 }
        );
      }
      updates.relevanceThreshold = body.relevanceThreshold;
    }

    if (typeof body.maxArticlesPerEdition === "number") {
      if (body.maxArticlesPerEdition < 1 || body.maxArticlesPerEdition > 100) {
        return NextResponse.json(
          { error: "maxArticlesPerEdition must be between 1 and 100" },
          { status: 400 }
        );
      }
      updates.maxArticlesPerEdition = body.maxArticlesPerEdition;
    }

    if (typeof body.vectorSimilarityThreshold === "number") {
      if (body.vectorSimilarityThreshold < 0 || body.vectorSimilarityThreshold > 1) {
        return NextResponse.json(
          { error: "vectorSimilarityThreshold must be between 0 and 1" },
          { status: 400 }
        );
      }
      updates.vectorSimilarityThreshold = body.vectorSimilarityThreshold;
    }

    if (typeof body.articleMaxAgeDays === "number") {
      if (body.articleMaxAgeDays < 1 || body.articleMaxAgeDays > 365) {
        return NextResponse.json(
          { error: "articleMaxAgeDays must be between 1 and 365" },
          { status: 400 }
        );
      }
      updates.articleMaxAgeDays = body.articleMaxAgeDays;
    }

    if (typeof body.aiModel === "string") {
      updates.aiModel = body.aiModel;
    }

    if (typeof body.embeddingModel === "string") {
      updates.embeddingModel = body.embeddingModel;
    }

    const settings = await updateSettings(updates);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
