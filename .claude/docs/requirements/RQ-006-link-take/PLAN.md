# Phase 5, Personalized Article Rewrite ("Link Take")

> As submitted, 4 August 2026. Kept verbatim except that long dashes were
> replaced per the writing convention. My findings are in
> [PLAN-REVIEW.md](PLAN-REVIEW.md); read them before refining this, because three
> of them change the design rather than adding to it.

Addendum to `trend-radar-implementation-plan.md`. Independent of Phases 2 to 4;
depends only on the existing curation pipeline. Can be built in parallel.

## Requirement

For each curated article, the platform produces its own short editorial piece, an
original rewrite in the organization's voice, personalized to what the news means
for Link/Linkroad, shown in the article detail view and usable in the newsletter.
The original source URL and publication name are always displayed prominently.
This is a transformation, not a reproduction: the output must be substantially
shorter than the source, structured differently, and add an angle the source does
not have.

## Hard rules (copyright and trust, do not relax)

1. Output length: 150 to 250 words body, hard cap 300. Never approach the length
   of the source.
2. Structure must differ from the source: own headline, one-paragraph lede with
   the key facts, then a "Relevância para a Link" section (2 to 4 sentences). No
   section-by-section mirroring of the original.
3. Facts only from the source text. No invented numbers, dates, quotes, or names.
   If the source text is thin (excerpt-only), the rewrite says less, not more.
4. No verbatim sentences from the source. No quotes longer than 15 words; prefer
   zero quotes.
5. Source attribution block always rendered: publication name plus original URL,
   visually prominent, both in the portal detail view and in any newsletter usage.
6. Never reproduce or hotlink images from the source.
7. UI label on the piece: "Análise gerada por AI a partir da fonte original" (or
   org-language equivalent).

## Data model

```prisma
model ArticleRewrite {
  id          String        @id @default(cuid())
  article     Article       @relation(fields: [articleId], references: [id], onDelete: Cascade)
  articleId   String        @unique
  title       String
  body        String        // markdown: lede + "Relevância para a Link" section
  language    String        @default("pt-PT")
  model       String        // e.g. claude-haiku-4-5
  inputMode   RewriteInput  // FULL_TEXT | EXCERPT
  status      RewriteStatus @default(GENERATED)
  generatedAt DateTime      @default(now())
  error       String?
}

enum RewriteInput {
  FULL_TEXT
  EXCERPT
}

enum RewriteStatus {
  GENERATED
  FAILED
  STALE      // article content changed after generation; regenerate on next open
}
```

Add to `OrgSettings`: `orgContextPrompt String?`, a description of the
organization's business used to ground the "Relevância" section (practice areas,
offerings, client types). Editable in Settings UI. Combined at generation time
with the existing `BrandVoice` prompt; do not hardcode Link specifics in code.

Add `rewriteLanguage String @default("pt-PT")` to `OrgSettings`.

## Generation triggers (hybrid)

1. **Eager**: when an article reaches `status = APPROVED`, or on ingestion when
   `relevanceScore >= config.curation.relevanceThreshold`, enqueue rewrite
   generation. Reuse the `BackgroundJob` machinery; batch within the curation job
   rather than one job per article.
2. **Lazy**: `GET /api/articles/[id]/rewrite`. If no rewrite exists (or `STALE`),
   generate synchronously (Haiku latency is acceptable for a detail-view open),
   persist, return. Subsequent opens hit the cache.
3. **Regenerate**: explicit `POST /api/articles/[id]/rewrite/regenerate` for
   editors (org ADMIN/EDITOR roles), for example after editing
   `orgContextPrompt`.

## Input pipeline

1. Attempt full-text extraction of the source URL (reuse or extend the
   cheerio-based extraction in `lib/curation/rss-collector.ts`; factor it into
   `lib/curation/extract.ts` if currently inline). Strip nav and boilerplate; keep
   body text only. Cap input at about 6k tokens.
2. On extraction failure, paywall, or body under 400 chars: fall back to RSS
   excerpt plus title, set `inputMode = EXCERPT`. The prompt for excerpt mode must
   instruct the model to stay strictly within the little it has.
3. Respect robots and paywalls: if the fetch returns 401, 402 or 403, do not retry
   alternate routes; use EXCERPT mode.

## Model and prompt

- Model: Haiku (add `REWRITE_MODEL` to `lib/ai-models.ts`; default the cheapest
  current Haiku). Temperature low (0.3).
- New function `rewriteArticle(input, orgContextPrompt, brandVoicePrompt,
  language)` in `lib/ai/claude.ts`, following the existing `summarizeArticle`
  pattern. Returns strict JSON `{ title, body }`.
- Prompt requirements: enforce all Hard Rules above explicitly; write in
  `language`; the "Relevância para a Link" section must connect the news to the
  org context prompt concretely (services, offerings, client conversations)
  without inventing company facts; if the connection is weak, say so briefly
  rather than forcing it.
- Include the source publication name and date in the prompt so the lede can
  attribute naturally ("A OpenAI anunciou..."), but instruct the model never to
  fabricate publication details.

## Surfaces

1. **Portal detail view**: rewrite shown as the primary body; source attribution
   block directly under the title; AI-generated label; button "Ver artigo
   original". The raw summary remains available (collapsed or secondary tab).
2. **Feed list**: unchanged, keeps the short summary. The rewrite is detail-view
   content.
3. **Newsletter**: edition builder gains a per-article toggle "usar análise Link"
   that swaps the summary for the rewrite title and body in the email template.
   Anything using the rewrite in an edition goes through the existing human review
   flow: no rewrite reaches the newsletter unreviewed.

## Cost control

- Eager generation only above the relevance threshold; expected volume is tens per
  day, not hundreds.
- Cache is permanent per article; regeneration is manual or on STALE.
- Add a `rewrite` section to `lib/config.ts`: model, max input tokens, output word
  cap, eager-generation toggle, per-day generation cap (circuit breaker, default
  300 per day per org).

## Testing and acceptance

- Unit: prompt-output JSON parsing, fallback to EXCERPT mode, word-cap enforcement
  (reject and retry once if body over 300 words), language selection.
- Acceptance:
  1. Approved article gets a rewrite automatically; unopened low-score article
     does not, until opened.
  2. Rewrite of a paywalled source generates in EXCERPT mode without fabricated
     detail.
  3. Detail view always shows source name and URL; newsletter output using a
     rewrite includes the source link.
  4. Editing `orgContextPrompt` and regenerating visibly changes the "Relevância"
     section.
