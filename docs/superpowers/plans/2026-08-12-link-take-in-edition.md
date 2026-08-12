# Link Take in the edition, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An editor can mark a story in an edition to send its Link Take, the verified original
editorial piece, instead of its one-sentence summary, and the send refuses rather than quietly
falling back when a flagged story has no usable take.

**Architecture:** One boolean on the `EditionArticle` join row drives everything. The take is loaded
only for flagged stories, passed down as an optional field on `EmailArticle`, and rendered by two
new fragments in `lib/email/edition-blocks.ts`, which both the code renderer and the Unlayer merge
tags already share, so neither render path is touched directly. Two gates refuse the send: a Send
Readiness card and a server-side 409.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7 on PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-12-link-take-in-edition-design.md`. Read it first. It
carries the RQ-006 rules this work inherits.

## Global Constraints

- **No dash wider than a hyphen** in any output: prose, code, comments, commit messages, docs. Not
  em dash, en dash, horizontal bar, or minus-as-punctuation. Use a comma, a hyphen, or a colon.
- **RQ-006 rule 5:** source attribution, publication name plus original URL, is always rendered
  wherever the take is rendered, including the newsletter. Never omit it.
- **RQ-006 rule 6:** never reproduce or hotlink images from the source.
- **RQ-006 rule 7:** the AI label comes from `aiLabelFor(rewrite.language)` in
  `lib/rewrite/view.ts`. Never hardcode the string, and never key it on the app's language.
- **Every existing edition must render byte-identically** when nothing is flagged. This is the
  regression that matters most; `tests/unit/edition-email.test.ts` and
  `tests/unit/edition-template-snapshot.test.ts` are the guard.
- **Never run a bare `npx vitest run`.** The config at `vitest.config.ts:9` excludes only
  `node_modules` and `.next`, so it walks `.claude/` and reports around 60 phantom failures from
  another checkout. Run named files, as every task below does.
- **Do not run `prisma db push`, `prisma migrate`, or any script that writes rows.** The database is
  shared with production. Task 4 changes `schema.prisma` and stops; applying it is Julian's call.
- **Commit only by explicit path.** Never `git add -A`: other sessions' untracked files are present.

---

### Task 1: The body emitter, markdown blocks to email HTML

`lib/markdown/blocks.ts` already parses a rewrite body into `Block[]` and the dashboard renders
those as React. This produces the email equivalent. It handles no links and no images because
`parseBlocks` produces neither, which is RQ-006 rule 6 as a property of the renderer rather than a
request in a prompt.

**Files:**
- Modify: `lib/email/edition-blocks.ts` (append after the `link` helper, around line 148)
- Test: `tests/unit/link-take-block.test.ts` (create)

**Interfaces:**
- Consumes: `parseBlocks`, `Block`, `Span` from `@/lib/markdown/blocks`; `escapeHtml`, `SANS`,
  `BODY_INK`, `INK` already in this file.
- Produces: `export function linkTakeBodyHtml(body: string): string`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/link-take-block.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { linkTakeBodyHtml } from "@/lib/email/edition-blocks";

describe("linkTakeBodyHtml", () => {
  it("renders a paragraph", () => {
    const html = linkTakeBodyHtml("A OpenAI lancou um modo agentico.");
    expect(html).toContain("A OpenAI lancou um modo agentico.");
    expect(html).toContain("<div");
  });

  it("renders a heading as its own line", () => {
    const html = linkTakeBodyHtml("## Relevancia para a Link\n\nDuas equipas usam isto.");
    expect(html).toContain("Relevancia para a Link");
    expect(html).toContain("Duas equipas usam isto.");
  });

  it("renders bullets with a marker", () => {
    const html = linkTakeBodyHtml("- primeiro\n- segundo");
    expect(html).toContain("primeiro");
    expect(html).toContain("segundo");
    expect(html.match(/&bull;/g)).toHaveLength(2);
  });

  it("renders strong and emphasis", () => {
    const html = linkTakeBodyHtml("isto e **forte** e *leve*");
    expect(html).toContain("<strong>forte</strong>");
    expect(html).toContain("<em>leve</em>");
  });

  it("escapes markup in the prose", () => {
    const html = linkTakeBodyHtml('um <script>alert("x")</script> no texto');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
  });

  // RQ-006 rule 6, as a property rather than a prompt. parseBlocks does not
  // understand links or images, so neither can reach an inbox. If this test
  // ever fails because parseBlocks learned about links, rule 6 needs a real
  // filter here before the parser change lands.
  it("leaves a markdown image or link as literal text", () => {
    const html = linkTakeBodyHtml("![foto](https://example.com/a.png) e [ligacao](https://b.com)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
    expect(html).toContain("![foto]");
    expect(html).toContain("[ligacao]");
  });

  it("returns an empty string for an empty body", () => {
    expect(linkTakeBodyHtml("")).toBe("");
    expect(linkTakeBodyHtml("   ")).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/link-take-block.test.ts`
Expected: FAIL, `linkTakeBodyHtml is not a function` or an import error.

- [ ] **Step 3: Write the implementation**

Append to `lib/email/edition-blocks.ts`, after the `link` function. Add the import at the top of the
file, beside the existing `import type { ... } from "./edition-template";`:

```ts
import { parseBlocks, type Block, type Span } from "@/lib/markdown/blocks";
```

Then:

```ts
/* ------------------------------------------------------- the Link Take body */

function spansHtml(spans: Span[]): string {
  return spans
    .map((span) => {
      const text = escapeHtml(span.text);
      if (span.strong) return `<strong>${text}</strong>`;
      if (span.emphasis) return `<em>${text}</em>`;
      return text;
    })
    .join("");
}

function blockHtml(block: Block): string {
  switch (block.kind) {
    case "heading":
      return `<div class="t-strong" style="font-family:${SANS}; font-size:11px; line-height:16px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.4px; color:${ACCENT}; text-transform:uppercase; padding:6px 0 8px 0;">${escapeHtml(
        block.text
      )}</div>`;
    case "bullet":
      return `<div class="t-body" style="font-family:${SANS}; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:${BODY_INK}; padding:0 0 6px 14px; text-indent:-14px;">&bull;&nbsp;${spansHtml(
        block.spans
      )}</div>`;
    case "paragraph":
      return `<div class="t-body" style="font-family:${SANS}; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:${BODY_INK}; padding-bottom:12px;">${spansHtml(
        block.spans
      )}</div>`;
  }
}

/**
 * A rewrite body as email-safe HTML.
 *
 * Built on `lib/markdown/blocks.ts` rather than a second parser, because the dashboard renders
 * the same blocks as React and two parsers would drift. That module handles no links and no
 * images and leaves anything it does not recognise as literal text, which is what makes RQ-006
 * rule 6 a property of this renderer rather than a request in a prompt.
 */
export function linkTakeBodyHtml(body: string): string {
  if (!body.trim()) return "";
  return parseBlocks(body).map(blockHtml).join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/link-take-block.test.ts`
