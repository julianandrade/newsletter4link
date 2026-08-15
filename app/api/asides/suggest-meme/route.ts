import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { config } from "@/lib/config";
import { structuredOutputTuning } from "@/lib/ai-models";
import { messageText, describeBlocks } from "@/lib/ai/message";
import { resolveAiModels, withModelRejection } from "@/lib/ai/model";
import { modelRejectionResponse } from "@/lib/ai/model-http";
import { parseAsideCreate } from "@/lib/asides/input";
import { MAX_INSTRUCTION_CHARS } from "@/lib/rewrite/config";
import { buildMemePrompt, parseMemeReply } from "@/lib/memes/caption";
import { renderMeme } from "@/lib/memes/render";
import { MEME_TEMPLATES, findTemplate, type MemeTemplate } from "@/lib/memes/templates";
import { uploadFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Few enough to read in a minute, and each one costs a model call and a render. */
const DEFAULT_COUNT = 3;
const MAX_COUNT = 6;

/**
 * POST /api/asides/suggest-meme
 *
 * Ask the model for closing-slot memes. EDITOR or above.
 *
 * Body: { editionId?, templateId?, count?, language?, instruction? }
 *
 * `instruction` is one ask for this batch only, fenced below the rules in the prompt so it
 * cannot read as the newest word on them.
 *
 * The text half of this already existed at /api/asides/suggest. This one picks a format,
 * asks for a caption per slot, renders it with `sharp` and stores the result, so the whole
 * thing is ours end to end: no third-party generator, no watermark, no per-image cost, and
 * a renderer that cannot clip a caption because libvips fits text to its box.
 *
 * Everything written here is PENDING and MODEL, exactly as the text suggestions are.
 * `asidePickerQuery` only ever offers APPROVED rows, so nothing reaches a send until a
 * person moves it. That gate matters more here than for text: a weak line is skimmed past,
 * a bad picture is the loudest thing in the email.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");
    const { db } = ctx;

    if (MEME_TEMPLATES.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No meme templates are registered. Run scripts/fetch-meme-templates.ts.",
        },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const editionId = typeof body?.editionId === "string" ? body.editionId : null;
    const templateId = typeof body?.templateId === "string" ? body.templateId : null;
    const language = typeof body?.language === "string" ? body.language : "pt-PT";

    const requested = Number(body?.count);
    const count = Number.isInteger(requested)
      ? Math.min(Math.max(requested, 1), MAX_COUNT)
      : DEFAULT_COUNT;

    /**
     * One ask for this batch only: "about the migration", "shorter", "less about code".
     *
     * Validated rather than trimmed silently, the same handling POST /api/articles/:id/rewrite
     * gives its own instruction and for the same reason: this text goes into a prompt, so an
     * unbounded field is an unbounded prompt.
     *
     * Nowhere to store it, and that is a real difference from the rewrite, which keeps its
     * instruction on the row it produced so the history can say which ask wrote which
     * version. An Aside has no column for one and the schema is not changing here, so "why
     * was this batch about the migration" is a question the queue cannot answer.
     */
    let instruction: string | null = null;
    if (typeof body?.instruction === "string") {
      const trimmed = body.instruction.trim();
      if (trimmed.length > MAX_INSTRUCTION_CHARS) {
        return NextResponse.json(
          {
            success: false,
            error: `The instruction must be ${MAX_INSTRUCTION_CHARS} characters or less.`,
          },
          { status: 400 }
        );
      }
      instruction = trimmed.length > 0 ? trimmed : null;
    }

    /**
     * Which formats to use.
     *
     * Random rather than least-recently-used: linking an aside to the template it came from
     * needs a column, and the schema is not changing for this. If repeats become visible in
     * the queue, add `Aside.memeTemplate` and order on it.
     */
    let templates: MemeTemplate[];
    if (templateId) {
      const chosen = findTemplate(templateId);
      if (!chosen) {
        return NextResponse.json(
          { success: false, error: `No meme template with id "${templateId}".` },
          { status: 400 }
        );
      }
      templates = [chosen];
    } else {
      templates = [...MEME_TEMPLATES]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(count, MEME_TEMPLATES.length));
    }

    // The same gathering /api/asides/suggest does, so both kinds of suggestion are about
    // the same week and match the same register.
    let topics: string[] = [];
    if (editionId) {
      const edition = await db.edition.findFirst({
        where: { id: editionId },
        select: { id: true },
      });

      if (edition) {
        const rows = await db.article.findMany({
          where: { editions: { some: { editionId: edition.id } } },
          select: { category: true },
          take: 40,
        });
        topics = [...new Set(rows.flatMap((row) => row.category).filter(Boolean))].slice(0, 10);
      }
    }

    const approved = await db.aside.findMany({
      where: { status: "APPROVED", language },
      select: { text: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    const samples = approved.map((row) => row.text);

    const { model } = await resolveAiModels(ctx.organization.id);
    const anthropic = new Anthropic({ apiKey: config.ai.anthropic.apiKey });

    const created = [];
    const skipped: Array<{ template: string; reason: string }> = [];

    for (const template of templates) {
      const prompt = buildMemePrompt({ template, topics, samples, language, instruction });

      /**
       * One failed format does not fail the request, but a refused model does. The guard is
       * `withModelRejection`, and the throw below is deliberate: every remaining template
       * would fail the same way for the same reason, and answering 201 with an empty list
       * would report "nothing usable" for a problem whose fix is one field in Settings.
       */
      const message = await withModelRejection(model, () =>
        anthropic.messages.create({
          model,
          // A handful of short lines. Thinking is disabled below, for the reason recorded in
          // /api/asides/suggest: the 5-family models think unless told not to, and thinking
          // scales to fill whatever max_tokens allows.
          max_tokens: 800,
          ...structuredOutputTuning(model),
          messages: [{ role: "user", content: prompt }],
        })
      );

      const reply = messageText(message);
      if (reply.length === 0) {
        skipped.push({
          template: template.id,
          reason: `the model returned no text (${describeBlocks(message)})`,
        });
        continue;
      }

      const parsed = parseMemeReply(reply, template);
      if (!parsed.ok) {
        skipped.push({ template: template.id, reason: parsed.error });
        continue;
      }

      const image = await renderMeme(template, parsed.value.captions);
      const { url } = await uploadFile(image, `meme-${template.id}.jpg`, "image/jpeg");

      await db.mediaAsset.create({
        data: { filename: `meme-${template.id}.jpg`, url, type: "image/jpeg", size: image.byteLength } as never,
      });

      /**
       * The same parser a person's writing goes through, so a generated meme cannot enter
       * the library in a shape the editor screen could not have produced.
       */
      const aside = parseAsideCreate({
        text: parsed.value.alt,
        kind: "JOKE",
        language,
        imageUrl: url,
      });

      if (!aside.ok) {
        skipped.push({ template: template.id, reason: aside.error });
        continue;
      }

      created.push(
        await db.aside.create({
          data: { ...aside.value, status: "PENDING", source: "MODEL" } as never,
        })
      );
    }

    if (created.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "The model produced nothing usable. Try again.",
          skipped,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: created,
        skipped,
        message: `${created.length} ${created.length === 1 ? "meme" : "memes"} queued for approval. None of them can be sent until you approve it.`,
      },
      { status: 201 }
    );
  } catch (error) {
    const refused = modelRejectionResponse(error);
    if (refused) return refused;

    console.error("Error suggesting memes:", error);

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
