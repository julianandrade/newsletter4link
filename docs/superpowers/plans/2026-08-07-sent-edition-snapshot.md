# Sent Edition Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sent edition carries its own frozen copy of what went out, so editing or discarding an article afterwards can never rewrite a newsletter subscribers already received.

**Architecture:** One nullable `Json` column on `Edition`, written in the same statement that marks the edition `SENT`, holding the exact `EditionInput` the renderer was given. Every surface that renders a sent edition (the subscriber archive, the dashboard preview) reads the snapshot when it is there and falls back to live rows when it is not, so the forty editions already sent keep rendering. The snapshot stores data rather than HTML, because the three subscriber-bound URLs must still resolve per recipient at read time.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + PostgreSQL (Supabase), TypeScript, Vitest.

## Global Constraints

- **No long dashes anywhere.** No em dash (U+2014), en dash (U+2013), horizontal bar (U+2015), or minus sign (U+2212) used as punctuation. Use a comma, a hyphen (`-`), or a colon. Applies to code, comments, commit messages and this plan's output.
- Dashboard and code comments are in English. Only generated newsletter content follows the organization's language.
- Tests are pure unit tests under `tests/unit/`, using hand-written fake `db` objects that record their arguments. There is no test database and no route-handler integration harness in this repo. Follow the shape in `tests/unit/candidate-pool.test.ts`.
- Run `npx vitest run` for suites and `npx tsc --noEmit` for types. The suites do not replace the typecheck.
- Comments explain *why*, not *what*. Match the density of the surrounding file.
- Never set `edition.week`, `edition.year` or `edition.weeklySlot` by hand. They are written only by `lib/editions/identity.ts`.
- Do not run `git stash`, switch branches, or create worktrees.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/editions/sent-snapshot.ts` (create) | The snapshot's shape, how one is built from what the send route already assembled, how one is validated on the way back out of `Json`, and which source a render should use. Pure: no Prisma, no fetch. |
| `tests/unit/sent-snapshot.test.ts` (create) | Everything in the above, asserted without a database. |
| `prisma/schema.prisma` (modify, `model Edition`) | The `sentSnapshot Json?` column. |
| `prisma/sql/2026-08-07-sent-snapshot.sql` (create) | The one-off SQL, since this project applies schema changes with `prisma db push` and keeps hand-run SQL under `prisma/sql/`. |
| `lib/queries.ts` (modify, `markEditionAsSent`) | Writes the snapshot and the sent status in one statement, so an edition can never be `SENT` without its record. |
| `app/api/email/send-all/route.ts` (modify) | Builds the snapshot from the `emailData` it already has and hands it to `markEditionAsSent`. |
| `app/editions/[id]/page.tsx` (modify) | The subscriber archive renders from the snapshot when there is one. |
| `app/api/email/preview/route.ts` (modify) | The dashboard preview of a sent edition renders from the snapshot when there is one. |

---

### Task 1: The snapshot's shape, and the functions around it

**Files:**
- Create: `lib/editions/sent-snapshot.ts`
- Test: `tests/unit/sent-snapshot.test.ts`

**Interfaces:**
- Consumes: `SourceArticle`, `SourceProject` and `EditionInput` from `lib/email/edition-data.ts` (types only).
- Produces:
  - `SENT_SNAPSHOT_VERSION: 1`
  - `interface SentSnapshot`
  - `buildSentSnapshot(input: BuildSnapshotInput): SentSnapshot`
  - `isSentSnapshot(value: unknown): value is SentSnapshot`
  - `renderSourceFor(edition: RenderSourceEdition): RenderSource`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/sent-snapshot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SENT_SNAPSHOT_VERSION,
  buildSentSnapshot,
  isSentSnapshot,
  renderSourceFor,
} from "@/lib/editions/sent-snapshot";

/**
 * The snapshot is the only record of what a subscriber received. These tests are its
 * contract: what goes in, what survives a round trip through a Json column, and which
 * source a render picks when both a snapshot and live rows exist.
 */

const snapshotInput = () => ({
  articles: [
    {
      title: "A model ships",
      summary: "Two sentences on why it matters.",
      sourceUrl: "https://example.test/a1",
      category: ["Models"],
      relevanceScore: 8.5,
      content: "<p>Body <img src='https://example.test/i.png'></p>",
    },
  ],
  projects: [
    {
      name: "Radar",
      description: "Internal work",
      team: "Delivery",
      impact: "Faster reviews",
      projectDate: new Date("2026-07-20T00:00:00.000Z"),
    },
  ],
  week: 32,
  year: 2026,
  label: "Week 32",
  subject: "AI Radar Weekly - Week 32, 2026",
  templateId: null,
});

describe("buildSentSnapshot", () => {
  it("stamps the version, so a later shape change can be told apart", () => {
    expect(buildSentSnapshot(snapshotInput()).version).toBe(SENT_SNAPSHOT_VERSION);
  });

  it("keeps every article field the renderer reads", () => {
    const snapshot = buildSentSnapshot(snapshotInput());

    expect(snapshot.articles).toEqual([
      {
        title: "A model ships",
        summary: "Two sentences on why it matters.",
        sourceUrl: "https://example.test/a1",
        category: ["Models"],
        relevanceScore: 8.5,
        content: "<p>Body <img src='https://example.test/i.png'></p>",
      },
    ]);
  });

  it("normalises absent optional fields to null rather than dropping the key", () => {
    // A Json column round trip drops undefined. Dropping the key would make a later
    // reader unable to tell "no summary" from "an older snapshot shape".
    const snapshot = buildSentSnapshot({
      ...snapshotInput(),
      articles: [
        { title: "Bare", sourceUrl: "https://example.test/b" } as never,
      ],
      projects: [{ name: "Bare project", description: "d" } as never],
    });

    expect(snapshot.articles[0]).toEqual({
      title: "Bare",
      summary: null,
      sourceUrl: "https://example.test/b",
      category: [],
      relevanceScore: null,
      content: null,
    });
    expect(snapshot.projects[0]).toEqual({
      name: "Bare project",
      description: "d",
      team: "",
      impact: null,
      projectDate: null,
    });
  });

  it("writes dates as ISO strings, because a Date does not survive a Json column", () => {
    expect(buildSentSnapshot(snapshotInput()).projects[0].projectDate).toBe(
      "2026-07-20T00:00:00.000Z"
    );
  });

  it("survives a JSON round trip unchanged", () => {
    const snapshot = buildSentSnapshot(snapshotInput());

    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});

describe("isSentSnapshot", () => {
  it("accepts what buildSentSnapshot produced, after a round trip", () => {
    const stored = JSON.parse(JSON.stringify(buildSentSnapshot(snapshotInput())));

    expect(isSentSnapshot(stored)).toBe(true);
  });

  it("refuses anything that is not a snapshot", () => {
    // The column is nullable and untyped, and every one of these is a value it can
    // actually hold: null on the forty editions sent before this existed, and the
    // rest are what a hand-written UPDATE could leave behind.
    expect(isSentSnapshot(null)).toBe(false);
    expect(isSentSnapshot(undefined)).toBe(false);
    expect(isSentSnapshot("{}")).toBe(false);
    expect(isSentSnapshot([])).toBe(false);
    expect(isSentSnapshot({})).toBe(false);
    expect(isSentSnapshot({ version: 1, articles: "no", projects: [] })).toBe(false);
    expect(isSentSnapshot({ version: 1, articles: [], projects: [] })).toBe(false);
  });
});

describe("renderSourceFor", () => {
  const live = {
    sentSnapshot: null as unknown,
    title: null as string | null,
    week: 32,
    year: 2026,
    articles: [
      {
        article: {
          title: "Live title",
          summary: "Live summary",
          sourceUrl: "https://example.test/live",
          category: ["Models"],
          relevanceScore: 7,
          content: null,
        },
      },
    ],
    projects: [
      {
        project: {
          name: "Live project",
          description: "d",
          team: "Delivery",
          impact: null,
        },
      },
    ],
  };

  it("uses the live rows when there is no snapshot", () => {
    const source = renderSourceFor(live);

    expect(source.frozen).toBe(false);
    expect(source.articles[0].title).toBe("Live title");
    expect(source.label).toBe("Week 32");
  });

  it("uses the snapshot when there is one, and ignores the live rows entirely", () => {
    const source = renderSourceFor({
      ...live,
      sentSnapshot: JSON.parse(
        JSON.stringify(buildSentSnapshot(snapshotInput()))
      ),
    });

    expect(source.frozen).toBe(true);
    expect(source.articles).toHaveLength(1);
    expect(source.articles[0].title).toBe("A model ships");
    expect(source.label).toBe("Week 32");
  });

  it("still renders a story the snapshot kept after the article row was discarded", () => {
    // The whole point. The join rows are gone and the edition still reads as sent.
    const source = renderSourceFor({
      ...live,
      articles: [],
      projects: [],
      sentSnapshot: JSON.parse(
        JSON.stringify(buildSentSnapshot(snapshotInput()))
      ),
    });

    expect(source.articles[0].title).toBe("A model ships");
    expect(source.projects[0].name).toBe("Radar");
  });

  it("falls back to the live rows when the stored value is not a snapshot", () => {
    // Fail open to something renderable rather than to an empty edition: a corrupted
    // column must not turn an archive link into a blank page.
    const source = renderSourceFor({ ...live, sentSnapshot: { nonsense: true } });

    expect(source.frozen).toBe(false);
    expect(source.articles[0].title).toBe("Live title");
  });

  it("prefers the edition's own title over the derived week label", () => {
    const source = renderSourceFor({ ...live, title: "  The agents issue  " });

    expect(source.label).toBe("The agents issue");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/sent-snapshot.test.ts`
