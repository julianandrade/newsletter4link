import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { MAX_ASIDE_TEXT } from "@/lib/asides/input";
import { renderMeme, MemeRenderError } from "@/lib/memes/render";
import { findTemplate, validateTemplate } from "@/lib/memes/templates";
import { uploadFile } from "@/lib/supabase/storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/memes/render
 *
 * Render a meme from a template and a caption per zone. EDITOR or above.
 *
 * Body: { templateId: string, captions: string[], store?: boolean }
 *
 * Without `store` the image comes back as a data URL and nothing is written anywhere. That
 * is the preview, and it is the reason this is one route rather than two: an editor trying
 * six wordings should not leave six abandoned files in the bucket, and a preview that
 * uploaded would do exactly that.
 *
 * With `store` the same bytes are uploaded and a MediaAsset row is written, and the caller
 * gets a URL it can hand to POST /api/asides. Rendering is deterministic, so what is stored
 * is what was previewed.
 *
 * Nothing here creates an Aside. Saving stays with the existing route, so everything in the
 * library arrives through the same validation whoever wrote it.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");
    const { db } = ctx;

    const body = await request.json().catch(() => ({}));

    const templateId = typeof body?.templateId === "string" ? body.templateId : null;
    if (!templateId) {
      return NextResponse.json(
        { success: false, error: "templateId is required." },
        { status: 400 }
      );
    }

    const template = findTemplate(templateId);
    if (!template) {
      return NextResponse.json(
        { success: false, error: `No meme template with id "${templateId}".` },
        { status: 400 }
      );
    }

    const problems = validateTemplate(template);
    if (problems.length) {
      return NextResponse.json(
        { success: false, error: `Template "${templateId}" is misconfigured: ${problems.join("; ")}` },
        { status: 500 }
      );
    }

    if (!Array.isArray(body?.captions)) {
      return NextResponse.json(
        { success: false, error: "captions must be an array of strings." },
        { status: 400 }
      );
    }

    const captions: string[] = body.captions.map((caption: unknown) =>
      typeof caption === "string" ? caption : ""
    );

    if (captions.length !== template.zones.length) {
      return NextResponse.json(
        {
          success: false,
          error: `"${templateId}" takes ${template.zones.length} captions, got ${captions.length}.`,
        },
        { status: 400 }
      );
    }

    /**
     * A hard ceiling, not the guidance.
     *
     * `MAX_MEME_CAPTION` is 120 and the editor screen counts against it, because past that
     * autofit shrinks the type until nobody reads it. That is advice, and a person who wants
     * a long line should get one. This is only here so an unbounded string cannot be typed
     * into a renderer.
     */
    const tooLong = captions.findIndex((caption) => caption.length > MAX_ASIDE_TEXT);
    if (tooLong !== -1) {
      return NextResponse.json(
        {
          success: false,
          error: `Caption ${tooLong + 1} is over ${MAX_ASIDE_TEXT} characters.`,
        },
        { status: 400 }
      );
    }

    const image = await renderMeme(template, captions);

    if (body?.store !== true) {
      return NextResponse.json({
        success: true,
        dataUrl: `data:image/jpeg;base64,${image.toString("base64")}`,
        bytes: image.byteLength,
      });
    }

    const filename = `meme-${template.id}.jpg`;
    const { url } = await uploadFile(image, filename, "image/jpeg");

    await db.mediaAsset.create({
      data: { filename, url, type: "image/jpeg", size: image.byteLength } as never,
    });

    return NextResponse.json({ success: true, url, bytes: image.byteLength });
  } catch (error) {
    // A caption count or a blank slot the checks above did not reach: the caller's problem,
    // not a fault here, so 400 rather than the 500 below.
    if (error instanceof MemeRenderError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    console.error("Error rendering meme:", error);

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
