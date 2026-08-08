import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { config } from "@/lib/config";
import { structuredOutputTuning } from "@/lib/ai-models";
import { messageText, describeBlocks } from "@/lib/ai/message";
import { resolveAiModels, rethrowIfModelRejected } from "@/lib/ai/model";
import { buildSuggestPrompt, parseSuggestions, SUGGESTION_COUNT } from "@/lib/asides/suggest";
import { parseAsideCreate } from "@/lib/asides/input";

export const dynamic = "force-dynamic";

/**
 * POST /api/asides/suggest
 *
 * Ask the model for closing-slot candidates. EDITOR or above.
 *
 * Body: { editionId?: string, language?: string }
 *
 * Everything written here is PENDING and MODEL. Nothing reaches a send until a person
 * moves it to APPROVED, because `asidePickerQuery` only ever offers APPROVED rows. That is
 * CLAUDE.md LLM06, and it is the whole reason this endpoint is allowed to exist: model
 * humour about LLMs lands somewhere between flat and subtly wrong, and this goes out under
 * the company's name.
 *
 * A button rather than a cron job. A weekly internal newsletter does not need five
 * suggestions nobody asked for sitting in a queue every morning.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");
    const { db } = ctx;

    const body = await request.json().catch(() => ({}));
    const editionId = typeof body?.editionId === "string" ? body.editionId : null;
    const language = typeof body?.language === "string" ? body.language : "pt-PT";

    /**
     * The edition's topics, so the lines have something to be about. An edition with none,
     * or no edition at all, is fine: the prompt says so and asks for something general.
     */
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
      take: 10,
    });

    const prompt = buildSuggestPrompt({
      topics,
      samples: approved.map((row) => row.text),
      language,
    });

    const { model } = await resolveAiModels(ctx.organization.id);
    const anthropic = new Anthropic({ apiKey: config.ai.anthropic.apiKey });

    let reply: string;
    try {
      const message = await anthropic.messages.create({
        model,
        /**
         * Generous for five short lines, and thinking is disabled below.
         *
         * This repository has been bitten twice by the same thing: the 5-family models
         * think when the request does not say otherwise, max_tokens caps thinking and
         * reply together, and thinking scales to fill whatever it is given. Raising the
         * budget alone moved the wall rather than removing it.
         */
        max_tokens: 1500,
        ...structuredOutputTuning(model),
        messages: [{ role: "user", content: prompt }],
      });

      reply = messageText(message);

      if (reply.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: `The model returned no text (${describeBlocks(message)}).`,
          },
          { status: 502 }
        );
      }
    } catch (error) {
      rethrowIfModelRejected(error, model);
      throw error;
    }

    const lines = parseSuggestions(reply).slice(0, SUGGESTION_COUNT);

    if (lines.length === 0) {
      return NextResponse.json(
        { success: false, error: "The model produced nothing usable. Try again." },
        { status: 502 }
      );
    }

    /**
     * Each line goes through the same parser a person's writing does, so a suggestion
     * cannot enter the library in a shape the editor screen could not have produced.
     * Text only: a model cannot make an image.
     */
    const created = [];
    for (const text of lines) {
      const parsed = parseAsideCreate({ text, kind: "JOKE", language });
      if (!parsed.ok) continue;

      created.push(
        await db.aside.create({
          data: {
            ...parsed.value,
            status: "PENDING",
            source: "MODEL",
          } as never,
        })
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: `${created.length} candidates queued for approval. None of them can be sent until you approve it.`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error suggesting asides:", error);

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