Expected: FAIL, with a resolution error on `@/lib/editions/sent-snapshot`.

- [ ] **Step 3: Write the implementation**

Create `lib/editions/sent-snapshot.ts`:

```ts
import { editionEmailLabel } from "@/lib/editions/identity";
import type { SourceArticle, SourceProject } from "@/lib/email/edition-data";

/**
 * What actually went out, frozen at the send.
 *
 * Every surface that shows a sent edition used to rebuild it from the current `Article`
 * rows: `app/editions/[id]/page.tsx`, the dashboard preview, and the send route itself.
 * Editing a summary after a send therefore rewrote the newsletter subscribers had already
 * received, and deleting an article removed the story from it, because
 * `EditionArticle.article` cascades. That made "let me edit and delete articles freely"
 * and "let me see what we actually sent" mutually exclusive. This is the record that
 * separates them.
 *
 * Data rather than HTML, deliberately. The three subscriber-bound URLs are resolved per
 * recipient inside the send loop (`lib/email/personalize.ts`), so a stored HTML string
 * would either be one recipient's copy or a shell needing a second personalisation path
 * to maintain. Storing the renderer's input keeps one path and one template.
 *
 * Pure on purpose: no Prisma, no fetch. The send route builds one, `lib/queries.ts`
 * writes it, and the read surfaces choose between it and the live rows.
 */

/** Bumped only if the stored shape changes in a way a reader must notice. */
export const SENT_SNAPSHOT_VERSION = 1;

export interface SentSnapshotArticle {
  title: string;
  summary: string | null;
  sourceUrl: string;
  category: string[];
  relevanceScore: number | null;
  /** Only the lead's is read, to find the top story's image. See content-image.ts. */
  content: string | null;
}

export interface SentSnapshotProject {
  name: string;
  description: string;
  team: string;
  impact: string | null;
  /** ISO 8601. A Date does not survive a Json column. */
  projectDate: string | null;
}

export interface SentSnapshot {
  version: number;
  articles: SentSnapshotArticle[];
  projects: SentSnapshotProject[];
  week: number;
  year: number;
  /** What the email called this edition, as the masthead and subject printed it. */
  label: string;
  /** The subject line as sent, so the history does not have to re-derive it. */
  subject: string;
  /** Which stored template rendered it. Null means the built-in edition. */
  templateId: string | null;
}

export interface BuildSnapshotInput {
  articles: Array<Partial<SourceArticle> & { title: string; sourceUrl: string }>;
  projects: Array<Partial<SourceProject> & { name: string; description: string }>;
  week: number;
  year: number;
  label: string;
  subject: string;
  templateId: string | null;
}

function toSnapshotArticle(
  article: BuildSnapshotInput["articles"][number]
): SentSnapshotArticle {
  return {
    title: article.title,
    summary: article.summary ?? null,
    sourceUrl: article.sourceUrl,
    category: article.category ?? [],
    relevanceScore: article.relevanceScore ?? null,
    content: article.content ?? null,
  };
}

function toSnapshotProject(
  project: BuildSnapshotInput["projects"][number]
): SentSnapshotProject {
  const date = project.projectDate;

  return {
    name: project.name,
    description: project.description,
    team: project.team ?? "",
    impact: project.impact ?? null,
    projectDate:
      date instanceof Date ? date.toISOString() : typeof date === "string" ? date : null,
  };
}

export function buildSentSnapshot(input: BuildSnapshotInput): SentSnapshot {
  return {
    version: SENT_SNAPSHOT_VERSION,
    articles: input.articles.map(toSnapshotArticle),
    projects: input.projects.map(toSnapshotProject),
    week: input.week,
    year: input.year,
    label: input.label,
    subject: input.subject,
    templateId: input.templateId,
  };
}

/**
 * Whether a value read back out of the `Json` column is one of ours.
 *
 * The column is nullable and untyped. Null is the honest answer for every edition sent
 * before this existed, and those must keep rendering from the live rows rather than
 * throwing, so this is a guard and not a parser.
 *
 * An empty `articles` array is refused as well as a non-array one. A snapshot with no
 * stories is indistinguishable from a failed write, and falling back to the live rows is
 * strictly better than rendering an empty edition.
 */
export function isSentSnapshot(value: unknown): value is SentSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const candidate = value as Partial<SentSnapshot>;

  return (
    typeof candidate.version === "number" &&
    Array.isArray(candidate.articles) &&
    candidate.articles.length > 0 &&
    Array.isArray(candidate.projects) &&
    typeof candidate.week === "number" &&
    typeof candidate.year === "number"
  );
}

export interface RenderSourceEdition {
  sentSnapshot: unknown;
  title: string | null;
  week: number;
  year: number;
  articles: Array<{
    article: {
      title: string;
      summary: string | null;
      sourceUrl: string;
      category: string[];
      relevanceScore: number | null;
      content?: string | null;
    };
  }>;
  projects: Array<{
    project: {
      name: string;
      description: string;
      team: string;
      impact: string | null;
    };
  }>;
}

export interface RenderSource {
  articles: SourceArticle[];
  projects: SourceProject[];
  week: number;
  year: number;
  label: string;
  /** True when this came from the snapshot, so a screen can say "as sent". */
  frozen: boolean;
}

/**
 * Which copy of an edition a render should use.
 *
 * The snapshot wins whenever there is one. There is no merging: a half-frozen edition,
 * where the titles are historical and the summaries current, is worse than either.
 */
export function renderSourceFor(edition: RenderSourceEdition): RenderSource {
  const snapshot = edition.sentSnapshot;

  if (isSentSnapshot(snapshot)) {
    return {
      articles: snapshot.articles.map((article) => ({
        title: article.title,
        summary: article.summary,
        sourceUrl: article.sourceUrl,
        category: article.category,
        relevanceScore: article.relevanceScore,
        content: article.content,
      })),
      projects: snapshot.projects.map((project) => ({
        name: project.name,
        description: project.description,
        team: project.team,
        impact: project.impact,
        ...(project.projectDate ? { projectDate: project.projectDate } : {}),
      })),
      week: snapshot.week,
      year: snapshot.year,
      label: snapshot.label,
      frozen: true,
    };
  }

  return {
    articles: edition.articles.map((row) => ({
      title: row.article.title,
      summary: row.article.summary,
      sourceUrl: row.article.sourceUrl,
      category: row.article.category,
      relevanceScore: row.article.relevanceScore,
      content: row.article.content ?? null,
    })),
    projects: edition.projects.map((row) => ({
      name: row.project.name,
      description: row.project.description,
      team: row.project.team,
      impact: row.project.impact,
    })),
    week: edition.week,
    year: edition.year,
    label: editionEmailLabel({ title: edition.title, week: edition.week }),
    frozen: false,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/sent-snapshot.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/editions/sent-snapshot.ts tests/unit/sent-snapshot.test.ts
git commit -m "Editions: the shape of what was sent, and how to read it back"
```

