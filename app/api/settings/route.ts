import { NextResponse } from "next/server";
import { requireOrgContext, hasRole } from "@/lib/auth/context";
import { getOrgSettings, updateOrgSettings } from "@/lib/settings";

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

    if (typeof body.brandVoicePrompt === "string" || body.brandVoicePrompt === null) {
      // Validate max length (500 characters)
      if (body.brandVoicePrompt && body.brandVoicePrompt.length > 500) {
        return NextResponse.json(
          { error: "brandVoicePrompt must be 500 characters or less" },
          { status: 400 }
        );
      }
      updates.brandVoicePrompt = body.brandVoicePrompt || null;
    }

    // Branding fields
    if (typeof body.logoUrl === "string" || body.logoUrl === null) {
      updates.logoUrl = body.logoUrl;
    }

    if (typeof body.bannerUrl === "string" || body.bannerUrl === null) {
      updates.bannerUrl = body.bannerUrl;
    }

    if (typeof body.primaryColor === "string" || body.primaryColor === null) {
      updates.primaryColor = body.primaryColor;
    }

    if (typeof body.fromName === "string" || body.fromName === null) {
      updates.fromName = body.fromName;
    }

    if (typeof body.replyToEmail === "string" || body.replyToEmail === null) {
      updates.replyToEmail = body.replyToEmail;
    }

    const settings = await updateOrgSettings(ctx.db, updates);
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