Expected: PASS, 7 tests.

If the bullet test fails on the `&bull;` count, check whether `escapeHtml` is being applied to the
marker; it must not be, the marker is our markup and not prose.

- [ ] **Step 5: Verify nothing else moved**

Run: `npx vitest run tests/unit/edition-email.test.ts tests/unit/edition-template-snapshot.test.ts tests/unit/merge-tags.test.ts`
Expected: PASS, unchanged. This file is imported by every render path, so a broken import here
breaks all of them.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/email/edition-blocks.ts tests/unit/link-take-block.test.ts
git commit -m "Email: render a rewrite body as email-safe HTML"
```

---

### Task 2: The Link Take fragment, and the two branches that use it

**Files:**
- Modify: `lib/email/edition-template.ts` (the `EmailArticle` interface, around line 56)
- Modify: `lib/email/edition-blocks.ts` (`topicItem` around line 223, `topStoryBlock` around line 324)
- Test: `tests/unit/link-take-block.test.ts` (extend)

**Interfaces:**
- Consumes: `linkTakeBodyHtml` from Task 1; `aiLabelFor` from `@/lib/rewrite/view`.
- Produces:
  - `export interface EmailLinkTake { title: string; body: string; language: string }`
  - `EmailArticle.linkTake?: EmailLinkTake | null`
  - `export function linkTakeBlock(item: EmailArticle): string`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/link-take-block.test.ts`:

```ts
import { topicItem, topStoryBlock } from "@/lib/email/edition-blocks";
import type { EmailArticle, EditionEmail } from "@/lib/email/edition-template";

const TAKE = {
  title: "Os agentes chegaram ao terminal",
  body: "A OpenAI lancou um modo agentico.\n\n## Relevancia para a Link\n\nDuas equipas usam isto.",
  language: "pt-PT",
};

const PLAIN: EmailArticle = {
  title: "OpenAI ships agent mode",
  summary: "A one sentence summary.",
  url: "https://techcrunch.com/agent",
  source: "TechCrunch",
};

const FLAGGED: EmailArticle = { ...PLAIN, linkTake: TAKE };

describe("topicItem with a Link Take", () => {
  it("is unchanged when there is no take", () => {
    const html = topicItem(PLAIN, true, true);
    expect(html).toContain("A one sentence summary.");
    expect(html).toContain("OpenAI ships agent mode");
    // Accented, matching what aiLabelFor really returns. Against the unaccented
    // spelling this assertion could never fail, which is worse than not having it.
    expect(html).not.toContain("Análise gerada por AI");
  });

  it("uses the take's own headline instead of the publisher's", () => {
    const html = topicItem(FLAGGED, true, true);
    expect(html).toContain("Os agentes chegaram ao terminal");
    expect(html).not.toContain("OpenAI ships agent mode");
  });

  it("uses the take's body instead of the summary", () => {
    const html = topicItem(FLAGGED, true, true);
    expect(html).toContain("Duas equipas usam isto.");
    expect(html).not.toContain("A one sentence summary.");
  });

  // RQ-006 rule 5.
  it("always renders the attribution and the original link", () => {
    const html = topicItem(FLAGGED, true, true);
    expect(html).toContain("TechCrunch");
    expect(html).toContain("https://techcrunch.com/agent");
  });

  // RQ-006 rule 7, in the language of the prose and not of the app.
  it("labels the piece as AI generated, in the prose's language", () => {
    expect(topicItem(FLAGGED, true, true)).toContain(
      "Análise gerada por AI a partir da fonte original"
    );
    const english = topicItem({ ...PLAIN, linkTake: { ...TAKE, language: "en" } }, true, true);
    expect(english).toContain("AI analysis generated from the original source");
  });
});

describe("topStoryBlock with a Link Take", () => {
  const base = { topStory: PLAIN, topStoryImage: "https://cdn.example.com/hero.png" };

  it("keeps the image when there is no take", () => {
    const html = topStoryBlock(base as unknown as EditionEmail);
    expect(html).toContain("<img");
  });

  // 200 words in a 380px column beside a thumbnail is unreadable on a phone.
  it("drops to single column and omits the image when flagged", () => {
    const html = topStoryBlock({ ...base, topStory: FLAGGED } as unknown as EditionEmail);
    expect(html).not.toContain("<img");
    expect(html).toContain("Duas equipas usam isto.");
    expect(html).toContain("width:100%");
  });

  it("keeps the coverage badge and the read link when flagged", () => {
    const html = topStoryBlock({
      ...base,
      topStory: { ...FLAGGED, coverage: 6 },
    } as unknown as EditionEmail);
    expect(html).toContain("Covered by 6 sources");
    expect(html).toContain("Read the analysis");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/link-take-block.test.ts`
Expected: FAIL. The "unchanged" tests pass; every `linkTake` test fails because the field does not
exist and the branches are not written.

- [ ] **Step 3: Add the type**

In `lib/email/edition-template.ts`, above `EmailArticle`:

```ts
/**
 * The verified original piece for a story, when this edition is sending it instead of the
 * summary. RQ-006 surface 3.
 *
 * `language` is the rewrite's own, not the organization's and not the app's: it is what
 * `aiLabelFor` keys the required label on, and a take can outlive a change to the setting.
 */
export interface EmailLinkTake {
  title: string;
  body: string;
  language: string;
}
```

And inside `EmailArticle`, after `coverage`:

```ts
  /** Set only when this edition flagged the story to send its Link Take. */
  linkTake?: EmailLinkTake | null;
```

- [ ] **Step 4: Write the fragment**

In `lib/email/edition-blocks.ts`, add to the imports:

```ts
import { aiLabelFor } from "@/lib/rewrite/view";
```