---

### Task 2: The column, written in the same statement that marks an edition sent

**Files:**
- Modify: `prisma/schema.prisma` (`model Edition`, after the `sentAt` field near line 387)
- Create: `prisma/sql/2026-08-07-sent-snapshot.sql`
- Modify: `lib/queries.ts:162-170` (`markEditionAsSent`)
- Test: `tests/unit/sent-snapshot-write.test.ts`

**Interfaces:**
- Consumes: `SentSnapshot` from Task 1.
- Produces: `markEditionAsSent(editionId: string, sentSnapshot?: SentSnapshot)`, unchanged for callers that pass one argument.

- [ ] **Step 1: Add the column to the schema**

In `prisma/schema.prisma`, inside `model Edition`, immediately after the `sentAt DateTime?` line:

```prisma
  /**
   * What actually went out, frozen at the send. See lib/editions/sent-snapshot.ts.
   *
   * Null on every edition sent before this existed, and on every edition not yet sent.
   * A reader must handle null by falling back to the live rows, which is what
   * `renderSourceFor` does.
   */
  sentSnapshot Json?
```

- [ ] **Step 2: Write the one-off SQL**

Create `prisma/sql/2026-08-07-sent-snapshot.sql`:

```sql
-- The frozen copy of a sent edition. See lib/editions/sent-snapshot.ts.
--
-- Nullable with no default and no backfill: the editions already sent have no record of
-- what they contained, and inventing one from today's article rows would be a lie in the
-- exact column meant to stop lies. They keep rendering from the live rows.
ALTER TABLE "Edition" ADD COLUMN IF NOT EXISTS "sentSnapshot" JSONB;
```

