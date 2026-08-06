# Editable AI Radar Weekly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two editable variants of the AI Radar Weekly email alongside the code-rendered
original, fix the masthead that prints the year twice and breaks on a named edition, and make
per-recipient links actually reach recipients.

**Architecture:** The code renderer stays and becomes the source of the fragments everything
else reuses. A single merge-tag table replaces two hand-maintained lists that have already
drifted. Unlayer holds the frame; anything that repeats N times stays a merge tag, because
design JSON has no loop. What Unlayer cannot emit (MSO conditionals, the `[data-ogsc]` dark
mirror, rows that vanish when empty) is reinstated by one pure string function applied after
substitution, on both the send path and the preview path.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7 + PostgreSQL (Supabase),
`react-email-editor` (Unlayer), Resend, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-editable-radar-template-design.md`

## Global Constraints

- **No dash wider than a hyphen, anywhere.** No em dash, en dash, horizontal bar, or minus
  sign used as punctuation. Applies to prose, code, comments, commit messages, and generated
  HTML. Use a comma, a hyphen, or a colon.
- **Client-safe modules stay client-safe.** `lib/email/content-renderer.ts`,
  `lib/email/edition-data.ts`, `lib/email/edition-template.ts`, `lib/email/merge-tags.ts`,
  `lib/email/edition-blocks.ts`, `lib/email/harden-export.ts`, `lib/radar/week.ts` and
  `lib/editions/identity.ts` must not import `@prisma/client`, `node:crypto`, or anything
  that does. They are reachable from client components.
- **Every interpolated value is escaped** with `escapeHtml` from
  `lib/email/edition-template.ts`. Titles and summaries come from RSS and from model output.
- **Files stay under ~500 LOC.** `lib/email/edition-template.ts` is currently 631 and Task 5
  brings it down.
- Tests: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. Both must pass before each
  commit.
- Commit messages use `Area: action description`, for example `Email: the masthead names the
  week once`.
- UI copy is English. The newsletter's generated content follows the org language; chrome
  does not.
- Do not create, apply or drop a `git stash`. Do not switch branches. Do not touch
  `docs/0-work/`.

## Concurrency warning, read before Task 1

Another session committed `0b1a4c1..99473ae` while this plan was being written and touched
four files this plan also needs:

| File | They changed it | This plan needs it in |
|---|---|---|
| `app/api/email/send-all/route.ts` | yes | Task 8 |
| `app/api/email/preview/route.ts` | yes | Task 3 |
| `app/api/email/send-test/route.ts` | yes | Task 3, Task 8 |
| `prisma/schema.prisma` | yes, added `Article.capturedAt` | Task 14 |
| `lib/curation/rss-collector.ts` | yes | Task 14 |
| `app/radar-preview/harness.tsx` | yes | Task 3 |

Every line number in this plan was re-read at `99473ae`. **Re-verify each one before editing**,
with a `Grep` for the quoted code rather than trusting the number. If a number has moved,
the surrounding code is what identifies the site.

**They then committed twice more, to `065e688`, and stopped.** Their `STATUS.md` opens with
"Everything is committed and pushed, production is deployed and healthy, and nothing is left
running", so the tree is clean and this plan is clear to run. What changed between `99473ae`
and `065e688`, and what it means here:

| Their change | Impact on this plan |
|---|---|
| `Article.sourceId`, `Article.inboundEmailId` added | Task 14 adds `imageUrl` beside them. Additive, re-read the model first. |
| `lib/curation/rss-collector.ts` now writes `sourceId` | Task 14 writes `imageUrl` at the same creation site. Same function, additive. |
| `app/radar-preview/harness.tsx` touched twice | Task 3's five sites moved. `Grep` for `editionLabel(` rather than using the numbers. |
| Tenant client scopes `update` and `delete` on 13 models | Task 10 reads from a public route with no org context, so it uses raw `prisma` and scopes by hand. Written into that task. |
| `publishedAt` is now nullable, `capturedAt` is new | Nothing here reads either. No impact. |
| 901 unit tests, `tsc` clean, `next build` clean | That is the baseline. `npx vitest run` should show 901 passing before Task 1 begins. |

`app/api/email/send-all/route.ts`, `preview/route.ts` and `send-test/route.ts` were **not**
touched by the last two commits, so the line numbers quoted for Tasks 3 and 8 still hold.

## File structure

**Created**

| File | Responsibility |
|---|---|
| `lib/email/merge-tags.ts` | The one tag table. Names, labels, samples, and the substitution regex built from it. Marks which tags are per recipient. |
| `lib/email/edition-blocks.ts` | The HTML fragment renderers, extracted from `edition-template.ts` so v1 and the merge tags emit identical markup. |
| `lib/email/harden-export.ts` | Post-substitution pass: inject dark mode, wrap the dark logo in an MSO conditional, drop empty optional rows. |
| `lib/email/archive-url.ts` | Builds the signed archive and index URLs. Server only (needs crypto). |
| `app/editions/page.tsx` | The index of editions a signed subscriber received. |
| `app/editions/[id]/page.tsx` | One edition, rendered from the same blocks the email uses. |
| `scripts/templates/radar-frame.ts` | v2 design JSON builder. |
| `scripts/templates/radar-unlayer.ts` | v3 design JSON builder. |
| `tests/unit/week-range.test.ts` | `weekRangeLabel`. |
| `tests/unit/merge-tags.test.ts` | Tag table, substitution, and the anti-divergence assertion. |
| `tests/unit/harden-export.test.ts` | The three transforms and idempotence. |
| `tests/unit/archive-token.test.ts` | Purpose scoping and legacy compatibility. |
| `tests/unit/per-recipient-send.test.ts` | Two subscribers in a batch get different links. |

**Modified**

| File | Change |
|---|---|
| `lib/radar/week.ts` | Add `weekRangeLabel`. |
| `lib/editions/identity.ts` | Add `editionEmailLabel`. |
| `lib/email/edition-data.ts` | `dateLabel` becomes the week range; `isWeekLabel` accepts both label shapes; the TL;DR field is renamed. |
| `lib/email/edition-template.ts` | Import fragments from `edition-blocks.ts`; masthead stacks on mobile; `View in browser` row; CTA points at the index. |
| `lib/email/content-renderer.ts` | Substitution comes from the tag table. |
| `lib/email/template-renderer.ts` | Same table; per-recipient tags left standing. |
| `lib/email/unsubscribe-token.ts` | Purpose-scoped signing, with `unsubscribe` keeping the legacy input. |
| `components/template-editor.tsx` | `mergeTags` from the table. |
| `components/edition-unlayer-editor.tsx` | `mergeTags` from the table. |
| `middleware.ts` | `/editions` joins `publicPaths`. |
| `app/api/email/send-all/route.ts` | Per-recipient substitution inside the batch loop. |
| `app/api/email/send-test/route.ts` | Passes the subscriber through. |
| `app/api/email/preview/route.ts` | `editionEmailLabel`. |
| `app/radar-preview/harness.tsx` | `editionEmailLabel`. |
| `scripts/create-unlayer-templates.ts` | Seeds v2 and v3. |
| `prisma/schema.prisma` | `Article.imageUrl`, Task 14 only. |
| `lib/curation/rss-collector.ts` | Captures the feed's own image, Task 14 only. |

## Phases

Each phase ends with working, shippable software. Stop between phases if the other session
is active.

1. **The masthead tells the truth** (Tasks 1 to 4). v1 names the week once and survives a
   long title.
2. **One source of fragments and one table of tags** (Tasks 5 to 6). No behaviour change,
   proven by snapshot.
3. **Links reach recipients** (Tasks 7 to 10). Signed archive, and the unsubscribe link fixed
   on the three broken paths.
4. **Unlayer** (Tasks 11 to 13). v2 and v3 in the template list.
5. **The top story image** (Task 14). Droppable.

---

### Task 1: `weekRangeLabel`

**Files:**
- Modify: `lib/radar/week.ts` (append; the file is 79 lines)
- Test: `tests/unit/week-range.test.ts` (create)

**Interfaces:**
- Consumes: `isoWeekStart(week, year): Date` and `isoWeekEnd(week, year): Date`, already in
  `lib/radar/week.ts:63` and `:71`. Both are UTC.
- Produces: `weekRangeLabel(week: number, year: number): string`

Three output shapes. The trailing year is always the year the range **ends** in, so a week
that straddles New Year reads as the year it lands in:

```
weekRangeLabel(32, 2026)  ->  "3-9 Aug 2026"            same month
weekRangeLabel(31, 2026)  ->  "27 Jul - 2 Aug 2026"     across a month
weekRangeLabel(1,  2026)  ->  "29 Dec - 4 Jan 2026"     across a year
weekRangeLabel(53, 2026)  ->  "28 Dec - 3 Jan 2027"     across a year
```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/week-range.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { weekRangeLabel } from "@/lib/radar/week";

describe("weekRangeLabel", () => {
  it("collapses the month when the week does not leave it", () => {
    expect(weekRangeLabel(32, 2026)).toBe("3-9 Aug 2026");
  });

  it("names both months when the week crosses one", () => {
    expect(weekRangeLabel(31, 2026)).toBe("27 Jul - 2 Aug 2026");
  });

  it("takes the year the week ends in, not the week-year, on week 1", () => {
    expect(weekRangeLabel(1, 2026)).toBe("29 Dec - 4 Jan 2026");
  });

  it("takes the year the week ends in on week 53", () => {
    expect(weekRangeLabel(53, 2026)).toBe("28 Dec - 3 Jan 2027");
  });

  it("is UTC, so it does not shift for a caller east or west of the server", () => {
    // isoWeekStart is UTC; asserting the day of month is enough to catch a
    // local-time getter slipping in.
    expect(weekRangeLabel(32, 2026).startsWith("3-")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/week-range.test.ts`
Expected: FAIL, `weekRangeLabel is not a function` (or a TypeScript resolution error).

- [ ] **Step 3: Write the implementation**

Append to `lib/radar/week.ts`:

```ts
const MONTH_ABBREVIATIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * The week's date range, as in "3-9 Aug 2026".
 *
 * The masthead used to read "Week 31 · 2026 · 2026", because the edition label already
 * carried the year and the date label carried it again. The year now belongs to the date
 * and appears once, which is what this produces.
 *
 * The trailing year is the year the range ends in, not the ISO week-year: week 1 of 2026
 * starts on 29 December 2025 and a reader looking at it wants to see 2026.
 *
 * All arithmetic stays UTC, because isoWeekStart is UTC and reading it back in local time
 * shifts the day for anyone east or west of the server.
 */
export function weekRangeLabel(week: number, year: number): string {
  const start = isoWeekStart(week, year);
  const end = isoWeekEnd(week, year);

  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const startMonth = MONTH_ABBREVIATIONS[start.getUTCMonth()];
  const endMonth = MONTH_ABBREVIATIONS[end.getUTCMonth()];
  const endYear = end.getUTCFullYear();

  if (startMonth === endMonth && start.getUTCFullYear() === endYear) {
    return `${startDay}-${endDay} ${startMonth} ${endYear}`;
  }

  return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${endYear}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/week-range.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/radar/week.ts tests/unit/week-range.test.ts
git commit -m "Radar: a week can say which days it covers"
```

---

### Task 2: `editionEmailLabel`

**Files:**
- Modify: `lib/editions/identity.ts` (append; the file is 93 lines)
- Test: `tests/unit/edition-identity.test.ts` (extend; `editionLabel` is described at line 105)

**Interfaces:**
- Produces: `editionEmailLabel(edition: { title: string | null; week: number }): string`

`editionLabel` is not touched. Forty-odd screens and routes depend on its current
`"Week 32 · 2026"` shape. The email needs a label with no year in it, because Task 3 puts the
year in the date. Two functions, one for screens and one for the email, is the smaller change.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/edition-identity.test.ts`, and add `editionEmailLabel` to the import at
line 3:

```ts
describe("editionEmailLabel", () => {
  it("uses the title when the edition has one", () => {
    expect(editionEmailLabel({ title: "AI Act special", week: 32 })).toBe("AI Act special");
  });

  it("falls back to the week with no year, because the date carries the year", () => {
    expect(editionEmailLabel({ title: null, week: 32 })).toBe("Week 32");
  });

  it("treats whitespace as no title", () => {
    expect(editionEmailLabel({ title: "   ", week: 9 })).toBe("Week 9");
  });

  it("trims a title that has room around it", () => {
    expect(editionEmailLabel({ title: "  Year in review  ", week: 1 })).toBe("Year in review");
  });

  it("does not change what editionLabel returns", () => {
    expect(editionLabel({ title: null, week: 32, year: 2026 })).toBe("Week 32 · 2026");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/edition-identity.test.ts`
Expected: FAIL, `editionEmailLabel is not a function`. The last test passes already.

- [ ] **Step 3: Write the implementation**

Append to `lib/editions/identity.ts`:

```ts
/**
 * What the email calls this edition.
 *
 * Deliberately not `editionLabel`. That one returns "Week 32 · 2026" and forty-odd screens
 * read it, but the masthead concatenates the label with a date, so a label carrying the year
 * printed it twice: "WEEK 31 · 2026 · 2026". The year belongs to the date, so the email's
 * label drops it and `weekRangeLabel` supplies it once.
 */
export function editionEmailLabel(edition: {
  title: string | null;
  week: number;
}): string {
  const trimmed = edition.title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Week ${edition.week}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/edition-identity.test.ts`
Expected: PASS, all tests including the pre-existing `editionLabel` block.

- [ ] **Step 5: Commit**

```bash
git add lib/editions/identity.ts tests/unit/edition-identity.test.ts
git commit -m "Editions: the email label leaves the year to the date"
```

---

### Task 3: The masthead names the week once

**Files:**
- Modify: `lib/email/edition-data.ts:230-231` (the returned `editionLabel` and `dateLabel`) and
  `:171-177` (`isWeekLabel`)
- Modify: `app/api/email/send-all/route.ts:365` and `:387` (`label: editionLabel(edition)`)
- Modify: `app/api/email/preview/route.ts:185` and `:211` (`label: editionLabel({...})`)
- Modify: `app/api/email/send-test/route.ts` (the `buildEditionEmail` call, `Grep` for `label:`)
- Modify: `app/radar-preview/harness.tsx:511`, `:837`, `:844`, `:1019`, `:1052`
- Test: `tests/unit/edition-email.test.ts` (lines 434-502 assert the old shape and must change)

**Interfaces:**
- Consumes: `weekRangeLabel` from Task 1, `editionEmailLabel` from Task 2.
- Produces: `EditionEmail.editionLabel` with no year in it, `EditionEmail.dateLabel` holding
  the week range.

**Verify the line numbers first.** The other session touched all three route files at
`99473ae`. `Grep` for `label: editionLabel` and for `dateLabel` and edit what you find.

- [ ] **Step 1: Write the failing test**

In `tests/unit/edition-email.test.ts`, add:

```ts
describe("the masthead", () => {
  it("does not print the year twice for an unnamed edition", () => {
    const email = buildEditionEmail({
      ...baseInput,
      week: 32,
      year: 2026,
      label: editionEmailLabel({ title: null, week: 32 }),
    });

    expect(email.editionLabel).toBe("Week 32");
    expect(email.dateLabel).toBe("3-9 Aug 2026");

    const masthead = `${email.editionLabel} · ${email.dateLabel}`;
    expect(masthead).toBe("Week 32 · 3-9 Aug 2026");
    expect(masthead.match(/2026/g)?.length).toBe(1);
  });

  it("keeps the subject line an unnamed edition already had", () => {
    const email = buildEditionEmail({
      ...baseInput,
      week: 32,
      year: 2026,
      label: editionEmailLabel({ title: null, week: 32 }),
    });

    expect(email.subject).toBe("AI Radar Weekly - Week 32, 2026");
  });

  it("still recognises the old label shape as unnamed", () => {
    const email = buildEditionEmail({
      ...baseInput,
      week: 32,
      year: 2026,
      label: "Week 32 · 2026",
    });

    expect(email.subject).toBe("AI Radar Weekly - Week 32, 2026");
  });

  it("gives a named edition its name and the range", () => {
    const email = buildEditionEmail({
      ...baseInput,
      week: 32,
      year: 2026,
      label: "AI Act special",
    });

    expect(email.editionLabel).toBe("AI Act special");
    expect(email.dateLabel).toBe("3-9 Aug 2026");
    expect(email.subject).toBe("AI Radar - AI Act special");
  });
});
```

`baseInput` is whatever the existing `input()` helper at line 32 of that file builds. Reuse
the helper rather than restating the fixture; if it does not spread cleanly, call
`input({ week: 32, year: 2026, label: ... })` and read the fields off the result.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/edition-email.test.ts`
Expected: FAIL. `dateLabel` is `"2026"`, not `"3-9 Aug 2026"`.

- [ ] **Step 3: Change the mapper**

In `lib/email/edition-data.ts`, add to the imports:

```ts
import { weekRangeLabel } from "@/lib/radar/week";
```

Replace line 231:

```ts
    dateLabel: input.dateLabel ?? weekRangeLabel(input.week, input.year),
```

Replace `isWeekLabel` at lines 171 to 177 with:

```ts
/**
 * True when the label is only a derived week label, so nothing was actually named.
 *
 * Both shapes are accepted. `editionEmailLabel` produces "Week 32" and the screens'
 * `editionLabel` produces "Week 32 · 2026"; a caller not yet migrated to the first would
 * otherwise have its subject silently change from "AI Radar Weekly - Week 32, 2026" to
 * "AI Radar - Week 32 · 2026".
 */
function isWeekLabel(
  label: string | undefined,
  week: number,
  year: number
): boolean {
  return (
    !label ||
    label === `Week ${week}` ||
    label === `Week ${week} · ${year}`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/edition-email.test.ts`
Expected: PASS. Pre-existing assertions at lines 434-502 that expect `dateLabel` to be
`"2026"` will now fail; update them to the range. That is the design landing, not a
regression.

- [ ] **Step 5: Migrate the callers**

At each site, replace `editionLabel(...)` with `editionEmailLabel(...)` and fix the import.
The argument loses `year`:

```ts
// app/api/email/send-all/route.ts, lines 365 and 387
        label: editionEmailLabel(edition),

// app/api/email/preview/route.ts, lines 185 and 211
          label: editionEmailLabel({
            title: edition.title,
            week: edition.week,
          }),
```

`app/radar-preview/harness.tsx` has five sites, at 511, 837, 844, 1019 and 1052. The harness
renders dashboard screens, so some of those may legitimately want the screen label. Only
change the ones feeding `buildEditionEmail`; leave any feeding a screen heading alone.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add lib/email/edition-data.ts app/api/email tests/unit/edition-email.test.ts app/radar-preview/harness.tsx
git commit -m "Email: the masthead names the week once, and says which days it covers"
```

---

### Task 4: The masthead survives a long name

**Files:**
- Modify: `lib/email/edition-template.ts:383-391` (the `max-width: 620px` block) and
  `:435-459` (the masthead rows)

At 320px with the title `"AI Act special edition"` the label wraps to two lines, grows the
masthead and knocks the `AI RADAR.` wordmark out of alignment. Verified by rendering the
template at that width.

There is no unit test for this; it is CSS in an email. The check is visual, and Step 3 says
how to do it without a Supabase session.

- [ ] **Step 1: Add the stacking rule**

In the `@media only screen and (max-width: 620px)` block at line 383, add:

```css
    .masthead-cell { display: block !important; width: 100% !important; text-align: left !important; }
    .masthead-meta { text-align: left !important; padding-top: 10px !important; }
```

- [ ] **Step 2: Give the cells those classes**

In the masthead table at line 436, add `class="masthead-cell"` to both `<td>` elements, the
left one holding the wordmark and the right one holding the logo and label. Add
`class="masthead-meta t-muted"` to the inner `<td align="right">` at line 447 that holds
`editionLabel · dateLabel`, keeping `t-muted` so the dark-mode rule still finds it.

Keep the `align="right"` attributes. Outlook's Word engine ignores the media query and needs
the attribute; the class only takes effect where the query applies.

- [ ] **Step 3: Verify visually**

Render the template to a file and serve it, which needs no database:

```bash
npx tsx -e "
import { renderEditionEmail } from './lib/email/edition-template';
import { writeFileSync } from 'node:fs';
writeFileSync('masthead.html', renderEditionEmail({
  editionLabel: 'AI Act special edition',
  dateLabel: '3-9 Aug 2026',
  previewText: 'x', subject: 'x', bullets: [], sections: [], trends: [],
  portalUrl: 'https://example.com', unsubscribeUrl: 'https://example.com/u',
  logoOnLight: 'https://example.com/a.png', logoOnDark: 'https://example.com/b.png',
  footerLogoOnLight: 'https://example.com/c.png', footerLogoOnDark: 'https://example.com/d.png',
  companyLine: 'Linkroad Group, Lisboa',
}));
"
python -m http.server 3199
```

Open `http://localhost:3199/masthead.html` at 320px wide. The label sits on its own line,
left aligned, under the wordmark, and the wordmark is not pushed down. Delete `masthead.html`
before committing.

- [ ] **Step 4: Commit**

```bash
git add lib/email/edition-template.ts
git commit -m "Email: a long edition name stacks in the masthead instead of shoving the wordmark"
```

---

### Task 5: Extract the fragment renderers

**Files:**
- Create: `lib/email/edition-blocks.ts`
- Modify: `lib/email/edition-template.ts` (remove the fragments, import them)
- Test: `tests/unit/edition-template-snapshot.test.ts` (create)

**Interfaces:**
- Produces, all from `lib/email/edition-blocks.ts`:
  - `bulletRow(bullet: { text: string; anchor: string }): string` (the field is renamed to
    `url` in Task 6 Step 8; this task is a pure move and renames nothing)
  - `topicItem(item: EmailArticle, isFirst: boolean, isLast: boolean): string`
  - `sectionBlock(section: EmailSection): string`
  - `trendRow(trend: EmailTrend, isLast: boolean): string`
  - `trendBlock(trends: EmailTrend[]): string`
  - `topStoryBlock(data: EditionEmail): string`
  - `internalBlock(internal: EmailInternal | undefined): string`
  - `bulletsBlock(bullets: Array<{ text: string; anchor: string }>, note: string | undefined): string`
  - the palette constants `ACCENT PRIMARY INK BODY_INK MUTED RULE RULE_SOFT TINT CARD PAGE SANS SERIF`
  - `escapeHtml`, `safeUrl`, `link`
- Consumes: the types `EmailArticle`, `EmailSection`, `EmailTrend`, `EmailInternal`,
  `EditionEmail` stay declared in `edition-template.ts` and are imported by
  `edition-blocks.ts`. Keeping the types where they are avoids a circular import: blocks
  imports types from template, template imports functions from blocks, and TypeScript resolves
  a type-only cycle. Use `import type` for the types.

This task must not change a byte of v1's output. The snapshot is the proof.

- [ ] **Step 1: Capture the snapshot before touching anything**

Create `tests/unit/edition-template-snapshot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderEditionEmail, renderEditionText } from "@/lib/email/edition-template";
import type { EditionEmail } from "@/lib/email/edition-template";

/**
 * The extraction in Task 5 moves the fragment renderers into edition-blocks.ts. It is a
 * pure move, so the rendered bytes must not change. This fixture exercises every branch:
 * a top story with an image and coverage, two sections of differing length, trends with a
 * rise and a null delta, an internal block, a bullets note.
 */
const fixture: EditionEmail = {
  editionLabel: "Week 32",
  dateLabel: "3-9 Aug 2026",
  previewText: "A quiet week with one loud release.",
  subject: "AI Radar Weekly - Week 32, 2026",
  bullets: [
    { text: "Anthropic ships an agent runtime", url: "https://anthropic.com/a" },
    { text: "EU AI Act timeline slips", url: "https://reuters.com/b" },
  ],
  bulletsNote: "A quieter week: we held back thin items rather than pad the brief.",
  topStory: {
    title: "Anthropic ships an agent runtime",
    summary: "Durable sessions move into the model layer.",
    url: "https://anthropic.com/a",
    source: "Anthropic",
    coverage: 7,
  },
  topStoryImage: "https://example.com/lead.png",
  sections: [
    {
      name: "Models",
      anchor: "topic-models",
      items: [
        { title: "One", summary: "First.", url: "https://arxiv.org/1", source: "arXiv", coverage: 3 },
        { title: "Two", summary: "Second.", url: "https://arxiv.org/2" },
      ],
    },
    {
      name: "Regulation",
      anchor: "topic-regulation",
      items: [
        { title: "Three", summary: "Third.", url: "https://reuters.com/3", source: "Reuters" },
      ],
    },
  ],
  trends: [
    { name: "Agent orchestration", delta: 62, note: "24 mentions across 9 sources." },
    { name: "Inference cost", delta: null, note: "New this fortnight." },
  ],
  internal: {
    title: "QE offering: the suite runs remotely",
    body: "Two infrastructures, one variable.",
    url: "https://example.com/projects",
  },
  portalUrl: "https://example.com/editions",
  unsubscribeUrl: "https://example.com/unsubscribe",
  logoOnLight: "https://example.com/h-light.png",
  logoOnDark: "https://example.com/h-dark.png",
  footerLogoOnLight: "https://example.com/v-light.png",
  footerLogoOnDark: "https://example.com/v-dark.png",
  sourceCount: 7,
  companyLine: "Linkroad Group, Av. Duque de Avila 23, 1000-138 Lisboa, Portugal",
};

describe("the edition email is byte stable across the block extraction", () => {
  it("renders the same HTML", () => {
    expect(renderEditionEmail(fixture)).toMatchSnapshot();
  });

  it("renders the same text part", () => {
    expect(renderEditionText(fixture)).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run it to write the snapshot**

Run: `npx vitest run tests/unit/edition-template-snapshot.test.ts`
Expected: PASS, with `2 snapshots written`.

The fixture above uses `url:` in its bullets, which is the shape after Task 6 Step 8. Write it
as `anchor:` here to match today's interface, and change it to `url:` in Task 6 Step 8. The
rendered bytes do not change, so the snapshot survives that rename.

- [ ] **Step 3: Commit the snapshot before the move**

```bash
git add tests/unit/edition-template-snapshot.test.ts tests/unit/__snapshots__
git commit -m "Email: pin the rendered edition before the fragments move"
```

- [ ] **Step 4: Create `lib/email/edition-blocks.ts`**

Move, without editing, from `lib/email/edition-template.ts`:
- the palette constants at lines 24 to 36
- `escapeHtml` at 117, `safeUrl` at 135, `link` at 146
- `bulletRow` at 155, `topicItem` at 167, `sectionBlock` at 195, `trendRow` at 215,
  `trendBlock` at 240, `topStoryBlock` at 258, `internalBlock` at 322
- the `bullets` const built inline at 346 to 364 becomes `bulletsBlock(bullets, note)`

Export all of them. Add the file header:

```ts
/**
 * The HTML fragments the AI Radar edition is made of.
 *
 * Extracted from edition-template.ts so the code renderer and the merge tags that feed the
 * Unlayer variants emit the same markup. Without this, a hand-built template renders
 * articles that look like a different product, which is the failure content-renderer.ts
 * exists to prevent.
 *
 * Everything interpolated is escaped: titles and summaries arrive from RSS and from model
 * output, and a stray angle bracket must not break the markup of mail already sent.
 */
```

- [ ] **Step 5: Import them back**

In `lib/email/edition-template.ts`, replace the removed definitions with one import, and
re-export `escapeHtml` so existing importers (`content-renderer.ts:15`,
`template-renderer.ts:231`) keep working:

```ts
import {
  ACCENT, PRIMARY, RULE, SANS,
  bulletsBlock, internalBlock, sectionBlock, topStoryBlock, trendBlock,
  escapeHtml, safeUrl,
} from "./edition-blocks";

export { escapeHtml };
```

Import only what `edition-template.ts` still uses after the move. `renderArticleItemsHtml`
and `renderProjectItemsHtml` at lines 585 and 595 stay in `edition-template.ts` and now call
the imported `topicItem`.

- [ ] **Step 6: Run the snapshot**

Run: `npx vitest run tests/unit/edition-template-snapshot.test.ts`
Expected: PASS with no snapshot change. **A snapshot diff means the move was not pure.**
Read the diff and fix the move; do not update the snapshot.

- [ ] **Step 7: Run everything**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: both clean. Confirm `lib/email/edition-template.ts` is now under 500 lines:
`(Get-Content lib/email/edition-template.ts | Measure-Object -Line).Lines`

- [ ] **Step 8: Commit**

```bash
git add lib/email/edition-blocks.ts lib/email/edition-template.ts
git commit -m "Email: the edition fragments move where both renderers can reach them"
```

---

### Task 6: One merge-tag table

**Files:**
- Create: `lib/email/merge-tags.ts`
- Modify: `lib/email/content-renderer.ts:76-97` and `:103-148`
- Modify: `lib/email/template-renderer.ts:166-191`
- Modify: `components/template-editor.tsx:45-71`
- Modify: `components/edition-unlayer-editor.tsx:94-120`
- Modify: `lib/email/edition-data.ts:213-219` and `lib/email/edition-template.ts` (the
  `bullets` field renames from `anchor` to `url`)
- Test: `tests/unit/merge-tags.test.ts` (create)

**Interfaces:**
- Produces:
  - `RADAR_MERGE_TAGS: readonly MergeTag[]` where
    `MergeTag = { name: string; label: string; perRecipient: boolean }`
  - `MERGE_TAG_PATTERN: RegExp` built from the table, with the global flag
  - `renderMergeTags(html: string, values: Record<string, string>, options?: { keepPerRecipient?: boolean }): string`
  - `unlayerMergeTagOptions(samples: Record<string, string>): Record<string, { name: string; value: string; sample: string }>`

The two renderers already disagree: `content-renderer.ts:94` accepts five tags and
`template-renderer.ts:188` accepts seven. `{{articleCount}}` works in a real send and shows as
literal text in the preview. This table is what stops that recurring as the vocabulary grows
to fifteen.

`keepPerRecipient: true` leaves `{{unsubscribe_url}}`, `{{archive_url}}` and `{{portal_url}}`
standing, so Task 8 can substitute them once per subscriber inside the batch loop.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/merge-tags.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MERGE_TAG_PATTERN,
  RADAR_MERGE_TAGS,
  renderMergeTags,
  unlayerMergeTagOptions,
} from "@/lib/email/merge-tags";

describe("the merge-tag table", () => {
  it("names every tag exactly once", () => {
    const names = RADAR_MERGE_TAGS.map((tag) => tag.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("marks the three signed URLs as per recipient and nothing else", () => {
    const perRecipient = RADAR_MERGE_TAGS.filter((tag) => tag.perRecipient).map((t) => t.name);
    expect(perRecipient.sort()).toEqual(["archive_url", "portal_url", "unsubscribe_url"]);
  });

  it("covers the vocabulary both old renderers accepted", () => {
    const names = RADAR_MERGE_TAGS.map((tag) => tag.name);
    for (const legacy of [
      "articles", "projects", "week", "year",
      "articleCount", "projectCount", "unsubscribe_url",
    ]) {
      expect(names).toContain(legacy);
    }
  });
});

describe("renderMergeTags", () => {
  it("substitutes a known tag", () => {
    expect(renderMergeTags("<p>{{week}}</p>", { week: "32" })).toBe("<p>32</p>");
  });

  it("leaves an unknown tag literal", () => {
    expect(renderMergeTags("{{nope}}", { week: "32" })).toBe("{{nope}}");
  });

  it("leaves a known tag literal when no value is supplied", () => {
    expect(renderMergeTags("{{week}}", {})).toBe("{{week}}");
  });

  it("does not substitute a second time inside rendered content", () => {
    const html = renderMergeTags("{{articles}}", {
      articles: "a story mentioning {{projects}} verbatim",
      projects: "SHOULD NOT APPEAR",
    });
    expect(html).toBe("a story mentioning {{projects}} verbatim");
  });

  it("keeps the per-recipient tags standing when asked", () => {
    const html = renderMergeTags(
      "{{week}} {{unsubscribe_url}} {{archive_url}} {{portal_url}}",
      {
        week: "32",
        unsubscribe_url: "https://example.com/u",
        archive_url: "https://example.com/a",
        portal_url: "https://example.com/p",
      },
      { keepPerRecipient: true }
    );
    expect(html).toBe("32 {{unsubscribe_url}} {{archive_url}} {{portal_url}}");
  });

  it("substitutes the per-recipient tags by default", () => {
    expect(
      renderMergeTags("{{unsubscribe_url}}", { unsubscribe_url: "https://example.com/u" })
    ).toBe("https://example.com/u");
  });

  it("builds a fresh pattern each call, so lastIndex cannot leak between calls", () => {
    expect(MERGE_TAG_PATTERN.global).toBe(true);
    expect(renderMergeTags("{{week}}", { week: "1" })).toBe("1");
    expect(renderMergeTags("{{week}}", { week: "2" })).toBe("2");
  });
});

describe("unlayerMergeTagOptions", () => {
  it("produces one entry per tag, in the shape Unlayer wants", () => {
    const options = unlayerMergeTagOptions({ week: "32" });
    expect(Object.keys(options).length).toBe(RADAR_MERGE_TAGS.length);
    expect(options.week).toEqual({ name: "Week Number", value: "{{week}}", sample: "32" });
  });

  it("falls back to the literal tag when no sample is given", () => {
    expect(unlayerMergeTagOptions({}).week.sample).toBe("{{week}}");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/merge-tags.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `lib/email/merge-tags.ts`**

```ts
/**
 * Every merge tag the product understands, in one table.
 *
 * Two renderers used to keep their own list and they had already drifted:
 * content-renderer.ts accepted five tags and template-renderer.ts accepted seven, so
 * {{articleCount}} worked in a real send and rendered as literal text in the browser
 * preview. Two more components hardcoded a third and fourth copy for the Unlayer palette.
 * With the vocabulary going from seven tags to fifteen, four hand-maintained lists stop
 * being a risk and become a certainty.
 *
 * Client-safe on purpose: content-renderer.ts is imported by client components, so nothing
 * here may reach for Prisma or node crypto. Values arrive from the caller.
 */

export interface MergeTag {
  /** The name inside the braces. */
  name: string;
  /** What the Unlayer palette calls it. */
  label: string;
  /**
   * True when the value is bound to one subscriber, so it cannot be computed once for a
   * whole send. The three signed URLs are; everything else is shared.
   */
  perRecipient: boolean;
}

export const RADAR_MERGE_TAGS: readonly MergeTag[] = [
  { name: "articles", label: "Articles", perRecipient: false },
  { name: "projects", label: "Projects", perRecipient: false },
  { name: "sections", label: "Topic sections", perRecipient: false },
  { name: "top_story", label: "Top story", perRecipient: false },
  { name: "trend_radar", label: "Trend radar", perRecipient: false },
  { name: "internal", label: "Internal block", perRecipient: false },
  { name: "tldr", label: "This week in 30 seconds", perRecipient: false },
  { name: "edition_label", label: "Edition name", perRecipient: false },
  { name: "date_range", label: "Week date range", perRecipient: false },
  { name: "week", label: "Week Number", perRecipient: false },
  { name: "year", label: "Year", perRecipient: false },
  { name: "articleCount", label: "Article count", perRecipient: false },
  { name: "projectCount", label: "Project count", perRecipient: false },
  { name: "unsubscribe_url", label: "Unsubscribe URL", perRecipient: true },
  { name: "archive_url", label: "This edition in the browser", perRecipient: true },
  { name: "portal_url", label: "Edition index URL", perRecipient: true },
] as const;

const PER_RECIPIENT = new Set(
  RADAR_MERGE_TAGS.filter((tag) => tag.perRecipient).map((tag) => tag.name)
);

/**
 * Exported for tests and for anyone needing to detect tags without substituting. Callers
 * that substitute go through renderMergeTags, which builds its own instance: a shared
 * global RegExp carries lastIndex between calls.
 */
export const MERGE_TAG_PATTERN = buildPattern();

function buildPattern(): RegExp {
  const names = RADAR_MERGE_TAGS.map((tag) => tag.name).join("|");
  return new RegExp(`\\{\\{(${names})\\}\\}`, "g");
}

/**
 * Substitute merge tags in one pass.
 *
 * One pass with a callback, so rendered content that happens to contain a placeholder is
 * never substituted a second time. A tag with no value is left literal rather than replaced
 * with an empty string: a visible {{tag}} in a preview is a bug someone can see, and a
 * silent gap is not.
 */
export function renderMergeTags(
  html: string,
  values: Record<string, string>,
  options: { keepPerRecipient?: boolean } = {}
): string {
  return html.replace(buildPattern(), (match, name: string) => {
    if (options.keepPerRecipient && PER_RECIPIENT.has(name)) return match;
    return values[name] ?? match;
  });
}

/** The mergeTags object the Unlayer editor options want, derived from the same table. */
export function unlayerMergeTagOptions(
  samples: Record<string, string>
): Record<string, { name: string; value: string; sample: string }> {
  const options: Record<string, { name: string; value: string; sample: string }> = {};

  for (const tag of RADAR_MERGE_TAGS) {
    options[tag.name] = {
      name: tag.label,
      value: `{{${tag.name}}}`,
      sample: samples[tag.name] ?? `{{${tag.name}}}`,
    };
  }

  return options;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/merge-tags.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire `content-renderer.ts`**

Replace the body of `replaceContentMergeTags` (lines 76 to 97) so it builds a values map and
delegates. Keep the exported name and signature; three call sites depend on it
(`app/dashboard/send/[id]/page.tsx:577` and `:745`). Add `sections`, `top_story`,
`trend_radar`, `internal`, `tldr`, `edition_label`, `date_range`, `articleCount`,
`projectCount`, `archive_url` and `portal_url` to the map, sourcing the block HTML from
`lib/email/edition-blocks.ts`. Delete the local regex.

Do the same to `generateMergeTagSamples` at line 103: keep its behaviour for `articles` and
`projects`, and add a short sample for each new tag so the editor canvas shows where content
lands.

- [ ] **Step 6: Rewire `template-renderer.ts`**

Replace lines 169 to 190 of `renderTemplate` with a values map plus
`renderMergeTags(html, values)`. Delete the local regex at 188. Keep
`buildUnsubscribeUrl(subscriberId)` as the `unsubscribe_url` value: Task 8 changes when it is
called, not what it returns.

- [ ] **Step 7: Rewire both editors**

In `components/template-editor.tsx`, replace the `mergeTags` literal at lines 45 to 71 with
`mergeTags: unlayerMergeTagOptions({})`. In `components/edition-unlayer-editor.tsx`, replace
lines 94 to 120 with `mergeTags: unlayerMergeTagOptions(mergeTagSamples)`.

- [ ] **Step 8: Rename the TL;DR field**

`lib/email/edition-data.ts:217` sets `anchor: article.sourceUrl`. The field is called
`anchor`, the anchors exist and nothing uses them, and pointing at the article is correct
because Gmail strips `id`. Rename the field so the interface stops claiming otherwise:

- `lib/email/edition-template.ts:74`: `bullets: Array<{ text: string; url: string }>`
- `lib/email/edition-blocks.ts`, in `bulletRow`: `bullet.url` instead of `bullet.anchor`
- `lib/email/edition-data.ts:218`: `url: article.sourceUrl`
- update the snapshot fixture in `tests/unit/edition-template-snapshot.test.ts` and any
  `anchor:` in `tests/unit/edition-email.test.ts`

The rendered bytes do not change, so the snapshot must still pass.

- [ ] **Step 9: Run everything**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: both clean, snapshot unchanged.

- [ ] **Step 10: Commit**

```bash
git add lib/email components/template-editor.tsx components/edition-unlayer-editor.tsx tests/unit
git commit -m "Email: one merge-tag table, so the preview and the send agree"
```

---

### Task 7: Purpose-scoped tokens

**Files:**
- Modify: `lib/email/unsubscribe-token.ts`
- Create: `lib/email/archive-url.ts`
- Test: `tests/unit/archive-token.test.ts` (create)

**Interfaces:**
- Produces from `unsubscribe-token.ts`:
  - `generateToken(purpose: TokenPurpose, subscriberId: string): string`
  - `verifyToken(purpose: TokenPurpose, token: string): string | null`
  - `type TokenPurpose = "unsubscribe" | "archive"`
  - `generateUnsubscribeToken` and `verifyUnsubscribeToken` stay exported, unchanged in
    behaviour, as thin wrappers
- Produces from `archive-url.ts`:
  - `buildArchiveUrl(editionId: string, subscriberId?: string): string`
  - `buildEditionIndexUrl(subscriberId?: string): string`

**The hard constraint.** `generateUnsubscribeToken` signs the bare `subscriberId`. Emails
already delivered carry tokens of that shape, and an unsubscribe link that stops working is a
compliance problem. So the `unsubscribe` purpose keeps signing the bare id forever, and only
new purposes sign `${purpose}:${subscriberId}`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/archive-token.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import {
  generateToken,
  generateUnsubscribeToken,
  verifyToken,
  verifyUnsubscribeToken,
} from "@/lib/email/unsubscribe-token";

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret-not-a-real-one";
});

describe("purpose scoping", () => {
  it("round-trips an archive token", () => {
    const token = generateToken("archive", "sub_123");
    expect(verifyToken("archive", token)).toBe("sub_123");
  });

  it("does not let an unsubscribe token open the archive", () => {
    const token = generateUnsubscribeToken("sub_123");
    expect(verifyToken("archive", token)).toBeNull();
  });

  it("does not let an archive token unsubscribe", () => {
    const token = generateToken("archive", "sub_123");
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("keeps signing the unsubscribe purpose over the bare id, so delivered links still work", () => {
    // A token minted before purposes existed signed the subscriber id alone. This asserts
    // the legacy shape still verifies, because the alternative is breaking the unsubscribe
    // link in every email already sent.
    const legacy = generateUnsubscribeToken("sub_123");
    expect(verifyUnsubscribeToken(legacy)).toBe("sub_123");
    expect(verifyToken("unsubscribe", legacy)).toBe("sub_123");
  });

  it("rejects a malformed token", () => {
    expect(verifyToken("archive", "not-a-token")).toBeNull();
    expect(verifyToken("archive", "")).toBeNull();
    expect(verifyToken("archive", "a.b.c")).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = generateToken("archive", "sub_123");
    const [payload] = token.split(".");
    expect(verifyToken("archive", `${payload}.tampered`)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/archive-token.test.ts`
Expected: FAIL, `generateToken is not a function`.

- [ ] **Step 3: Generalize the signer**

Rewrite `lib/email/unsubscribe-token.ts`, keeping `getSecret`, `generateUnsubscribeToken`,
`verifyUnsubscribeToken` and `buildUnsubscribeUrl` exported:

```ts
export type TokenPurpose = "unsubscribe" | "archive";

/**
 * What gets signed, per purpose.
 *
 * `unsubscribe` signs the bare subscriber id and always will. Tokens of that shape are in
 * every email already delivered, and an unsubscribe link that stops working is a compliance
 * problem rather than a bug. Every other purpose is prefixed, so a token minted for one
 * cannot be replayed against another: without the prefix an unsubscribe link would open the
 * archive and an archive link would unsubscribe.
 */
function signingInput(purpose: TokenPurpose, subscriberId: string): string {
  return purpose === "unsubscribe" ? subscriberId : `${purpose}:${subscriberId}`;
}

function sign(purpose: TokenPurpose, subscriberId: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(signingInput(purpose, subscriberId))
    .digest("base64url");
}

export function generateToken(purpose: TokenPurpose, subscriberId: string): string {
  const payload = Buffer.from(subscriberId, "utf8").toString("base64url");
  return `${payload}.${sign(purpose, subscriberId)}`;
}

export function verifyToken(purpose: TokenPurpose, token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const subscriberId = Buffer.from(parts[0], "base64url").toString("utf8");
  if (!subscriberId) return null;

  const expected = Buffer.from(sign(purpose, subscriberId), "utf8");
  const provided = Buffer.from(parts[1], "utf8");

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return null;
  }

  return subscriberId;
}

export function generateUnsubscribeToken(subscriberId: string): string {
  return generateToken("unsubscribe", subscriberId);
}

export function verifyUnsubscribeToken(token: string): string | null {
  return verifyToken("unsubscribe", token);
}
```

`buildUnsubscribeUrl` stays exactly as it is at line 67.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/archive-token.test.ts tests/unit`
Expected: PASS, and no existing unsubscribe test regresses.

- [ ] **Step 5: Add `lib/email/archive-url.ts`**

```ts
import { config } from "@/lib/config";
import { generateToken } from "./unsubscribe-token";

/**
 * Signed links to the browser copy of an edition.
 *
 * Server only: signing needs node crypto. The email's per-recipient substitution calls these
 * inside the send loop, which is the only place a subscriber id is in hand.
 *
 * Without a subscriber id, the unsigned URL is returned. That is correct for previews and
 * test sends, and the page answers 404 for it, so nothing leaks.
 */
export function buildArchiveUrl(editionId: string, subscriberId?: string): string {
  const base = config.app.url.replace(/\/$/, "");
  if (!subscriberId) return `${base}/editions/${editionId}`;
  return `${base}/editions/${editionId}?t=${generateToken("archive", subscriberId)}`;
}

export function buildEditionIndexUrl(subscriberId?: string): string {
  const base = config.app.url.replace(/\/$/, "");
  if (!subscriberId) return `${base}/editions`;
  return `${base}/editions?t=${generateToken("archive", subscriberId)}`;
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add lib/email/unsubscribe-token.ts lib/email/archive-url.ts tests/unit/archive-token.test.ts
git commit -m "Email: a token says what it is for, and unsubscribe keeps its old shape"
```

---

### Task 8: Per-recipient substitution

**Files:**
- Modify: `app/api/email/send-all/route.ts`: the `renderTemplateById` call at 418, the
  ad-hoc branch at 433, `sendNewsletterWithTemplate` at 571 and its batch loop at 614,
  `sendNewsletterToAllWithOptions` at 707 and its unsigned render at 724
- Modify: `app/api/email/send-test/route.ts:177`
- Test: `tests/unit/per-recipient-send.test.ts` (create)

**Interfaces:**
- Consumes: `renderMergeTags` from Task 6, `buildArchiveUrl` and `buildEditionIndexUrl` from
  Task 7, `buildUnsubscribeUrl` from `unsubscribe-token.ts`.
- Produces: `personalizeHtml(html: string, args: { subscriberId: string; editionId: string }): string`,
  exported from `lib/email/personalize.ts` (create it here rather than inline in the route, so
  it can be tested without a route handler).

**This fixes a live bug.** `sendNewsletterWithTemplate` sends the identical `templateHtml` to
every subscriber, and `renderTemplateById` is called once with an `emailData` that carries no
`subscriberId`, so `buildUnsubscribeUrl(undefined)` yields the generic page. Line 724 does the
same on the built-in path. On three of the four send paths every recipient gets the generic
unsubscribe link. Verify the bug still exists before fixing it; the other session has been in
this file.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/per-recipient-send.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { personalizeHtml } from "@/lib/email/personalize";

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret-not-a-real-one";
});

const template = `
  <a href="{{unsubscribe_url}}">Unsubscribe</a>
  <a href="{{archive_url}}">View in browser</a>
  <a href="{{portal_url}}">Read the full feed</a>
  <p>Week {{week}}</p>
`;

describe("personalizeHtml", () => {
  it("gives two subscribers different links and identical everything else", () => {
    const a = personalizeHtml(template, { subscriberId: "sub_a", editionId: "ed_1" });
    const b = personalizeHtml(template, { subscriberId: "sub_b", editionId: "ed_1" });

    expect(a).not.toBe(b);
    expect(a).toContain("t=");

    // Blank the tokens: what remains must be identical, or something other than the
    // per-recipient links is varying between recipients.
    const blank = (html: string) => html.replace(/t=[^"&]+/g, "t=TOKEN");
    expect(blank(a)).toBe(blank(b));
  });

  it("resolves all three per-recipient tags", () => {
    const html = personalizeHtml(template, { subscriberId: "sub_a", editionId: "ed_1" });

    expect(html).not.toContain("{{unsubscribe_url}}");
    expect(html).not.toContain("{{archive_url}}");
    expect(html).not.toContain("{{portal_url}}");
  });

  it("points the archive link at this edition", () => {
    const html = personalizeHtml(template, { subscriberId: "sub_a", editionId: "ed_1" });
    expect(html).toContain("/editions/ed_1?t=");
  });

  it("leaves a shared tag alone, because it was already resolved upstream", () => {
    const html = personalizeHtml(template, { subscriberId: "sub_a", editionId: "ed_1" });
    expect(html).toContain("Week {{week}}");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/per-recipient-send.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `lib/email/personalize.ts`**

```ts
import { renderMergeTags } from "./merge-tags";
import { buildArchiveUrl, buildEditionIndexUrl } from "./archive-url";
import { buildUnsubscribeUrl } from "./unsubscribe-token";
import { hardenExportedHtml } from "./harden-export";

/**
 * The last step before an email leaves, run once per recipient.
 *
 * Everything shared is already substituted by the time this runs; only the three signed URLs
 * are left standing, and they cannot be resolved earlier because each is bound to one
 * subscriber. Before this existed the whole HTML was rendered once for a send, so every
 * recipient received the generic unsubscribe page rather than their own signed link.
 *
 * Hardening runs last, after substitution, because dropEmptyOptionalRows judges emptiness
 * against the final markup and would keep a row whose merge tag was still an unresolved
 * placeholder.
 */
export function personalizeHtml(
  html: string,
  args: { subscriberId: string; editionId: string }
): string {
  const substituted = renderMergeTags(html, {
    unsubscribe_url: buildUnsubscribeUrl(args.subscriberId),
    archive_url: buildArchiveUrl(args.editionId, args.subscriberId),
    portal_url: buildEditionIndexUrl(args.subscriberId),
  });

  return hardenExportedHtml(substituted);
}
```

This imports `hardenExportedHtml` from Task 9. Do Task 9 before this step, or stub the import
as an identity function and remove the stub in Task 9. Prefer reordering.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/per-recipient-send.test.ts`
Expected: PASS.

- [ ] **Step 5: Leave the per-recipient tags standing upstream**

In `lib/email/template-renderer.ts`, `renderTemplate` gains an option and passes it through:

```ts
export function renderTemplate(
  html: string,
  context: RenderContext,
  options: { keepPerRecipient?: boolean } = {}
): string {
```

and its `renderMergeTags` call passes `options`. `renderTemplateById` gains the same parameter
and forwards it.

- [ ] **Step 6: Substitute inside the batch loop**

In `app/api/email/send-all/route.ts`:

- line 418, ask for the partially-resolved HTML:
  `await renderTemplateById(effectiveTemplateId, emailData, { keepPerRecipient: true })`
- `sendNewsletterWithTemplate` at 571 keeps its signature. Inside the batch loop at 614,
  before sending, build the per-recipient copy:

```ts
      const promises = batch.map(async (subscriber) => {
        try {
          const html = personalizeHtml(templateHtml, {
            subscriberId: subscriber.id,
            editionId,
          });

          const emailResult = providerOverride
            ? await sendEmailWithProvider(
                providerOverride,
                subscriber.email,
                newsletterSubject(data as any),
                html
              )
            : await sendEmail(subscriber.email, newsletterSubject(data as any), html);
```

- line 724, the built-in path, must also leave the tags standing. `renderNewsletterEmail`
  currently resolves `unsubscribeUrl` eagerly through `buildEditionEmail`. Give it the same
  option: `renderNewsletterEmail(data, undefined, undefined, { keepPerRecipient: true })`
  puts the literal `{{unsubscribe_url}}`, `{{archive_url}}` and `{{portal_url}}` into
  `EditionEmail.unsubscribeUrl`, `archiveUrl` and `portalUrl`. `safeUrl` in
  `edition-blocks.ts` rejects a non-URL, so those three fields must bypass `safeUrl` when the
  value matches `/^\{\{\w+\}\}$/`. Add that guard to `safeUrl` with a comment saying why.
- the ad-hoc branch at 433 has no subscriber. Pass `personalizeHtml` an empty
  `subscriberId`, which yields unsigned URLs, and the archive page answers 404 for them. That
  is correct: an ad-hoc recipient is not a subscriber and has no archive.

In `app/api/email/send-test/route.ts:177`, a test send has exactly one recipient; call
`personalizeHtml` once with that subscriber's id, or with `""` when the test send is to a
bare address.

- [ ] **Step 7: Run everything**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add lib/email app/api/email tests/unit/per-recipient-send.test.ts
git commit -m "Email: every recipient gets their own signed links, not the first one's"
```

---

### Task 9: The hardening pass

**Files:**
- Create: `lib/email/harden-export.ts`
- Test: `tests/unit/harden-export.test.ts` (create)

**Interfaces:**
- Produces:
  - `injectDarkMode(html: string): string`
  - `wrapMsoLogo(html: string): string`
  - `dropEmptyOptionalRows(html: string): string`
  - `hardenExportedHtml(html: string): string`
  - `OPTIONAL_ROW_CLASS = "radar-optional"`

**This is the highest-consequence unit in the plan.** `dropEmptyOptionalRows` operates on raw
HTML where an Unlayer row is nested tables, so a regex will not do: it needs a scanner that
finds the element carrying the class and counts opening against closing tags until it
balances. A bug here leaves by email and cannot be recalled. Write the scanner tests first and
write more of them than feels necessary.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/harden-export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  dropEmptyOptionalRows,
  hardenExportedHtml,
  injectDarkMode,
  wrapMsoLogo,
} from "@/lib/email/harden-export";

describe("injectDarkMode", () => {
  it("puts the style block before </head>", () => {
    const html = injectDarkMode("<html><head><title>x</title></head><body></body></html>");
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("[data-ogsc]");
    expect(html.indexOf("prefers-color-scheme")).toBeLessThan(html.indexOf("</head>"));
  });

  it("is idempotent", () => {
    const once = injectDarkMode("<html><head></head><body></body></html>");
    expect(injectDarkMode(once)).toBe(once);
  });

  it("leaves HTML with no head alone rather than corrupting it", () => {
    const html = "<div>fragment</div>";
    expect(injectDarkMode(html)).toBe(html);
  });
});

describe("wrapMsoLogo", () => {
  it("wraps the dark logo in a conditional Outlook will not read", () => {
    const html = wrapMsoLogo('<td><img class="logo-dark" src="d.png"></td>');
    expect(html).toBe(
      '<td><!--[if !mso]><!--><img class="logo-dark" src="d.png"><!--<![endif]--></td>'
    );
  });

  it("leaves the light logo alone", () => {
    const html = '<img class="logo-light" src="l.png">';
    expect(wrapMsoLogo(html)).toBe(html);
  });

  it("finds the class among others", () => {
    expect(wrapMsoLogo('<img class="u_content_image logo-dark x" src="d.png">')).toContain(
      "[if !mso]"
    );
  });

  it("is idempotent", () => {
    const once = wrapMsoLogo('<img class="logo-dark" src="d.png">');
    expect(wrapMsoLogo(once)).toBe(once);
  });
});

describe("dropEmptyOptionalRows", () => {
  it("removes a row whose only content is whitespace", () => {
    const html = `<table><tr class="radar-optional"><td><p>TREND RADAR</p>   </td></tr></table>`;
    expect(dropEmptyOptionalRows(html)).toBe("<table></table>");
  });

  it("keeps a row that has content", () => {
    const html = `<table><tr class="radar-optional"><td><p>TREND RADAR</p><p>Agents +62%</p></td></tr></table>`;
    expect(dropEmptyOptionalRows(html)).toBe(html);
  });

  it("balances nested tables, which is what an Unlayer row actually is", () => {
    const html =
      `<div class="radar-optional">` +
      `<table><tr><td><table><tr><td>HEADING</td></tr></table></td></tr></table>` +
      `</div>` +
      `<div class="keep">after</div>`;
    expect(dropEmptyOptionalRows(html)).toBe('<div class="keep">after</div>');
  });

  it("does not eat the sibling after an empty row", () => {
    const html =
      `<tr class="radar-optional"><td>LABEL</td></tr>` +
      `<tr class="next"><td>real content</td></tr>`;
    expect(dropEmptyOptionalRows(html)).toBe('<tr class="next"><td>real content</td></tr>');
  });

  it("handles two optional rows, one empty and one not", () => {
    const html =
      `<tr class="radar-optional"><td>EMPTY LABEL</td></tr>` +
      `<tr class="radar-optional"><td>LABEL<p>content</p></td></tr>`;
    expect(dropEmptyOptionalRows(html)).toBe(
      '<tr class="radar-optional"><td>LABEL<p>content</p></td></tr>'
    );
  });

  it("treats a row holding only an unresolved merge tag as content, not emptiness", () => {
    // Guards the ordering rule: hardening runs after substitution. If it ran before, this
    // row would survive with a visible placeholder, which is louder than an orphan heading.
    const html = `<tr class="radar-optional"><td>LABEL{{trend_radar}}</td></tr>`;
    expect(dropEmptyOptionalRows(html)).toBe(html);
  });

  it("leaves HTML with no optional rows untouched", () => {
    const html = "<table><tr><td>x</td></tr></table>";
    expect(dropEmptyOptionalRows(html)).toBe(html);
  });

  it("returns malformed markup unchanged rather than guessing where the row ends", () => {
    // An unbalanced element means the scanner cannot know the extent. Guessing would delete
    // real content, so the only safe answer is to leave it alone.
    const html = `<tr class="radar-optional"><td>LABEL`;
    expect(dropEmptyOptionalRows(html)).toBe(html);
  });
});

describe("hardenExportedHtml", () => {
  it("runs all three and is idempotent", () => {
    const input =
      `<html><head></head><body>` +
      `<img class="logo-dark" src="d.png">` +
      `<tr class="radar-optional"><td>LABEL</td></tr>` +
      `</body></html>`;

    const once = hardenExportedHtml(input);
    expect(once).toContain("prefers-color-scheme: dark");
    expect(once).toContain("[if !mso]");
    expect(once).not.toContain("radar-optional");
    expect(hardenExportedHtml(once)).toBe(once);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/harden-export.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement it**

Create `lib/email/harden-export.ts`:

```ts
/**
 * What Unlayer will not emit, reinstated after the merge tags resolve.
 *
 * The code renderer's edition depends on three things a design JSON export cannot carry: a
 * dark-mode block with an `[data-ogsc]` mirror for Outlook.com, an MSO conditional around the
 * dark logo so Word-engine Outlook does not show both logos, and rows that disappear when the
 * merge tag inside them renders nothing.
 *
 * A pure string function on purpose: no DOM, no dependencies, client-safe, so the send path
 * and the browser preview can both call it and cannot disagree. Every transform is
 * idempotent, so running it twice is harmless.
 *
 * ORDER MATTERS. This runs after substitution, never before. `dropEmptyOptionalRows` judges
 * emptiness against the final markup, and an unresolved `{{trend_radar}}` reads as content,
 * which is the correct outcome: a visible placeholder is a bug someone can see.
 */

export const OPTIONAL_ROW_CLASS = "radar-optional";

/** Present once the dark-mode block has been injected, so a second pass is a no-op. */
const MARKER = "<!--radar:hardened-->";

const MSO_OPEN = "<!--[if !mso]><!-->";
const MSO_CLOSE = "<!--<![endif]-->";

/**
 * Not a substring of OPTIONAL_ROW_CLASS, on purpose.
 *
 * A sentinel containing "radar-optional" would still match the scanner's own pattern, since
 * a hyphen is a word boundary, and the loop would never terminate.
 */
const KEEP_SENTINEL = "radarKeptOptional";

/**
 * The dark-mode rules, lifted from lib/email/edition-template.ts:392-421.
 *
 * Kept as one string rather than generated, because these exact values were chosen against
 * real clients: nothing here uses pure black or white, and `.link-strong` exists because the
 * primary teal reads as almost nothing on the dark card.
 */
const DARK_MODE_STYLE = `${MARKER}
<style>
  @media (prefers-color-scheme: dark) {
    .logo-light { display: none !important; max-height: 0 !important; overflow: hidden !important; }
    .logo-dark { display: block !important; max-height: none !important; }
    .body-bg { background-color: #14191a !important; }
    .card { background-color: #1c2224 !important; }
    .tint { background-color: #232b2c !important; }
    .t-strong, .t-strong a { color: #eef1f0 !important; }
    .t-body, .t-body a { color: #c3cbc9 !important; }
    .t-muted { color: #94a09d !important; }
    .rule { border-color: #303a3b !important; }
    .badge { background-color: #2b3436 !important; color: #cdd5d3 !important; }
    .trend-figure { color: #8fb8ad !important; }
    .link-strong, .link-strong a, a.link-strong { color: #8fb8ad !important; }
  }
  [data-ogsc] .logo-light { display: none !important; max-height: 0 !important; overflow: hidden !important; }
  [data-ogsc] .logo-dark { display: block !important; max-height: none !important; }
  [data-ogsc] .body-bg { background-color: #14191a !important; }
  [data-ogsc] .card { background-color: #1c2224 !important; }
  [data-ogsc] .tint { background-color: #232b2c !important; }
  [data-ogsc] .t-strong, [data-ogsc] .t-strong a { color: #eef1f0 !important; }
  [data-ogsc] .t-body, [data-ogsc] .t-body a { color: #c3cbc9 !important; }
  [data-ogsc] .t-muted { color: #94a09d !important; }
  [data-ogsc] .rule { border-color: #303a3b !important; }
  [data-ogsc] .badge { background-color: #2b3436 !important; color: #cdd5d3 !important; }
  [data-ogsc] .trend-figure { color: #8fb8ad !important; }
  [data-ogsc] .link-strong, [data-ogsc] .link-strong a { color: #8fb8ad !important; }
</style>`;

export function injectDarkMode(html: string): string {
  if (html.includes(MARKER)) return html;

  const head = html.indexOf("</head>");
  // A fragment with no head is left alone rather than given one: corrupting the markup is
  // worse than shipping it without the dark-mode block.
  if (head === -1) return html;

  return html.slice(0, head) + DARK_MODE_STYLE + html.slice(head);
}

export function wrapMsoLogo(html: string): string {
  return html.replace(
    /<img\b[^>]*\bclass="[^"]*\blogo-dark\b[^"]*"[^>]*>/g,
    (tag: string, offset: number, whole: string) => {
      const preceding = whole.slice(Math.max(0, offset - MSO_OPEN.length), offset);
      if (preceding === MSO_OPEN) return tag;
      return `${MSO_OPEN}${tag}${MSO_CLOSE}`;
    }
  );
}

/**
 * Whether a fragment has anything a reader would call content.
 *
 * The rule: strip every tag, then look for a lowercase letter or a digit. An eyebrow label
 * like "TREND RADAR" or "INTERNAL" fails that test and counts as empty; a sentence, a story
 * title, a percentage, or an unresolved `{{merge_tag}}` passes it.
 *
 * The failure mode, stated plainly: a legitimate all-caps sentence inside an optional row
 * would be judged empty and the row dropped. That is acceptable because the class is only
 * ever seeded onto rows whose own visible text is an eyebrow, and it is why the class is
 * seeded by the template builders in Tasks 11 and 12 rather than offered to editors.
 */
function hasContent(fragment: string): boolean {
  return /[a-z0-9]/.test(fragment.replace(/<[^>]*>/g, " "));
}

interface OptionalElement {
  /** Index of the element's opening `<`. */
  start: number;
  /** Index one past the element's closing `>`. */
  end: number;
  /** Index of the `class="..."` attribute that carried the marker class. */
  classIndex: number;
}

/**
 * The next element carrying OPTIONAL_ROW_CLASS at or after `from`, with its full extent.
 *
 * An Unlayer row is nested tables, so the extent cannot be found by regex: this walks left
 * from the class attribute to the element's `<`, reads the tag name, then counts opening
 * against closing tags of that name until the depth returns to zero.
 *
 * Returns null when the markup is malformed and the depth never balances. Returning the input
 * unchanged is the only safe answer there; guessing an extent would delete real content.
 */
function findOptionalElement(html: string, from: number): OptionalElement | null {
  const attribute = new RegExp(`class="[^"]*\\b${OPTIONAL_ROW_CLASS}\\b[^"]*"`, "g");
  attribute.lastIndex = from;

  const found = attribute.exec(html);
  if (!found) return null;

  const start = html.lastIndexOf("<", found.index);
  if (start === -1) return null;

  const name = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start, found.index + 1));
  if (!name) return null;

  const tag = name[1];
  const scan = new RegExp(`<${tag}\\b|</${tag}\\s*>`, "gi");
  scan.lastIndex = start;

  let depth = 0;
  let step: RegExpExecArray | null;

  while ((step = scan.exec(html)) !== null) {
    if (step[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return { start, end: step.index + step[0].length, classIndex: found.index };
      }
    } else {
      depth += 1;
    }
  }

  return null;
}

export function dropEmptyOptionalRows(html: string): string {
  let result = html;
  let cursor = 0;

  // Bounded rather than `while (true)`: a scanner bug should produce a wrong email once, not
  // hang the send route. Ten optional rows per template is the realistic ceiling.
  for (let guard = 0; guard < 500; guard += 1) {
    const element = findOptionalElement(result, cursor);
    if (!element) break;

    if (hasContent(result.slice(element.start, element.end))) {
      // Kept. Swap the class for a sentinel so the next scan moves past it, and restore every
      // sentinel at the end, which leaves a kept row byte-identical to how it arrived.
      result =
        result.slice(0, element.classIndex) +
        result
          .slice(element.classIndex, element.end)
          .replace(OPTIONAL_ROW_CLASS, KEEP_SENTINEL) +
        result.slice(element.end);
      cursor = element.classIndex;
      continue;
    }

    result = result.slice(0, element.start) + result.slice(element.end);
    cursor = element.start;
  }

  return result.split(KEEP_SENTINEL).join(OPTIONAL_ROW_CLASS);
}

/**
 * The three, in the only order that works.
 *
 * Rows are dropped before the style block is injected, so the scanner never walks the CSS.
 * The MSO wrap comes before injection for the same reason: the injected block contains
 * `.logo-dark` as a selector, and keeping it out of the scanned region is cheaper than
 * teaching the pattern to ignore it.
 */
export function hardenExportedHtml(html: string): string {
  return injectDarkMode(wrapMsoLogo(dropEmptyOptionalRows(html)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/harden-export.test.ts`
Expected: PASS, all 18 tests.

The implementation in Step 3 was run against every test in Step 1 before this plan was
handed over, and all 18 passed. If one fails, suspect the transcription rather than the
design. Two traps were already hit and fixed, and both are load-bearing:

- `KEEP_SENTINEL` must not contain `radar-optional`. A hyphen is a word boundary, so
  `\bradar-optional\b` matches inside `radar-optional-keep` and the loop never terminates.
- `hardenExportedHtml` drops rows **before** injecting the style block, because the injected
  CSS contains `.logo-dark` as a selector and `logo-dark` as scanned text.

- [ ] **Step 5: Test against markup Unlayer actually produced**

Export any existing template from the dashboard editor, paste the HTML into
`tests/fixtures/unlayer-export.html`, and add one test asserting
`hardenExportedHtml` on it is idempotent and does not remove a row that has content. Toy HTML
is not enough for this unit.

- [ ] **Step 6: Commit**

```bash
git add lib/email/harden-export.ts tests/unit/harden-export.test.ts tests/fixtures
git commit -m "Email: reinstate what Unlayer will not emit, after the tags resolve"
```

---

### Task 10: The signed archive routes

**Files:**
- Create: `app/editions/page.tsx`, `app/editions/[id]/page.tsx`
- Modify: `middleware.ts:27-32` (`publicPaths`)
- Modify: `lib/email/edition-template.ts` (the `View in browser` row and the CTA target)

**Interfaces:**
- Consumes: `verifyToken` from Task 7, `hardenExportedHtml` is not needed here (this is a web
  page, not an email), the blocks from `lib/email/edition-blocks.ts`.

- [ ] **Step 1: Add the paths to the allowlist**

In `middleware.ts`, add to `publicPaths` at line 27, with a comment in the voice that file
already uses:

```ts
    /**
     * `/editions` is here because the link arrives in an email and its reader has no
     * session, and for an internal newsletter citing paid sources a login wall with MFA is
     * not the gate that belongs on it.
     *
     * Being public means the HMAC signature is the whole authorization, so this line is only
     * safe next to a page that verifies the token, checks the subscriber actually received
     * the edition, and answers 404 for both failures without distinguishing them.
     */
    "/editions",
```

- [ ] **Step 2: Write the edition page**

`app/editions/[id]/page.tsx`, a server component:

**Use the raw client, and scope by hand.** Import `prisma` from `@/lib/db`, not the
tenant-scoped `db`. A public page has no session and therefore no organization context, which
is exactly what `app/api/unsubscribe/route.ts:3` already does for the same reason. The other
session hardened the tenant client so `update` and `delete` scope on all thirteen models;
reads from a public route sit outside that contract, so this page carries its own scoping and
the code says so in a comment.

1. read `searchParams.t`; `notFound()` when absent
2. `const subscriberId = verifyToken("archive", t)`; `notFound()` when null
3. load the subscriber, taking `organizationId` from it; `notFound()` when the subscriber is
   gone or inactive
4. `await prisma.emailEvent.findFirst({ where: { subscriberId, editionId: id, eventType: "SENT" } })`;
   `notFound()` when null
5. load the edition with `where: { id, organizationId }`, using the organization from step 3,
   never from the URL. Without this a valid token from org A would open an edition of org B
   whenever a `SENT` event happened to exist, and the whole point of the token is that it
   proves one subscriber, not one tenant.
6. build the `EditionEmail` with `buildEditionEmail` and render the blocks into the page
7. `export const metadata = { robots: { index: false, follow: false } }`

Every failure above answers the same `notFound()`. A bad signature, a deleted subscriber, an
edition never sent to them, and an edition in another organization must be indistinguishable,
so the response never reports which editions exist.

- [ ] **Step 3: Write the index page**

`app/editions/page.tsx`: same token check, then list the editions this subscriber has a `SENT`
event for, newest first, each linking to its permalink with the same token forwarded. Same
`robots` metadata.

- [ ] **Step 4: Add the links to the email**

In `lib/email/edition-template.ts`, add a `View in browser` row above the masthead, small and
muted, linking `{{archive_url}}`. Change the CTA at line 476 to link `{{portal_url}}` rather
than `data.portalUrl`, and keep its label `Read the full feed`, which now tells the truth.

Add `archiveUrl: string` to the `EditionEmail` interface and set it in `buildEditionEmail`.

- [ ] **Step 5: Verify by hand**

Start the dev server, mint a token in a scratch script with
`generateToken("archive", "<a real subscriber id>")`, and open
`/editions/<a real edition id>?t=<token>`. Confirm: the page renders; dropping one character
from the token gives 404; a valid token for an edition that subscriber never received gives
404.

- [ ] **Step 6: Run everything and commit**

Run: `npx vitest run` then `npx tsc --noEmit`

```bash
git add app/editions middleware.ts lib/email
git commit -m "Editions: a subscriber can read their edition in a browser, without a login wall"
```

---

### Task 11: v2, the editable frame

**Files:**
- Create: `scripts/templates/radar-frame.ts`
- Modify: `scripts/create-unlayer-templates.ts` (import it, add it to the `templates` array at
  line 1626)

**Interfaces:**
- Produces: `createRadarFrameTemplate(branding: { logoUrl: string; bannerUrl: string }): { design: object; html: string }`

Follow the shape of `createCorporateTemplate` at `scripts/create-unlayer-templates.ts:28`
exactly: a `design` object with `counters`, `body.rows`, `body.values`, `schemaVersion: 16`,
and an `html` string carrying the same merge tags.

Rows, in order. Each row's `_meta.htmlClassNames` carries the dark-mode hooks the hardening
pass needs:

| Row | Contents | `htmlClassNames` |
|---|---|---|
| view-in-browser | text, `{{archive_url}}` link | `px t-muted` |
| masthead | text `AI RADAR.`, text `{{edition_label}} · {{date_range}}` | `px masthead-cell t-strong` |
| accent-rule | html, the 64px rule from `edition-template.ts:454-459` | `px` |
| tldr | text heading, html `{{tldr}}` | `px tint radar-optional` |
| top-story | html `{{top_story}}` | `px radar-optional` |
| sections | html `{{sections}}` | `px` |
| trends | text heading `TREND RADAR`, html `{{trend_radar}}` | `px tint radar-optional` |
| internal | text heading `INTERNAL`, html `{{internal}}` | `px radar-optional` |
| cta | button, `{{portal_url}}`, background `#ff7901` | `px cta` |
| footer | text, `{{unsubscribe_url}}` and the company line | `px t-muted` |

`body.values`: `contentWidth: "640px"`, `backgroundColor: "#eceeed"`,
`textColor: "#3c4547"`, `fontFamily` Arial, and `_meta.htmlClassNames: "u_body body-bg card"`.

- [ ] **Step 1: Write the builder**

Copy `createCorporateTemplate` wholesale as the starting shape, then replace its rows with the
table above. Keep every key the original has, including the `popup*` keys in `body.values`:
Unlayer's schema expects them and omitting them makes the editor load a broken design.

- [ ] **Step 2: Register it**

```ts
      {
        name: "AI Radar Weekly - editable frame",
        description:
          "The built-in edition with an editable frame. Masthead, copy, call to action and footer are Unlayer rows; the stories, topic sections and trend radar arrive as merge tags, because a design cannot hold a loop.",
        ...createRadarFrameTemplate(branding),
      },
```

- [ ] **Step 3: Seed it**

Run: `npx tsx scripts/create-unlayer-templates.ts`
Expected: `Created: AI Radar Weekly - editable frame`.

- [ ] **Step 4: Verify in the editor**

Open `/dashboard/templates`, find the new template, click Edit. Confirm the design loads
without an Unlayer error, all ten rows are present, and the merge-tag palette lists the full
vocabulary from the table in Task 6.

- [ ] **Step 5: Verify a send**

Preview an edition with this template selected. Confirm: the masthead names the week once;
the trend radar row disappears on an edition with no trends; the articles look identical to
v1's; dark mode applies in a client that supports it.

- [ ] **Step 6: Commit**

```bash
git add scripts/templates/radar-frame.ts scripts/create-unlayer-templates.ts
git commit -m "Templates: the AI Radar frame is editable, the body stays code"
```

---

### Task 12: v3, the full conversion

**Files:**
- Create: `scripts/templates/radar-unlayer.ts`
- Modify: `scripts/create-unlayer-templates.ts`

**Interfaces:**
- Produces: `createRadarUnlayerTemplate(branding): { design: object; html: string }`

Same as Task 11, with the frame decomposed further: the TL;DR box becomes a row with its own
text blocks rather than one html block, the trend radar shell becomes a row with a text
heading and a coloured top border, the badges become text blocks. Only `{{sections}}`,
`{{top_story}}`, `{{trend_radar}}` and `{{internal}}` stay as html blocks, because those are
the things that repeat.

- [ ] **Step 1: Build it, then write down what did not fit**

Some of v1's design does not express as Unlayer rows. Expect at least the 64px accent rule and
the inline `Covered by N sources` badge. Each becomes an `html` block inside a row, editable
as HTML but without the visual controls.

Append the actual list to
`docs/superpowers/specs/2026-08-06-editable-radar-template-design.md` under Risk 2, replacing
the sentence that says the list gets written down when it is known. This is the one step in
this plan whose output is a document.

- [ ] **Step 2: Register, seed, verify**

Same three steps as Task 11, with:

```ts
      {
        name: "AI Radar Weekly - Unlayer",
        description:
          "The full edition as an Unlayer design. Every part of the frame is a row you can restyle. The stories, topic sections and trend radar remain merge tags; dark mode, the Outlook conditional and the rows that vanish when empty are reinstated on export.",
        ...createRadarUnlayerTemplate(branding),
      },
```

- [ ] **Step 3: Commit**

```bash
git add scripts/templates/radar-unlayer.ts scripts/create-unlayer-templates.ts docs/superpowers/specs
git commit -m "Templates: the whole AI Radar edition, as an Unlayer design"
```

---

### Task 13: Three templates side by side

**Files:**
- Test: manual

- [ ] **Step 1: Render all three**

Preview the same edition three times, once per template, and screenshot each at 640px and at
320px.

- [ ] **Step 2: Check the list of things that must match**

For each of v2 and v3 against v1: the masthead reads the same; a topic section's articles are
byte-identical; the trend radar figures use the same arrows; dark mode produces the same
colours; the mobile stacking works.

- [ ] **Step 3: Send one test email per template**

Use the test send route to a real inbox. Open each in Outlook desktop and in Gmail on a
phone. The Outlook check is the one that matters: it is the client the MSO conditionals and
the `mso-line-height-rule` declarations exist for.

- [ ] **Step 4: Record what differs**

Any difference that is not deliberate is a bug in Task 11 or 12. Fix it there rather than
patching the hardening pass.

---

### Task 14: The top story image

**Files:**
- Modify: `prisma/schema.prisma` (`Article`, near `capturedAt` at line 241)
- Modify: `lib/curation/rss-collector.ts`
- Modify: `lib/email/edition-data.ts` (set `topStoryImage`)
- Test: `tests/unit/rss-image.test.ts` (create)

**Droppable.** Everything above ships without it. The other session has been in both
`prisma/schema.prisma` and `lib/curation/rss-collector.ts`, so this is where a conflict is
most likely; do it last and re-read both files first.

`edition-template.ts:262` has a two-column branch with a thumbnail and `buildEditionEmail`
never sets `topStoryImage`, so the strongest layout in the design has never appeared in a real
send. `Article` has no image column: `Project` has one at line 330, `Article` does not.

Scraping `og:image` is the wrong answer while `/api/curation/collect` already times out on
Vercel. RSS items usually carry the image themselves.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rss-image.test.ts` asserting a helper
`feedItemImageUrl(item): string | undefined` reads, in order: `media:content[url]` with an
`image/*` type, `media:thumbnail[url]`, `enclosure[url]` with an `image/*` type, and returns
`undefined` when none is present or the URL is not http(s).

- [ ] **Step 2: Run it, implement it, run it again**

Run: `npx vitest run tests/unit/rss-image.test.ts`

- [ ] **Step 3: Add the column**

```prisma
  /**
   * The image the feed itself supplied, from media:content, media:thumbnail or enclosure.
   *
   * Not scraped: fetching og:image per article would add an HTTP request per item to a
   * collection route that already times out on Vercel. Null is the common case and the
   * email's two-column top story falls back to the single-column layout for it.
   */
  imageUrl String?
```

Run: `npx prisma db push && npx prisma generate`

- [ ] **Step 4: Populate it on collection**

In `lib/curation/rss-collector.ts`, set `imageUrl: feedItemImageUrl(item)` where the article
is created. Do not backfill: rows written before this predate the distinction, and inventing
an image for them is inventing data.

- [ ] **Step 5: Wire it to the email**

In `lib/email/edition-data.ts`, add `imageUrl?: string | null` to `SourceArticle` and set
`topStoryImage: lead?.imageUrl ?? undefined` in the returned object. Add `imageUrl: true` to
the article `select` in the routes that assemble `emailData`.

- [ ] **Step 6: Verify**

Preview an edition whose lead article has an image. The two-column top story renders. Preview
one whose lead has none. The single-column layout renders, with no gap.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma lib/curation/rss-collector.ts lib/email/edition-data.ts tests/unit/rss-image.test.ts
git commit -m "Articles: keep the image the feed already sent, and let the top story use it"
```

---

## Ordering note

Task 8 imports `hardenExportedHtml` from Task 9. Execute **9 before 8**, or stub the import
and remove the stub. The phase list puts them in the order 7, 9, 8, 10 for this reason; the
task numbers follow the spec's narrative rather than the execution order.

## Self-review

**Spec coverage.** Every section maps to a task: masthead to 1, 2, 3 and 4; `merge-tags.ts` to
6; `edition-blocks.ts` to 5; `harden-export.ts` to 9; `weekRangeLabel` to 1; the seed scripts
to 11 and 12; per-recipient substitution to 8; purpose-scoped tokens to 7; the archive routes
to 10; the TL;DR rename to 6 Step 8; `Article.imageUrl` to 14. The spec's "out of scope" list
has no tasks, correctly.

**Type consistency.** `weekRangeLabel(week, year)` is used with that signature in Tasks 1 and
3. `editionEmailLabel({ title, week })` takes no `year` in Tasks 2 and 3. `renderMergeTags`
takes `(html, values, options?)` in Tasks 6, 8 and 9. `personalizeHtml(html, { subscriberId,
editionId })` matches between Task 8's test and its implementation. `bullets` uses `url` from
Task 6 Step 8 onward, which is why Task 5's snapshot fixture carries a note about it.

**Validated before handover.** Task 9's implementation was run against all 18 of its tests
outside the repo and passed. That is the one unit whose bug leaves by email, so it was worth
proving rather than asserting. Nothing else in this plan has been executed.

**Known rough edge.** Task 12 Step 1's deliverable is a list nobody can write yet: which parts
of v1's design do not express as Unlayer rows. It is a real step with a real output, not a
placeholder, and it updates Risk 2 of the spec. It is the only step in the plan whose product
is prose.