and to the type import from `./edition-template`, add `EmailLinkTake`. Then, after
`linkTakeBodyHtml`:

```ts
/**
 * A story rendered as its Link Take: the piece's own headline, its body, the source, and the
 * label RQ-006 rule 7 requires.
 *
 * The attribution is not optional and not conditional. Rule 5 requires it wherever the prose is
 * rendered, and the newsletter is named in the rule.
 */
export function linkTakeBlock(item: EmailArticle): string {
  const take = item.linkTake;
  if (!take) return "";

  return `<div class="h2 t-strong" style="font-family:${SERIF}; font-size:22px; line-height:29px; mso-line-height-rule:exactly; font-weight:normal; color:${INK}; padding-bottom:10px;">${escapeHtml(
    take.title
  )}</div>
${linkTakeBodyHtml(take.body)}
<div class="t-muted" style="font-family:${SANS}; font-size:11px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:0.6px; color:${MUTED}; padding-top:6px;">${escapeHtml(
    aiLabelFor(take.language)
  )}</div>
<div class="link-strong" style="padding-top:8px; font-family:${SANS}; font-size:13px; line-height:19px; mso-line-height-rule:exactly;">${link(
    item.url,
    item.source ? `${item.source}: ver artigo original` : "Ver artigo original",
    `color:${PRIMARY}; font-weight:bold; text-decoration:none; border-bottom:2px solid ${ACCENT};`
  )}</div>`;
}
```

Rule 5 is satisfied by the last div: the publication name is the link label and the original URL is
its href, which is what makes the attribution visually prominent rather than a footnote. `link`
already refuses anything that is not absolute http(s), so a bad `sourceUrl` degrades to plain text
rather than an unsafe href.

- [ ] **Step 5: Branch `topicItem`**

Replace the body of `topicItem` so the long form short-circuits, keeping the existing cell styling:

```ts
export function topicItem(
  item: EmailArticle,
  isFirst: boolean,
  isLast: boolean
): string {
  const cellStyle = isFirst
    ? `padding-bottom:${isLast ? "0" : "16px"};`
    : `border-top:1px solid ${RULE_SOFT}; padding-top:16px;${isLast ? "" : " padding-bottom:16px;"}`;

  if (item.linkTake) {
    return `<tr><td class="${isFirst ? "" : "rule"}" style="${cellStyle}">
      ${linkTakeBlock(item)}
    </td></tr>`;
  }

  // ... the existing meta / title / summary body, unchanged ...
}
```

Keep everything after this point exactly as it is: the `meta` line, the title div, the summary div
and the meta div. Only the two lines computing `cellStyle` move above the branch.

- [ ] **Step 6: Branch `topStoryBlock`**

In `topStoryBlock`, after `const story = data.topStory;` and the null guard, change the image line
so a flagged story never resolves one:

```ts
  // A flagged top story drops to single column. 200 words in a 380px column beside a 152px
  // thumbnail is unreadable on a phone, and single column is what every send produced before
  // the image feature existed.
  const image = story.linkTake ? null : safeUrl(data.topStoryImage);
```

Then replace the title and summary divs in the first `<td>` with a branch:

```ts
      ${
        story.linkTake
          ? linkTakeBlock(story)
          : `<div class="h1 t-strong" style="font-family:${SERIF}; font-size:30px; line-height:36px; mso-line-height-rule:exactly; font-weight:normal; color:${INK}; padding-bottom:12px;">${link(
              story.url,
              story.title,
              `color:${INK}; text-decoration:none;`
            )}</div>
      <div class="t-body" style="font-family:${SANS}; font-size:15px; line-height:24px; mso-line-height-rule:exactly; color:${BODY_INK}; padding-bottom:14px;">${escapeHtml(
        story.summary
      )}</div>`
      }
```

Leave the coverage badge, the meta row and the "Read the analysis" link untouched below it.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/unit/link-take-block.test.ts`
Expected: PASS, all tests.

- [ ] **Step 8: Prove no existing edition changed**

Run: `npx vitest run tests/unit/edition-email.test.ts tests/unit/edition-template-snapshot.test.ts tests/unit/merge-tags.test.ts`
Expected: PASS, unchanged. Any failure here means the no-take path was altered, which the global
constraints forbid. Fix the branch rather than updating the snapshot.

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add lib/email/edition-blocks.ts lib/email/edition-template.ts tests/unit/link-take-block.test.ts
git commit -m "Email: a flagged story renders its Link Take, with source and label"
```

---

### Task 3: Both renderers agree

The point of putting the fragment in `edition-blocks.ts` is that the code renderer and the Unlayer
merge tags both reach it. This proves it, and is the test that stops the two paths drifting.

**Files:**
- Test: `tests/unit/merge-tags.test.ts` (extend)

**Interfaces:**
- Consumes: `editionMergeValues` from `@/lib/email/merge-tags`; the Task 2 types.
- Produces: nothing. This task is a test only.

- [ ] **Step 1: Read how the existing parity test builds an edition**

Read `tests/unit/merge-tags.test.ts` and find the fixture it passes to `editionMergeValues`. Reuse
that fixture shape rather than inventing one; if it is built by a helper, use the helper.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/merge-tags.test.ts`, adapting `buildEdition` to whatever the file already
uses:

```ts
describe("a flagged story reaches both renderers", () => {
  const take = {
    title: "Os agentes chegaram ao terminal",
    body: "A OpenAI lancou um modo agentico.",
    language: "pt-PT",
  };

  it("renders the take in the sections merge tag", () => {
    const edition = buildEdition();
    edition.sections[0].items[0] = { ...edition.sections[0].items[0], linkTake: take };

    const values = editionMergeValues(edition);

    expect(values.sections).toContain("Os agentes chegaram ao terminal");
    expect(values.sections).toContain("Análise gerada por AI a partir da fonte original");
  });

});
```

`{{articles}}` is deliberately **not** covered here. It is not produced by `editionMergeValues`,
which returns eight keys and no `articles`; it is built by `renderArticlesHtml`
(`lib/email/content-renderer.ts:101`) and `renderArticles`
(`lib/email/template-renderer.ts:197`), each from its own local `Article` interface. Neither
carries `linkTake` yet. Task 6 threads it through and adds the matching assertion. Put a comment
saying so above this describe block, or a later reader will take this file for full parity cover.

- [ ] **Step 3: Run it**

Run: `npx vitest run tests/unit/merge-tags.test.ts`
Expected: PASS without any implementation change, because `{{sections}}` resolves through
`sectionBlock` and `topicItem`, which Task 2 already branched.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/merge-tags.test.ts
git commit -m "Email: pin that a Link Take renders in both merge-tag paths"
```