- [ ] **Step 3: Apply the schema and regenerate the client**

Run: `npx prisma db push && npx prisma generate`
Expected: `Your database is now in sync with your Prisma schema.` and a regenerated client.

- [ ] **Step 4: Write the failing test**

Create `tests/unit/sent-snapshot-write.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSentSnapshot } from "@/lib/editions/sent-snapshot";

/**
 * An edition must never be able to reach SENT without its snapshot.
 *
 * Two statements would allow it: the mail goes out, the status write lands, the snapshot
 * write fails, and the archive silently renders live rows for ever after with nothing
 * recording that it is doing so. One statement makes that state unreachable.
 */

const calls: Array<{ method: string; args: any }> = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    edition: {
      update: (args: unknown) => {
        calls.push({ method: "update", args });
        return Promise.resolve({ id: "ed-1" });
      },
    },
  },
}));

import { markEditionAsSent } from "@/lib/queries";

const snapshot = () =>
  buildSentSnapshot({
    articles: [{ title: "A model ships", sourceUrl: "https://example.test/a1" }],
    projects: [],
    week: 32,
    year: 2026,
    label: "Week 32",
    subject: "AI Radar Weekly - Week 32, 2026",
    templateId: null,
  });

beforeEach(() => {
  calls.length = 0;
});

describe("markEditionAsSent", () => {
  it("writes the status and the snapshot in one statement", async () => {
    await markEditionAsSent("ed-1", snapshot());

    expect(calls).toHaveLength(1);
    expect(calls[0].args.where).toEqual({ id: "ed-1" });
    expect(calls[0].args.data.status).toBe("SENT");
    expect(calls[0].args.data.sentAt).toBeInstanceOf(Date);
    expect(calls[0].args.data.sentSnapshot.articles[0].title).toBe("A model ships");
  });

  it("omits the column entirely when no snapshot is given", async () => {
    // Not `sentSnapshot: null`. A caller with nothing to record must not overwrite a
    // snapshot that is already there.
    await markEditionAsSent("ed-1");

    expect("sentSnapshot" in calls[0].args.data).toBe(false);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run tests/unit/sent-snapshot-write.test.ts`
Expected: FAIL. The first test fails on `calls[0].args.data.sentSnapshot` being undefined.

- [ ] **Step 6: Change `markEditionAsSent`**

In `lib/queries.ts`, replace the whole `markEditionAsSent` function (currently lines 159-170) with:

```ts
/**
 * Mark edition as sent (uses raw prisma - verify ownership before calling)
 *
 * The snapshot goes in the same statement, so an edition can never be SENT without the
 * record of what it contained. See lib/editions/sent-snapshot.ts for why that record has
 * to exist at all.
 */
export async function markEditionAsSent(
  editionId: string,
  sentSnapshot?: SentSnapshot
) {
  return await prisma.edition.update({
    where: { id: editionId },
    data: {
      status: "SENT",
      sentAt: new Date(),
      // Omitted rather than set to null when absent: a caller with nothing to record
      // must not erase a snapshot that is already there.
      ...(sentSnapshot === undefined
        ? {}
        : { sentSnapshot: sentSnapshot as unknown as Prisma.InputJsonValue }),
    },
  });
}
```

And add to the imports at the top of `lib/queries.ts`:

```ts
import { Prisma } from "@prisma/client";
import type { SentSnapshot } from "@/lib/editions/sent-snapshot";
```

Note the existing line 3 already imports `ArticleStatus` from `@prisma/client`; merge `Prisma` into that import rather than adding a second one.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run tests/unit/sent-snapshot-write.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 8: Run the whole suite and the typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: both clean. `markEditionAsSent` gained an optional parameter, so its one existing caller still compiles.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/sql/2026-08-07-sent-snapshot.sql lib/queries.ts tests/unit/sent-snapshot-write.test.ts
git commit -m "Editions: a sent edition carries what it contained, written with the status"
```

---

### Task 3: The send route records what it sent

**Files:**
- Modify: `app/api/email/send-all/route.ts:486-508`
- Test: covered by Task 1 and Task 2. This task adds no new pure logic, only the call site.

**Interfaces:**
- Consumes: `buildSentSnapshot` from Task 1, `markEditionAsSent(id, snapshot)` from Task 2, and `newsletterSubject` already imported at line 6.
- Produces: nothing new.

- [ ] **Step 1: Add the import**

In `app/api/email/send-all/route.ts`, after the `personalizeHtml` import on line 27:

```ts
import { buildSentSnapshot } from "@/lib/editions/sent-snapshot";
```

- [ ] **Step 2: Build and pass the snapshot**

Replace lines 486-493, which currently read:

```ts
    // Mark edition and draft as sent/used
    if (result.sent > 0) {
      // RQ-005 BR-011: a sent edition must be able to say who approved the send
      // and when. The columns existed and nothing wrote them, so every edition
      // sent so far answers "unknown". Written in the same step that marks it
      // sent, and only if it is not already set, because an approval is a fact
      // about the first send rather than the latest one.
      await markEditionAsSent(edition.id);
```

with:

```ts
    // Mark edition and draft as sent/used
    if (result.sent > 0) {
      /**
       * The snapshot is built from `emailData`, which is exactly what the renderer was
       * given, whichever of the three branches above produced it: custom data from the
       * editor, an approved draft, or the edition's own rows. Rebuilding it from the
       * database here would record something other than what went out on two of those
       * three paths.
       */
      const snapshot = buildSentSnapshot({
        articles: emailData.articles ?? [],
        projects: emailData.projects ?? [],
        week: emailData.week,
        year: emailData.year,
        label: emailData.label ?? `Week ${emailData.week}`,
        subject: newsletterSubject(emailData as any),
        templateId: effectiveTemplateId,
      });

      // RQ-005 BR-011: a sent edition must be able to say who approved the send
      // and when. The columns existed and nothing wrote them, so every edition
      // sent so far answers "unknown". Written in the same step that marks it
      // sent, and only if it is not already set, because an approval is a fact
      // about the first send rather than the latest one.
      await markEditionAsSent(edition.id, snapshot);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. `emailData` is `any` in this route, so the spread compiles; the snapshot builder is what enforces the shape.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run`
Expected: all green, no change in count from Task 2.

- [ ] **Step 5: Commit**

```bash
git add app/api/email/send-all/route.ts
git commit -m "Send: record what went out, on the way to marking the edition sent"
```

---

### Task 4: The subscriber archive reads the snapshot

**Files:**
- Modify: `app/editions/[id]/page.tsx:65-120`
- Test: `tests/unit/sent-snapshot.test.ts` already covers `renderSourceFor`. This task wires it.

**Interfaces:**
- Consumes: `renderSourceFor` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Add the import**

In `app/editions/[id]/page.tsx`, after the `editionEmailLabel` import on line 6:

```ts
import { renderSourceFor } from "@/lib/editions/sent-snapshot";
```

`editionEmailLabel` is no longer used directly in this file after Step 2, because `renderSourceFor` produces the label. Remove that import line.

- [ ] **Step 2: Select the snapshot and render from it**

Replace lines 65-120, from `const edition = await prisma.edition.findFirst({` through the closing `});` of the `buildEditionEmail` call, with:

```ts
  const edition = await prisma.edition.findFirst({
    where: { id, organizationId: access.organizationId },
    select: {
      id: true,
      title: true,
      week: true,
      year: true,
      // The frozen copy. When it is there it is the whole answer, and the joins below are
      // read only for editions sent before this column existed.
      sentSnapshot: true,
      articles: {
        orderBy: { order: "asc" },
        select: {
          article: {
            select: {
              title: true,
              summary: true,
              sourceUrl: true,
              category: true,
              relevanceScore: true,
              // Only the lead's is read, to find the top story's image.
              content: true,
            },
          },
        },
      },
      projects: {
        select: {
          project: {
            select: { name: true, description: true, team: true, impact: true },
          },
        },
      },
    },
  });
  if (!edition) notFound();

  /**
   * The snapshot wins whenever there is one.
   *
   * Without this the archive re-rendered from the live `Article` rows, so an edit to a
   * summary rewrote a newsletter that had already been delivered, and discarding an
   * article removed the story from it entirely.
   */
  const source = renderSourceFor(edition);

  const email = buildEditionEmail({
    articles: source.articles,
    projects: source.projects,
    week: source.week,
    year: source.year,
    label: source.label,
    unsubscribeUrl: buildUnsubscribeUrl(subscriberId),
    archiveUrl: buildArchiveUrl(edition.id, subscriberId),
    portalUrl: buildEditionIndexUrl(subscriberId),
  });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add app/editions/[id]/page.tsx
git commit -m "Archive: a sent edition renders what was sent, not what the articles say now"
```

---

### Task 5: The dashboard preview of a sent edition reads the snapshot

**Files:**
- Modify: `app/api/email/preview/route.ts:67-83` and the `emailData` assembly that follows it
- Test: `tests/unit/sent-snapshot.test.ts` already covers the choosing logic.

**Interfaces:**
- Consumes: `renderSourceFor` from Task 1.
- Produces: an extra `frozen: boolean` field on the preview response body, so the screen can label the preview.

- [ ] **Step 1: Add the import**

In `app/api/email/preview/route.ts`, after the `editionEmailLabel` import on line 14:

```ts
import { renderSourceFor } from "@/lib/editions/sent-snapshot";
```

- [ ] **Step 2: Select the snapshot on the edition lookup**

In the `if (editionId)` branch at lines 70-83, add `sentSnapshot: true` to the query. The lookup currently uses `include`, which returns every scalar column already, so `sentSnapshot` arrives with no change. Confirm by reading the branch: if it uses `include`, no edit is needed here and this step is a no-op to be ticked after checking. If it has been changed to `select`, add `sentSnapshot: true`.

- [ ] **Step 3: Render a sent edition from its snapshot**

Find the `emailData` assembly that consumes the fetched `edition` further down the same handler. Immediately before it, insert:

```ts
      /**
       * A sent edition previews as it was sent.
       *
       * Same reasoning as the subscriber archive: this screen is how an editor checks what
       * went out, and rebuilding it from the current article rows makes it a preview of
       * what would go out today instead.
       */
      const source = edition ? renderSourceFor(edition as never) : null;
```

and use `source.articles`, `source.projects`, `source.week`, `source.year` and `source.label` in place of the per-row mapping wherever the assembly reads `edition.articles`, `edition.projects`, `edition.week`, `edition.year` and `editionEmailLabel(edition)`.

- [ ] **Step 4: Report which copy was rendered**

In the handler's success response, add `frozen: source?.frozen ?? false` alongside the HTML it already returns, so a caller can label the preview "as sent" rather than implying it is live.

- [ ] **Step 5: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean.

- [ ] **Step 6: Verify against the running app**

Run: `npm run dev` and open the send screen. Preview a sent edition, then edit the summary of one of its articles from the article detail screen, then preview that edition again.
Expected: the preview is unchanged both times. Before this plan it would have shown the edited summary.

If no edition in the local database has a snapshot, this check cannot pass on old data. Send a test edition first so one exists, or state plainly in the commit that the check was run against a newly sent edition only.

- [ ] **Step 7: Commit**

```bash
git add app/api/email/preview/route.ts
git commit -m "Preview: a sent edition previews as it was sent"
```

---

## Self-Review

**Spec coverage.** The user asked for one historical guarantee: access to what was sent, including previewing the sent newsletter. Task 2 stores it, Task 3 writes it, Task 4 serves it to the subscriber, Task 5 serves it to the editor. The decision to store data rather than HTML is Task 1's module comment.

**Editions already sent: not a constraint.** This product has never gone to real recipients. Every edition and article in the database is test data, and Julian intends to wipe both. So the absence of a snapshot on existing editions needs no design work: they keep rendering from live rows, which is today's behaviour, and the fallback in `renderSourceFor` exists for robustness rather than for a migration. Do not add a backfill, and do not soften any step here to protect an existing row.

**Wanted, and not in either plan.** A way to clear the editions and reset them, and to clear articles. Worth its own small plan once these two land, because the shape of a reset depends on what a discard already does.

**Not covered here.** `lib/sharepoint.ts` publishes an edition after a send and was not read during this plan. If it re-renders from live rows it has the same defect, and it is a one-line change to point it at `renderSourceFor`. Check it before closing the plan.