---

### Task 4: The flag, and carrying it through a PATCH that deletes everything

`PATCH /api/editions/:id` deletes every join row and recreates what it is given. A caller that sends
only ids would silently clear every flag. That is the defect this task exists to prevent.

**Files:**
- Modify: `prisma/schema.prisma` (the `EditionArticle` model)
- Modify: `lib/editions/add-to-edition.ts`
- Modify: `app/api/editions/[id]/route.ts:472-478`
- Test: `tests/unit/add-to-edition.test.ts` (extend)

**Interfaces:**
- Produces: `EditionArticleRow { articleId: string; order: number; useLinkTake: boolean }`, and
  `mergeEditionArticles(existing: readonly EditionArticleRow[], addedIds: readonly string[]): EditionArticleRow[]`

Note the first parameter changes from `readonly string[]` to `readonly EditionArticleRow[]`. Every
caller must be updated; `lib/editions/proposal.ts:409` reads the rows already.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/add-to-edition.test.ts`:

```ts
describe("mergeEditionArticles carries the Link Take flag", () => {
  it("preserves the flag on rows that were already there", () => {
    const merged = mergeEditionArticles(
      [
        { articleId: "a", order: 1, useLinkTake: true },
        { articleId: "b", order: 2, useLinkTake: false },
      ],
      ["c"]
    );

    expect(merged).toEqual([
      { articleId: "a", order: 1, useLinkTake: true },
      { articleId: "b", order: 2, useLinkTake: false },
      { articleId: "c", order: 3, useLinkTake: false },
    ]);
  });

  it("adds new rows unflagged", () => {
    const merged = mergeEditionArticles([], ["a"]);
    expect(merged[0].useLinkTake).toBe(false);
  });

  it("does not flag a duplicate back to false", () => {
    const merged = mergeEditionArticles(
      [{ articleId: "a", order: 1, useLinkTake: true }],
      ["a"]
    );
    expect(merged).toEqual([{ articleId: "a", order: 1, useLinkTake: true }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/add-to-edition.test.ts`
Expected: FAIL, type error or `useLinkTake` undefined on the results.

- [ ] **Step 3: Change the schema**

In `prisma/schema.prisma`, inside `model EditionArticle`, after `order Int`:

```prisma
  /**
   * Whether this edition sends the article's Link Take instead of its summary. RQ-006
   * surface 3.
   *
   * On the join row rather than on Article, because the choice is editorial and belongs to
   * this edition. Default false, so every edition that predates this renders unchanged.
   *
   * PATCH /api/editions/:id deletes every join row and recreates what it is given, so
   * anything that writes this list has to read this column and send it back. That is what
   * `mergeEditionArticles` is for.
   */
  useLinkTake Boolean @default(false)
```

Then run `npx prisma generate` so the client types update. **Do not run `prisma db push`.** The
database is shared with production and applying this is Julian's call.

- [ ] **Step 4: Change the merge helper**

Rewrite `lib/editions/add-to-edition.ts`:

```ts
export interface EditionArticleRow {
  articleId: string;
  order: number;
  /** Whether this edition sends the Link Take for this story. RQ-006 surface 3. */
  useLinkTake: boolean;
}

export function mergeEditionArticles(
  existing: readonly EditionArticleRow[],
  addedIds: readonly string[]
): EditionArticleRow[] {
  const merged: EditionArticleRow[] = [];
  const seen = new Set<string>();

  for (const row of existing) {
    if (!row.articleId || seen.has(row.articleId)) continue;
    seen.add(row.articleId);
    merged.push({ ...row });
  }

  for (const articleId of addedIds) {
    if (!articleId || seen.has(articleId)) continue;
    seen.add(articleId);
    merged.push({ articleId, order: 0, useLinkTake: false });
  }

  return merged.map((row, index) => ({ ...row, order: index + 1 }));
}
```

Update the file's header comment: the merge now carries the flag as well as the order, and losing
either is the silent destruction it warns about.

- [ ] **Step 5: Update the PATCH route**

In `app/api/editions/[id]/route.ts`, replace the `articleRows` mapping at line 472:

```ts
      articleRows = articles.map(
        (a: { articleId: string; order?: number; useLinkTake?: boolean }, index: number) => ({
          articleId: a.articleId,
          order: a.order ?? index + 1,
          useLinkTake: a.useLinkTake === true,
        })
      );
```

Then widen the `articleRows` declaration above it to match:

```ts
    let articleRows: Array<{
      articleId: string;
      order: number;
      useLinkTake: boolean;
    }> | null = null;
```

- [ ] **Step 6: Fix every caller**

Run: `npx tsc --noEmit`

Fix each error. `lib/editions/proposal.ts:409` calls `readEditionArticleRows`, which must now select
`useLinkTake` as well as `articleId` and `order`. Any caller passing a `string[]` must pass rows.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/unit/add-to-edition.test.ts tests/unit/edition-patch-input.test.ts tests/unit/editions-lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma lib/editions/add-to-edition.ts "app/api/editions/[id]/route.ts" lib/editions/proposal.ts tests/unit/add-to-edition.test.ts
git commit -m "Editions: a story can be flagged to send its Link Take"
```

---

### Task 5: Which takes are usable, and loading them

**Files:**
- Create: `lib/rewrite/usable.ts`
- Test: `tests/unit/link-take-usable.test.ts` (create)

**Interfaces:**
- Consumes: `CurrentRewrite`, `readCurrentRewrite` from `@/lib/rewrite/store`; `TenantClient` from
  `@/lib/db/tenant`; `EmailLinkTake` from `@/lib/email/edition-template`.
- Produces:
  - `export function isUsableTake(current: CurrentRewrite): boolean`
  - `export async function readLinkTakesFor(db: TenantClient, articleIds: readonly string[]): Promise<Map<string, EmailLinkTake>>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/link-take-usable.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isUsableTake } from "@/lib/rewrite/usable";

const passing = {
  id: "r1",
  title: "Titulo",
  body: "Corpo",
  language: "pt-PT",
  model: "claude-sonnet-5",
  inputMode: "FULL_TEXT" as const,
  status: "GENERATED" as const,
  checksPassed: true,
  checkSummary: null,
  longestSharedRun: 4,
  wordCount: 210,
  generatedAt: new Date(),
  error: null,
  instruction: null,
};

describe("isUsableTake", () => {
  it("accepts a generated take that passed its checks and is current", () => {
    expect(isUsableTake({ rewrite: passing, stale: false })).toBe(true);
  });

  it("refuses when there is no take at all", () => {
    expect(isUsableTake({ rewrite: null, stale: false })).toBe(false);
  });

  it("refuses a FAILED take", () => {
    expect(
      isUsableTake({ rewrite: { ...passing, status: "FAILED", checksPassed: false }, stale: false })
    ).toBe(false);
  });

  // A piece that passed its checks but whose article moved underneath it is an analysis of
  // a version of the story that no longer exists.
  it("refuses a stale take", () => {
    expect(isUsableTake({ rewrite: passing, stale: true })).toBe(false);
  });

  it("refuses a take whose checks did not pass, whatever its status says", () => {
    expect(isUsableTake({ rewrite: { ...passing, checksPassed: false }, stale: false })).toBe(false);
  });

  it("refuses a take with an empty body", () => {
    expect(isUsableTake({ rewrite: { ...passing, body: "  " }, stale: false })).toBe(false);
  });
});
```

The spec's testing section also lists "superseded". There is deliberately no test for it here:
`readCurrentRewrite` queries `supersededAt: null`, so a superseded row can never reach
`isUsableTake`. It is excluded by construction rather than by a branch, and testing a branch that
does not exist would assert nothing. The implementation comment says so, so the next reader does
not add the branch back.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/link-take-usable.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/rewrite/usable.ts`:

```ts
import type { TenantClient } from "@/lib/db/tenant";
import { readCurrentRewrite, type CurrentRewrite } from "@/lib/rewrite/store";
import type { EmailLinkTake } from "@/lib/email/edition-template";

/**
 * Whether a take may be sent.
 *
 * Four independent reasons to refuse, and each is a separate test: nothing was ever written,
 * the attempt was refused, the checks did not pass, or the article moved after it was written.
 * `supersededAt` is not checked here because `readCurrentRewrite` only ever returns the current
 * row.
 *
 * The empty-body case looks paranoid and is not: a FAILED row stores `body: ""`, and a future
 * status that is neither GENERATED nor FAILED would otherwise send an empty story.
 */
export function isUsableTake(current: CurrentRewrite): boolean {
  const { rewrite, stale } = current;
  if (!rewrite) return false;
  if (stale) return false;
  if (rewrite.status !== "GENERATED") return false;
  if (!rewrite.checksPassed) return false;
  if (!rewrite.body.trim()) return false;
  if (!rewrite.title.trim()) return false;
  return true;
}

/**
 * The usable take for each of these articles, keyed by article id.
 *
 * An article with no usable take is simply absent from the map, which is what lets a caller
 * distinguish "flagged and ready" from "flagged and blocked" without a second query.
 *
 * Called only with the flagged ids, so an edition with nothing flagged issues no query at all.
 */
export async function readLinkTakesFor(
  db: TenantClient,
  articleIds: readonly string[]
): Promise<Map<string, EmailLinkTake>> {
  const takes = new Map<string, EmailLinkTake>();
  if (articleIds.length === 0) return takes;

  for (const articleId of articleIds) {
    const current = await readCurrentRewrite(db, articleId);
    if (!isUsableTake(current) || !current.rewrite) continue;
    takes.set(articleId, {
      title: current.rewrite.title,
      body: current.rewrite.body,
      language: current.rewrite.language,
    });
  }

  return takes;
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/unit/link-take-usable.test.ts`
Expected: PASS, 6 tests.

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add lib/rewrite/usable.ts tests/unit/link-take-usable.test.ts
git commit -m "Rewrite: decide when a Link Take may be sent"
```

---

### Task 6: Wire it into the four places that assemble an edition

All four must agree, or the preview will disagree with the send.

**This task also closes a gap Task 3 found.** `{{articles}}` is a merge tag an Unlayer template may
use instead of `{{sections}}`, and it is built by `renderArticlesHtml`
(`lib/email/content-renderer.ts:64`) and `renderArticles` (`lib/email/template-renderer.ts:88`)
from **their own local `Article` interfaces**, neither of which carries `linkTake`. Until both are
threaded, a template built on `{{articles}}` renders the ordinary summary for a flagged story,
silently and with no error. Steps 5b and 7b below fix that.

**Files:**
- Modify: `lib/email/edition-data.ts` (`SourceArticle` around line 22, `toEmailArticle` line 176)
- Modify: `lib/editions/sent-snapshot.ts` (`SentSnapshotArticle` line 35, `toSnapshotArticle` line 117)
- Modify: `lib/email/content-renderer.ts` (the local `Article` interface around line 31, and
  `renderArticlesHtml` line 64)
- Modify: `lib/email/template-renderer.ts` (the local `Article` interface around line 55, and
  `renderArticles` line 88)
- Modify: `lib/email/sender.ts`, `app/api/email/send-all`, `app/api/email/preview`,
  `app/api/email/send-test` (wherever each selects articles)
- Test: `tests/unit/edition-email.test.ts` (extend), `tests/unit/merge-tags.test.ts` (extend)

**Interfaces:**
- Consumes: `readLinkTakesFor` from Task 5, `EmailLinkTake` from Task 2.
- Produces: `SourceArticle.linkTake?: EmailLinkTake | null`, `SentSnapshotArticle.linkTake`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/edition-email.test.ts`:

```ts
describe("an edition carrying a Link Take", () => {
  it("passes the take through to the email article", () => {
    const email = buildEditionEmail({
      articles: [
        {
          title: "OpenAI ships agent mode",
          summary: "A one sentence summary.",
          sourceUrl: "https://techcrunch.com/agent",
          category: ["tooling"],
          linkTake: { title: "Os agentes", body: "Corpo.", language: "pt-PT" },
        },
      ],
      projects: [],
      week: 33,
      year: 2026,
    });

    const item = email.sections.flatMap((section) => section.items)[0] ?? email.topStory;
    expect(item?.linkTake?.title).toBe("Os agentes");
  });

  it("leaves linkTake undefined when the article has none", () => {
    const email = buildEditionEmail({
      articles: [
        {
          title: "OpenAI ships agent mode",
          summary: "A one sentence summary.",
          sourceUrl: "https://techcrunch.com/agent",
          category: ["tooling"],
        },
      ],
      projects: [],
      week: 33,
      year: 2026,
    });

    const item = email.sections.flatMap((section) => section.items)[0] ?? email.topStory;
    expect(item?.linkTake).toBeFalsy();
  });
});
```

Adapt `buildEditionEmail` to whatever the file already imports from `@/lib/email/edition-data`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/edition-email.test.ts`
Expected: FAIL on the first test, `linkTake` is not a property of `SourceArticle`.

- [ ] **Step 3: Thread the field through edition-data**

In `lib/email/edition-data.ts`, add to `SourceArticle`:

```ts
  /**
   * The verified original piece, when this edition flagged the story to send it. RQ-006
   * surface 3. Resolved by the caller, like `oneMoreThing` and for the same reason: this
   * module is reachable from client components and must not import anything Prisma-facing.
   */
  linkTake?: EmailLinkTake | null;
```

Import the type from `./edition-template` alongside the existing type imports. Then in
`toEmailArticle`:

```ts
function toEmailArticle(article: SourceArticle): EmailArticle {
  return {
    title: article.title,
    summary: (article.summary ?? "").trim(),
    url: article.sourceUrl,
    source: publicationName(article.sourceUrl),
    linkTake: article.linkTake ?? null,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/edition-email.test.ts`
Expected: PASS.

- [ ] **Step 4b: Thread it through the two `{{articles}}` renderers**

In `lib/email/content-renderer.ts`, add to its local `Article` interface:

```ts
  linkTake?: { title: string; body: string; language: string } | null;
```

and in `renderArticlesHtml`, where it maps each article into the `topicItem` input, add
`linkTake: article.linkTake ?? null,` beside `title`, `summary`, `url` and `source`.

Do exactly the same in `lib/email/template-renderer.ts` for its own `Article` interface and
`renderArticles`.

Both interfaces are local and structural on purpose; do not try to unify them with
`SourceArticle` in this task. That is a larger refactor and not what this work is for.

- [ ] **Step 4c: Pin the second merge tag**

Append to `tests/unit/merge-tags.test.ts`, in the describe block Task 3 added, and delete the
comment Task 3 left saying `{{articles}}` is uncovered:

```ts
  it("renders the take in the articles merge tag too", () => {
    const html = renderArticlesHtml([
      {
        title: "OpenAI ships agent mode",
        summary: "A one sentence summary.",
        sourceUrl: "https://techcrunch.com/agent",
        category: ["tooling"],
        linkTake: {
          title: "Os agentes chegaram ao terminal",
          body: "A OpenAI lancou um modo agentico.",
          language: "pt-PT",
        },
      },
    ] as Parameters<typeof renderArticlesHtml>[0]);

    expect(html).toContain("Os agentes chegaram ao terminal");
    expect(html).toContain("Análise gerada por AI a partir da fonte original");
    expect(html).not.toContain("A one sentence summary.");
  });
```

Import `renderArticlesHtml` from `@/lib/email/content-renderer`; the file already imports
`replaceContentMergeTags` from there.

- [ ] **Step 5: Add it to the snapshot**

In `lib/editions/sent-snapshot.ts`, add to `SentSnapshotArticle`:

```ts
  /**
   * The Link Take exactly as it was sent, when this edition sent one.
   *
   * Frozen here for the same reason `summary` is: regenerating a take after a send would
   * otherwise rewrite what subscribers already received.
   */
  linkTake?: { title: string; body: string; language: string } | null;
```

and in `toSnapshotArticle`:

```ts
    linkTake: article.linkTake ?? null,
```

- [ ] **Step 6: Load the takes in every assembly point**

In each of `lib/email/sender.ts`, `app/api/email/send-all`, `app/api/email/preview` and
`app/api/email/send-test`, after the edition's articles are read and before
`buildEditionEmail` is called:

```ts
  const flaggedIds = editionArticles
    .filter((row) => row.useLinkTake)
    .map((row) => row.articleId);
  const takes = await readLinkTakesFor(db, flaggedIds);
```

and when mapping each article into `SourceArticle`, add:

```ts
    linkTake: takes.get(article.id) ?? null,
```

Each route selects articles slightly differently. Follow the shape already there; do not
restructure the query. Make sure the join rows' `useLinkTake` is selected wherever the ids come
from a join-row read.

- [ ] **Step 7: Verify preview and send agree**

Run: `npx vitest run tests/unit/edition-email.test.ts tests/unit/edition-template-snapshot.test.ts tests/unit/merge-tags.test.ts tests/unit/link-take-block.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`

- [ ] **Step 8: Commit**

```bash
git add lib/email/edition-data.ts lib/editions/sent-snapshot.ts lib/email/sender.ts app/api/email tests/unit/edition-email.test.ts
git commit -m "Editions: carry the Link Take from the flag to the inbox and the snapshot"
```

---

### Task 7: Refuse to send when a flagged story has no take

Two gates, because a UI-only gate is not a gate.

**Files:**
- Create: `lib/editions/link-take-readiness.ts`
- Modify: `app/api/email/send-all/route.ts`
- Test: `tests/unit/link-take-readiness.test.ts` (create)

**Interfaces:**
- Produces:
  - `export interface LinkTakeReadiness { flagged: number; missing: Array<{ articleId: string; title: string }>; ready: boolean }`
  - `export function linkTakeReadiness(rows: ReadonlyArray<{ articleId: string; title: string; useLinkTake: boolean; hasUsableTake: boolean }>): LinkTakeReadiness`
  - `export function linkTakeBlockReason(readiness: LinkTakeReadiness): string | null`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/link-take-readiness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { linkTakeReadiness, linkTakeBlockReason } from "@/lib/editions/link-take-readiness";

const row = (over: Partial<Parameters<typeof linkTakeReadiness>[0][number]> = {}) => ({
  articleId: "a",
  title: "OpenAI ships agent mode",
  useLinkTake: false,
  hasUsableTake: false,
  ...over,
});

describe("linkTakeReadiness", () => {
  it("is ready when nothing is flagged", () => {
    const result = linkTakeReadiness([row(), row({ articleId: "b" })]);
    expect(result).toEqual({ flagged: 0, missing: [], ready: true });
  });

  it("is ready when every flagged story has a usable take", () => {
    const result = linkTakeReadiness([row({ useLinkTake: true, hasUsableTake: true })]);
    expect(result.flagged).toBe(1);
    expect(result.ready).toBe(true);
  });

  it("is blocked when a flagged story has none, and names it", () => {
    const result = linkTakeReadiness([
      row({ useLinkTake: true, hasUsableTake: true }),
      row({ articleId: "b", title: "Segunda", useLinkTake: true, hasUsableTake: false }),
    ]);
    expect(result.flagged).toBe(2);
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual([{ articleId: "b", title: "Segunda" }]);
  });

  it("ignores an unflagged story that happens to have no take", () => {
    const result = linkTakeReadiness([row({ useLinkTake: false, hasUsableTake: false })]);
    expect(result.ready).toBe(true);
  });
});

describe("linkTakeBlockReason", () => {
  it("is null when ready", () => {
    expect(linkTakeBlockReason({ flagged: 2, missing: [], ready: true })).toBeNull();
  });

  it("names the stories when blocked", () => {
    const reason = linkTakeBlockReason({
      flagged: 2,
      missing: [{ articleId: "b", title: "Segunda" }],
      ready: false,
    });
    expect(reason).toContain("Segunda");
    expect(reason).toContain("Link Take");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/link-take-readiness.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/editions/link-take-readiness.ts`:

```ts
/**
 * Whether an edition may be sent, as far as its Link Takes are concerned. RQ-006 surface 3.
 *
 * Pure, and separate from both the screen and the route, because both must reach the same
 * verdict from the same rule. A gate that lives only in the UI is not a gate: the send route
 * is reachable directly.
 *
 * The decision it encodes: a flag is a promise. Falling back to the summary would let an editor
 * believe they shipped a Link Take when they shipped a sentence, and leave nothing in the sent
 * edition recording the difference.
 */

export interface LinkTakeReadiness {
  /** How many stories in this edition are flagged. */
  flagged: number;
  /** The flagged ones with no usable take, in edition order. */
  missing: Array<{ articleId: string; title: string }>;
  ready: boolean;
}

export function linkTakeReadiness(
  rows: ReadonlyArray<{
    articleId: string;
    title: string;
    useLinkTake: boolean;
    hasUsableTake: boolean;
  }>
): LinkTakeReadiness {
  const flaggedRows = rows.filter((row) => row.useLinkTake);
  const missing = flaggedRows
    .filter((row) => !row.hasUsableTake)
    .map((row) => ({ articleId: row.articleId, title: row.title }));

  return { flagged: flaggedRows.length, missing, ready: missing.length === 0 };
}

/** The sentence shown on the screen and returned by the route, so they cannot disagree. */
export function linkTakeBlockReason(readiness: LinkTakeReadiness): string | null {
  if (readiness.ready) return null;

  const names = readiness.missing.map((row) => `"${row.title}"`).join(", ");
  const count = readiness.missing.length;

  return (
    `${count} ${count === 1 ? "story is" : "stories are"} set to send a Link Take ` +
    `but ${count === 1 ? "has" : "have"} none that can be sent: ${names}. ` +
    `Generate one from the article screen, or clear the flag.`
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/link-take-readiness.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Refuse in the send route**

In `app/api/email/send-all/route.ts`, after the edition's articles and their takes are read (the
same `readLinkTakesFor` call added in Task 6) and before anything is sent:

```ts
  const readiness = linkTakeReadiness(
    editionArticles.map((row) => ({
      articleId: row.articleId,
      title: row.article.title,
      useLinkTake: row.useLinkTake,
      hasUsableTake: takes.has(row.articleId),
    }))
  );

  if (!readiness.ready) {
    // 409, not 400 and not 500. The request is well formed and nothing broke on our side:
    // the edition is in a state that forbids sending, and the fix is one toggle away.
    return NextResponse.json(
      { success: false, error: linkTakeBlockReason(readiness) },
      { status: 409 }
    );
  }
```

- [ ] **Step 6: Typecheck and run the suite for this area**

Run: `npx tsc --noEmit`
Run: `npx vitest run tests/unit/link-take-readiness.test.ts tests/unit/link-take-usable.test.ts tests/unit/edition-email.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/editions/link-take-readiness.ts app/api/email/send-all/route.ts tests/unit/link-take-readiness.test.ts
git commit -m "Send: refuse an edition whose flagged story has no Link Take"
```

---

### Task 8: The toggle and the readiness card

**Files:**
- Modify: `app/dashboard/send/[id]/page.tsx` (the `renderItem` callback at line 2049, the Send
  Readiness grid at line 1120, and the `canSend` gating)
- Modify: `components/proposal/state.ts` (the `ProposalArticle` row shape)
- Test: manual, plus the existing suite

**Interfaces:**
- Consumes: `linkTakeReadiness`, `linkTakeBlockReason` from Task 7.
- Produces: nothing consumed by later tasks. This is the last one.

**Do not touch `components/edition/edition-order-list.tsx`.** It is generic over `{ id: string }`
and its header says position is the only thing it owns: it never fetches and never decides what may
be added. A flag is not position. The send page already renders each row through the `renderItem`
callback and already owns persistence through `handleArticleSelectionChange`, so the toggle goes
there and the component stays as it is.

- [ ] **Step 1: Carry the flag on the row shape**

In `components/proposal/state.ts`, add to `ProposalArticle`:

```ts
  /** Whether this edition sends this story's Link Take. RQ-006 surface 3. */
  useLinkTake?: boolean;
  /** Whether a sendable take exists, so the row can say why it is blocked. */
  hasUsableTake?: boolean;
```

Both optional, so every other consumer of this shape keeps compiling. The edition endpoint must
select and return them; find where `selectedArticles` is populated in
`app/dashboard/send/[id]/page.tsx` and make sure both arrive.

- [ ] **Step 2: Add the toggle to `renderItem`**

In `app/dashboard/send/[id]/page.tsx` at line 2049, extend the existing `renderItem`:

```tsx
                  renderItem={(article) => (
                    <>
                      <SourceStamp
                        sourceUrl={article.sourceUrl}
                        publishedAt={article.publishedAt}
                        capturedAt={article.capturedAt}
                      />
                      <span className="font-editorial block text-[14px] leading-[1.3] text-radar-ink text-pretty">
                        {article.title}
                      </span>
                      <label className="mt-1.5 flex items-center gap-2 text-[11px] text-radar-ink2">
                        <input
                          type="checkbox"
                          checked={article.useLinkTake === true}
                          onChange={(event) => toggleLinkTake(article.id, event.target.checked)}
                        />
                        <span>Send the Link Take</span>
                        {article.useLinkTake && article.hasUsableTake === false && (
                          <Badge variant="warning">none written</Badge>
                        )}
                      </label>
                    </>
                  )}
```

- [ ] **Step 3: Write the handler**

Beside `handleArticleSelectionChange`, add:

```tsx
  // Reports through the same handler the list uses, so there is one write path. The flag
  // rides along in the PATCH body, which carries useLinkTake per task 4; a second endpoint
  // would be a second way for the two to disagree.
  const toggleLinkTake = (articleId: string, useLinkTake: boolean) => {
    const next = selectedArticles.map((article) =>
      article.id === articleId ? { ...article, useLinkTake } : article
    );
    handleArticleSelectionChange(
      next.map((article) => article.id),
      next
    );
  };
```

Then check that `handleArticleSelectionChange` sends `useLinkTake` in the PATCH body's article
objects. If it maps to `{ articleId, order }` only, add the field: without it Task 4's route reads
`undefined` and writes `false`, and the toggle appears to work until the page reloads.

- [ ] **Step 2: Add the readiness card**

In `app/dashboard/send/[id]/page.tsx`, in the Send Readiness grid, add a fourth card matching the
three already there exactly in structure:

```tsx
<div className="flex items-center justify-between rounded-md border p-3 gap-3">
  <div>
    <p className="text-sm font-medium">Link Take</p>
    <p className="text-xs text-radar-ink2">
      {linkTakeState.flagged === 0
        ? "No stories flagged"
        : linkTakeState.ready
          ? `${linkTakeState.flagged} flagged, all ready`
          : `${linkTakeState.flagged} flagged, ${linkTakeState.missing.length} with none`}
    </p>
  </div>
  {linkTakeState.ready ? (
    <Badge variant="success">Ready</Badge>
  ) : (
    <Badge variant="warning">Blocked</Badge>
  )}
  <Button variant="ghost" size="sm" asChild>
    <a href="#articles-panel">Open</a>
  </Button>
</div>
```

Compute `linkTakeState` with `linkTakeReadiness` from the articles the page already holds. Check the
anchor name against the article panel's actual id and correct it if it differs.

- [ ] **Step 3: Join the send gate**

Find where `canSend` and `sendBlockReason` are computed and add this condition, so the button is
disabled and the existing "Not ready to send yet" callout explains why. Use
`linkTakeBlockReason(linkTakeState)` for the wording, so the screen and the 409 say the same thing.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit`
Run: `npm run lint`
Expected: no errors. Warnings are tolerated in this project by design; errors are not.

- [ ] **Step 5: Run the whole unit suite for the touched areas**

Run: `npx vitest run tests/unit/link-take-block.test.ts tests/unit/link-take-usable.test.ts tests/unit/link-take-readiness.test.ts tests/unit/add-to-edition.test.ts tests/unit/edition-email.test.ts tests/unit/edition-template-snapshot.test.ts tests/unit/merge-tags.test.ts tests/unit/editions-lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 6: See it in the browser**

The schema change from Task 4 has not been applied to the database, so this needs Julian to apply it
first. Ask before going further. Once applied:

Start the dev server on a free port, never 3111, which another session may hold:
`npx next dev --port 3117`

Open an edition, flag a story whose article has a Link Take, and confirm: the readiness card reads
"1 flagged, all ready"; the preview shows the take's headline, its body, the source link and the
Portuguese AI label; and the top story keeps its image when unflagged and loses it when flagged.
Then flag a story with no take and confirm the card blocks and the send button is disabled.

Say in your report which port you used.

- [ ] **Step 7: Commit and open the PR**

```bash
git add "app/dashboard/send/[id]/page.tsx" components/proposal/state.ts
git commit -m "Editions: flag a story for its Link Take, and show it in Send Readiness"
git push -u origin docs/link-take-in-edition
```

Then open the PR with a real body:

```bash
gh pr create --title "Link Take in the edition (RQ-006 surface 3)" --body "$(cat <<'BODY'
## Scope

RQ-006 specified three surfaces for the Link Take. Surfaces 1 and 2 shipped; the newsletter
one did not, so the verified original prose reached nobody and the email kept sending
`Article.summary`.

An editor can now flag a story in an edition to send its Link Take instead. Off by default,
per story, per edition.

## What changed

- `EditionArticle.useLinkTake`, carried through the PATCH that deletes and recreates join rows.
- `linkTakeBodyHtml` and `linkTakeBlock` in `lib/email/edition-blocks.ts`, so the code renderer
  and the Unlayer merge tags both get it without either being touched.
- A flagged top story drops to single column and omits its image.
- The take is frozen into `sentSnapshot`, so regenerating one after a send cannot rewrite what
  subscribers received.
- A flagged story with no usable take blocks the send: a Send Readiness card, and a 409 from
  `/api/email/send-all` so the gate is not UI-only.

## RQ-006 rules

Rule 5 (attribution always rendered) and rule 7 (the AI label, in the prose's language via
`aiLabelFor`) are both tested. Rule 6 (no source images) holds because `parseBlocks` emits
neither anchors nor images; the test for that names the reason so a future parser change does
not quietly undo it.

## Testing

Unit tests for the emitter, both render branches, the usable-take predicate, readiness, and the
carry-through. The existing edition and merge-tag suites prove an edition with nothing flagged
renders byte-identically.

## Not applied

`prisma/schema.prisma` gained a column and **the migration has not been applied**. The database
is shared with production, so applying it is Julian's call.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

Report the PR green and stop. **Do not merge.** Merging deploys to production and is Julian's call.

---

## Notes for whoever executes this

- The branch `docs/link-take-in-edition` already exists and holds the spec and the analysis docs.
  Work on it; do not branch again.
- Task 4 changes `prisma/schema.prisma` and deliberately does not apply it. Everything through
  Task 7 is testable without the column existing in the database, because every test is a pure
  function. Task 8 step 6 is the first thing that needs it.
- If a task's file has moved or a signature differs from what is written here, the plan is wrong and
  the code is right. Say so in your report rather than reshaping the code to match the plan.
