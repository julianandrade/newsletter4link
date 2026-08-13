# Sources Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/dashboard/sources` from two stacked collection managers into one shell with four tabs, one heading, one attention banner and one toolbar, without changing any API route or how a source behaves.

**Architecture:** The page becomes a shell that owns the two page-level fetches, the resolved tab, and the email create dialog. Four panels render the existing lists, which lose their own headers, toolbars and fetches and receive `sources` plus `reload` as props. Two new pure modules under `lib/sources/` hold the tab vocabulary and the heading and attention arithmetic, so the judgment calls are unit-testable without a session.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, TailwindCSS 4, Vitest with jsdom, @testing-library/react. The AI Radar vocabulary in `components/radar/` is the only source of visual primitives.

**Spec:** `docs/superpowers/specs/2026-08-13-sources-tabs-design.md`

## Global Constraints

- **Work in this worktree only.** `C:\Users\julian.andrade\prj\n4l-sources`, branch `feat/sources-tabs`. Never `git add -A`; stage explicit paths.
- **No long dashes anywhere**, in code, comments, copy or commit messages. Em dash, en dash, horizontal bar and a minus sign used as punctuation are all banned. Use a comma, a hyphen, or a colon.
- **No API changes.** No route file is edited. No `take`, `skip`, `page` or `sortBy` parameter is added to `/api/rss-sources`.
- **No visual migration.** Every primitive comes from `components/radar/primitives.tsx`, `components/radar/controls.tsx` or `components/radar/sortable.tsx`. No new dependency.
- **Copy is radar sentence case.** "Every category", not "All Categories". "Name, A to Z", not "Name (A-Z)".
- **The heading never says "all healthy".** Zero flagged reads "nothing flagged". The reason is in the spec and in `app/dashboard/sources/page.tsx:45-47`.
- **`healthWarning` from `lib/inbound/health.ts` is the only authority** on which email sources are in trouble. Do not add a second rule.
- **Test commands:** `npx vitest run <file>` for one file, then `npx vitest run`, `npx tsc --noEmit`, `npm run lint` before the final commit of each task. Run them from this worktree; `vitest.config.ts` excludes only `node_modules` and `.next`, so a run that sees another checkout reports its tests too.
- **Dev server port:** anything except 3111 and 3117, both taken. Use `npx next dev --port 3119`.
- **Commit after every task.** One task, one commit, message shaped `Area: action description`.

---

### Task 1: The tab vocabulary

The four tabs, and the rule that an unknown `?tab=` value resolves to Feeds rather than rendering nothing.

**Files:**
- Create: `lib/sources/tabs.ts`
- Test: `tests/unit/sources-tabs.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SOURCES_TABS: readonly ["feeds","email","unmatched","received"]`, `type SourcesTab`, `TAB_LABELS: Record<SourcesTab, string>`, `resolveTab(raw: string | null | undefined): SourcesTab`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/sources-tabs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveTab, SOURCES_TABS, TAB_LABELS } from "@/lib/sources/tabs";

/**
 * The tab is in the URL so the attention banner's jump and a bookmark both work.
 * A URL is typed by hand and pasted between environments, so an unknown value has to
 * resolve to a real tab: rendering no panel at all is how a shared link becomes a blank
 * screen.
 */
describe("resolveTab", () => {
  it("accepts every declared tab", () => {
    for (const tab of SOURCES_TABS) {
      expect(resolveTab(tab)).toBe(tab);
    }
  });

  it("falls back to feeds for an unknown value, null, or nothing", () => {
    expect(resolveTab("rss")).toBe("feeds");
    expect(resolveTab("")).toBe("feeds");
    expect(resolveTab(null)).toBe("feeds");
    expect(resolveTab(undefined)).toBe("feeds");
  });

  it("labels every tab, because a tab with no label cannot be rendered", () => {
    for (const tab of SOURCES_TABS) {
      expect(TAB_LABELS[tab]).toBeTruthy();
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sources-tabs.test.ts`
Expected: FAIL, cannot resolve `@/lib/sources/tabs`.

- [x] **Step 3: Write minimal implementation**

Create `lib/sources/tabs.ts`:

```ts
/**
 * The four things a sources screen shows, as one vocabulary.
 *
 * In the URL rather than in component state, so the attention banner can link to the tab
 * holding the problem and a bookmark survives a reload. Not four sidebar entries: RQ-005
 * AC-4.4 forbids two destinations for one list, and these are four views of one screen.
 */
export const SOURCES_TABS = ["feeds", "email", "unmatched", "received"] as const;

export type SourcesTab = (typeof SOURCES_TABS)[number];

export const TAB_LABELS: Record<SourcesTab, string> = {
  feeds: "Feeds",
  email: "Email",
  unmatched: "Unmatched",
  received: "Received",
};

/** Feeds is the fallback: an unknown value in the URL must still render a screen. */
export function resolveTab(raw: string | null | undefined): SourcesTab {
  return SOURCES_TABS.includes(raw as SourcesTab) ? (raw as SourcesTab) : "feeds";
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sources-tabs.test.ts`
Expected: PASS, 3 tests.

- [x] **Step 5: Commit**

```bash
git add lib/sources/tabs.ts tests/unit/sources-tabs.test.ts
git commit -m "Sources: name the four tabs, and resolve an unknown one to Feeds"
```

---

### Task 2: The heading and attention arithmetic

The two judgment calls in the spec, as pure functions: what the `h1` is allowed to claim, and what counts as needing attention.

**Files:**
- Create: `lib/sources/summary.ts`
- Test: `tests/unit/sources-summary.test.ts`

**Interfaces:**
- Consumes: `SourcesTab` from `lib/sources/tabs.ts`. `sourceHealth`, `healthWarning` from `lib/inbound/health.ts`.
- Produces:
  - `type SourceRow` (the shape `/api/rss-sources` returns, both kinds in one payload)
  - `splitSources(rows: SourceRow[]): { feeds: SourceRow[]; emailSources: SourceRow[] }`
  - `type AttentionLine = { tone: "err" | "warn"; tab: SourcesTab; headline: string; detail: string; jumpLabel: string }`
  - `sourceAttention(input: { feeds: SourceRow[]; emailSources: SourceRow[]; now: Date }): { lines: AttentionLine[]; count: number }`
  - `type HeadingPart = { num?: string; text: string }`
  - `sourcesHeading(input: { feeds: SourceRow[]; emailSources: SourceRow[]; attentionCount: number; isLoading: boolean; lastCollectedLabel?: string | null }): { title: string; subtitle: HeadingPart[] }`

- [x] **Step 1: Write the failing test**

Create `tests/unit/sources-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  sourceAttention,
  sourcesHeading,
  splitSources,
  type SourceRow,
} from "@/lib/sources/summary";

/**
 * The h1 used to count feeds only, while the fold below it was email. Folding the two
 * counts together is what `app/dashboard/sources/page.tsx` warned against, for a reason
 * this module has to keep: an email source never reports a fetch error, so "all healthy"
 * over both kinds vouches for something nothing measured. "Nothing flagged" claims only
 * that no rule fired, which is honest about both.
 */

const NOW = new Date("2026-08-13T12:00:00.000Z");

function feed(over: Partial<SourceRow> = {}): SourceRow {
  return {
    id: "f1",
    name: "arXiv cs.AI",
    category: "Research",
    active: true,
    url: "http://export.arxiv.org/rss/cs.AI",
    lastFetchedAt: "2026-08-13T10:00:00.000Z",
    lastError: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

function emailSource(over: Partial<SourceRow> = {}): SourceRow {
  return {
    id: "e1",
    name: "TLDR AI",
    category: "AI",
    active: true,
    type: "EMAIL",
    senderAddress: "news@tldr.tech",
    expectedCadenceDays: 1,
    lastReceivedAt: "2026-08-13T08:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
    lastFetchedAt: null,
    lastError: null,
    ...over,
  };
}

describe("splitSources", () => {
  it("splits on type EMAIL and treats everything else as a feed", () => {
    const result = splitSources([
      feed({ id: "a" }),
      emailSource({ id: "b" }),
      feed({ id: "c", type: "RSS" }),
    ]);

    expect(result.feeds.map((s) => s.id)).toEqual(["a", "c"]);
    expect(result.emailSources.map((s) => s.id)).toEqual(["b"]);
  });
});

describe("sourcesHeading", () => {
  it("counts both kinds in one total", () => {
    const result = sourcesHeading({
      feeds: [feed({ id: "a" }), feed({ id: "b" })],
      emailSources: [emailSource()],
      attentionCount: 0,
      isLoading: false,
    });

    expect(result.title).toBe("3 sources, nothing flagged");
  });

  it("says nothing flagged, never all healthy", () => {
    const result = sourcesHeading({
      feeds: [feed()],
      emailSources: [],
      attentionCount: 0,
      isLoading: false,
    });

    expect(result.title).not.toMatch(/healthy/i);
    expect(result.title).toContain("nothing flagged");
  });

  it("agrees with itself on singular and plural", () => {
    expect(
      sourcesHeading({
        feeds: [feed()],
        emailSources: [],
        attentionCount: 1,
        isLoading: false,
      }).title
    ).toBe("1 source, 1 needs attention");

    expect(
      sourcesHeading({
        feeds: [feed({ id: "a" }), feed({ id: "b" })],
        emailSources: [],
        attentionCount: 2,
        isLoading: false,
      }).title
    ).toBe("2 sources, 2 need attention");
  });

  it("reads Sources while loading, because a count of zero is a lie mid-flight", () => {
    const result = sourcesHeading({
      feeds: [],
      emailSources: [],
      attentionCount: 0,
      isLoading: true,
    });

    expect(result.title).toBe("Sources");
    expect(result.subtitle).toEqual([]);
  });

  it("puts the figures in parts, so the page can render them as Num", () => {
    const result = sourcesHeading({
      feeds: [feed()],
      emailSources: [emailSource(), emailSource({ id: "e2" })],
      attentionCount: 0,
      isLoading: false,
      lastCollectedLabel: "4h ago",
    });

    expect(result.subtitle).toEqual([
      { num: "1", text: "feed" },
      { num: "2", text: "email" },
      { text: "last collected 4h ago" },
    ]);
  });
});

describe("sourceAttention", () => {
  it("reports failing feeds as an error line pointing at the feeds tab", () => {
    const result = sourceAttention({
      feeds: [
        feed({ id: "a", name: "The Information", lastError: "401, credentials expired" }),
        feed({ id: "b", name: "EU AI Newsroom", lastError: "404, feed moved" }),
        feed({ id: "c" }),
      ],
      emailSources: [],
      now: NOW,
    });

    expect(result.count).toBe(2);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].tone).toBe("err");
    expect(result.lines[0].tab).toBe("feeds");
    expect(result.lines[0].headline).toBe("2 feeds failed on the last run.");
    expect(result.lines[0].detail).toContain("The Information: 401, credentials expired");
    expect(result.lines[0].detail).toContain("EU AI Newsroom: 404, feed moved");
  });

  it("names two failures then counts the rest", () => {
    const result = sourceAttention({
      feeds: [
        feed({ id: "a", name: "One", lastError: "401" }),
        feed({ id: "b", name: "Two", lastError: "402" }),
        feed({ id: "c", name: "Three", lastError: "403" }),
        feed({ id: "d", name: "Four", lastError: "404" }),
      ],
      emailSources: [],
      now: NOW,
    });

    expect(result.lines[0].detail).toContain("and 2 more");
    expect(result.lines[0].detail).not.toContain("Three");
  });

  it("ignores a paused feed's stale error, because nothing is fetching it", () => {
    const result = sourceAttention({
      feeds: [feed({ active: false, lastError: "404, feed moved" })],
      emailSources: [],
      now: NOW,
    });

    expect(result.count).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it("reports a silent email source as a warning line pointing at the email tab", () => {
    const result = sourceAttention({
      feeds: [],
      emailSources: [
        emailSource({
          name: "The Pragmatic Engineer",
          expectedCadenceDays: 7,
          lastReceivedAt: "2026-07-10T08:00:00.000Z",
        }),
      ],
      now: NOW,
    });

    expect(result.count).toBe(1);
    expect(result.lines[0].tone).toBe("warn");
    expect(result.lines[0].tab).toBe("email");
    expect(result.lines[0].headline).toBe("1 email source has gone quiet.");
    expect(result.lines[0].detail).toContain("The Pragmatic Engineer");
  });

  it("never flags a source with no cadence, and never calls it healthy either", () => {
    const result = sourceAttention({
      feeds: [],
      emailSources: [
        emailSource({
          name: "Unscheduled",
          expectedCadenceDays: null,
          lastReceivedAt: "2026-01-01T08:00:00.000Z",
        }),
      ],
      now: NOW,
    });

    expect(result.count).toBe(0);

    const heading = sourcesHeading({
      feeds: [],
      emailSources: [emailSource({ expectedCadenceDays: null })],
      attentionCount: result.count,
      isLoading: false,
    });
    expect(heading.title).toBe("1 source, nothing flagged");
    expect(heading.title).not.toMatch(/healthy/i);
  });

  it("puts feeds before email, because an error outranks a warning", () => {
    const result = sourceAttention({
      feeds: [feed({ lastError: "401" })],
      emailSources: [emailSource({ lastReceivedAt: null, createdAt: "2026-01-01T00:00:00.000Z" })],
      now: NOW,
    });

    expect(result.lines.map((line) => line.tone)).toEqual(["err", "warn"]);
    expect(result.count).toBe(2);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sources-summary.test.ts`
Expected: FAIL, cannot resolve `@/lib/sources/summary`.

- [x] **Step 3: Write minimal implementation**

Create `lib/sources/summary.ts`:

```ts
import { healthWarning, sourceHealth } from "@/lib/inbound/health";
import type { SourcesTab } from "@/lib/sources/tabs";

/**
 * What `/api/rss-sources` returns, both kinds in one payload.
 *
 * One row type rather than two, because the route does not split them and this module is
 * what splits them. The email-only fields are optional for the same reason.
 */
export interface SourceRow {
  id: string;
  name: string;
  category: string;
  active: boolean;
  type?: string;
  url?: string;
  lastFetchedAt: string | null;
  lastError: string | null;
  createdAt: string;
  senderAddress?: string | null;
  inboundTag?: string | null;
  parseMode?: "DIGEST" | "ESSAY" | null;
  expectedCadenceDays?: number | null;
  lastReceivedAt?: string | null;
}

export function splitSources(rows: SourceRow[]): {
  feeds: SourceRow[];
  emailSources: SourceRow[];
} {
  const feeds: SourceRow[] = [];
  const emailSources: SourceRow[] = [];

  for (const row of rows) {
    if (row.type === "EMAIL") emailSources.push(row);
    else feeds.push(row);
  }

  return { feeds, emailSources };
}

export interface AttentionLine {
  tone: "err" | "warn";
  /** Where the jump goes. */
  tab: SourcesTab;
  headline: string;
  detail: string;
  jumpLabel: string;
}

/** Two names, then a count. Four error strings in one line is not a line anyone reads. */
function nameTwoThenCount(details: string[]): string {
  const shown = details.slice(0, 2).join(" · ");
  const rest = details.length - 2;
  return rest > 0 ? `${shown} · and ${rest} more` : shown;
}

/**
 * What needs attention, each kind judged by its own measure.
 *
 * A feed announces its failure and `lastError` carries it. An email source can only fail
 * silently, so `healthWarning` is the authority and this function adds no second opinion:
 * a source with no declared cadence is not flagged, because silence cannot be judged
 * against a cadence nobody set.
 *
 * A paused source is skipped in both cases. Nothing is fetching a paused feed, so its
 * `lastError` is a fact about the past, and flagging it trains people to ignore the flag.
 */
export function sourceAttention({
  feeds,
  emailSources,
  now,
}: {
  feeds: SourceRow[];
  emailSources: SourceRow[];
  now: Date;
}): { lines: AttentionLine[]; count: number } {
  const lines: AttentionLine[] = [];

  const failing = feeds.filter((feed) => feed.active && Boolean(feed.lastError));
  if (failing.length > 0) {
    lines.push({
      tone: "err",
      tab: "feeds",
      headline: `${failing.length} ${failing.length === 1 ? "feed" : "feeds"} failed on the last run.`,
      detail: nameTwoThenCount(failing.map((feed) => `${feed.name}: ${feed.lastError}`)),
      jumpLabel: "Show feeds",
    });
  }

  const quiet = emailSources
    .filter((source) => source.active)
    .map((source) =>
      healthWarning(
        sourceHealth(
          {
            lastReceivedAt: source.lastReceivedAt ?? null,
            expectedCadenceDays: source.expectedCadenceDays ?? null,
            createdAt: source.createdAt,
          },
          now
        ),
        source.name
      )
    )
    .filter((line): line is string => line !== null);

  if (quiet.length > 0) {
    lines.push({
      tone: "warn",
      tab: "email",
      headline: `${quiet.length} email ${quiet.length === 1 ? "source has" : "sources have"} gone quiet.`,
      detail: nameTwoThenCount(quiet),
      jumpLabel: "Show email",
    });
  }

  return { lines, count: failing.length + quiet.length };
}

/** `num` is rendered inside `<Num>`, so the figures keep the mono face. */
export interface HeadingPart {
  num?: string;
  text: string;
}

/**
 * The heading, covering both kinds of source.
 *
 * "Nothing flagged" and never "all healthy". An email source has no feed URL and never
 * reports a fetch error, so a claim of health asserts something nothing measured; a claim
 * that no rule fired is true of both kinds. The count is the honest part, so it leads.
 */
export function sourcesHeading({
  feeds,
  emailSources,
  attentionCount,
  isLoading,
  lastCollectedLabel,
}: {
  feeds: SourceRow[];
  emailSources: SourceRow[];
  attentionCount: number;
  isLoading: boolean;
  lastCollectedLabel?: string | null;
}): { title: string; subtitle: HeadingPart[] } {
  if (isLoading) return { title: "Sources", subtitle: [] };

  const total = feeds.length + emailSources.length;
  const noun = total === 1 ? "source" : "sources";
  const title =
    attentionCount > 0
      ? `${total} ${noun}, ${attentionCount} ${attentionCount === 1 ? "needs" : "need"} attention`
      : `${total} ${noun}, nothing flagged`;

  const subtitle: HeadingPart[] = [
    { num: String(feeds.length), text: feeds.length === 1 ? "feed" : "feeds" },
    { num: String(emailSources.length), text: "email" },
  ];

  if (lastCollectedLabel) {
    subtitle.push({ text: `last collected ${lastCollectedLabel}` });
  }

  return { title, subtitle };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sources-summary.test.ts`
Expected: PASS, 12 tests.

- [x] **Step 5: Check nothing else moved**

Run: `npx vitest run tests/unit/inbound-health.test.ts` then `npx tsc --noEmit`
Expected: PASS, and no type errors.

- [x] **Step 6: Commit**

```bash
git add lib/sources/summary.ts tests/unit/sources-summary.test.ts
git commit -m "Sources: count both kinds in one heading, and flag each by its own measure"
```

---

### Task 3: The tab row and the attention banner

Two presentational components. Nothing fetches; both take what they render.

**Files:**
- Create: `components/sources/sources-tabs.tsx`
- Create: `components/sources/sources-attention.tsx`
- Test: `tests/unit/sources-tab-row.test.tsx`

**Interfaces:**
- Consumes: `SOURCES_TABS`, `SourcesTab`, `TAB_LABELS` from `lib/sources/tabs.ts`. `AttentionLine` from `lib/sources/summary.ts`. `ChipGroup` from `components/radar/primitives.tsx`.
- Produces:
  - `SourcesTabRow({ value, onChange, counts }: { value: SourcesTab; onChange: (next: SourcesTab) => void; counts: Partial<Record<SourcesTab, number | null>> })`
  - `SourcesAttention({ lines, onJump }: { lines: AttentionLine[]; onJump: (tab: SourcesTab) => void })`
- The panel id contract every consumer relies on: `idBase="sources"`, so a panel must carry `id={`sources-panel-${tab}`}` and `aria-labelledby={`sources-tab-${tab}`}`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/sources-tab-row.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SourcesTabRow } from "@/components/sources/sources-tabs";
import { SourcesAttention } from "@/components/sources/sources-attention";
import type { AttentionLine } from "@/lib/sources/summary";

/**
 * The tab row carries the counts an editor acts on, which is why Received has none: its
 * size is not a number anyone does anything about, and fetching it would cost a request
 * for decoration.
 *
 * `aria-controls` has to resolve to a real panel id. ChipGroup only emits it when given an
 * `idBase`, and the page passing none is the state this component exists to prevent.
 */
describe("SourcesTabRow", () => {
  it("shows a count for feeds, email and unmatched, and none for received", () => {
    render(
      <SourcesTabRow
        value="feeds"
        onChange={() => {}}
        counts={{ feeds: 434, email: 4, unmatched: 4 }}
      />
    );

    expect(screen.getByRole("tab", { name: /Feeds/ })).toHaveTextContent("434");
    expect(screen.getByRole("tab", { name: /Email/ })).toHaveTextContent("4");
    expect(screen.getByRole("tab", { name: /Received/ })).not.toHaveTextContent(/\d/);
  });

  it("points every tab at the panel id the page uses", () => {
    render(<SourcesTabRow value="feeds" onChange={() => {}} counts={{}} />);

    expect(screen.getByRole("tab", { name: /Feeds/ })).toHaveAttribute(
      "aria-controls",
      "sources-panel-feeds"
    );
  });

  it("omits a count that is not known yet rather than printing zero", () => {
    render(
      <SourcesTabRow value="feeds" onChange={() => {}} counts={{ unmatched: null }} />
    );

    expect(screen.getByRole("tab", { name: /Unmatched/ })).not.toHaveTextContent(/\d/);
  });

  it("reports the chosen tab", () => {
    const onChange = vi.fn();
    render(<SourcesTabRow value="feeds" onChange={onChange} counts={{}} />);

    fireEvent.click(screen.getByRole("tab", { name: /Unmatched/ }));
    expect(onChange).toHaveBeenCalledWith("unmatched");
  });
});

const FEED_LINE: AttentionLine = {
  tone: "err",
  tab: "feeds",
  headline: "12 feeds failed on the last run.",
  detail: "The Information: 401 · and 11 more",
  jumpLabel: "Show feeds",
};

const EMAIL_LINE: AttentionLine = {
  tone: "warn",
  tab: "email",
  headline: "2 email sources have gone quiet.",
  detail: "Morning Brew IT has never received an email.",
  jumpLabel: "Show email",
};

describe("SourcesAttention", () => {
  it("renders nothing when nothing is flagged", () => {
    const { container } = render(<SourcesAttention lines={[]} onJump={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("carries both kinds in one box", () => {
    render(<SourcesAttention lines={[FEED_LINE, EMAIL_LINE]} onJump={() => {}} />);

    expect(screen.getByText(/12 feeds failed/)).toBeInTheDocument();
    expect(screen.getByText(/2 email sources have gone quiet/)).toBeInTheDocument();
  });

  it("jumps to the tab holding the problem", () => {
    const onJump = vi.fn();
    render(<SourcesAttention lines={[FEED_LINE, EMAIL_LINE]} onJump={onJump} />);

    fireEvent.click(screen.getByRole("button", { name: "Show email" }));
    expect(onJump).toHaveBeenCalledWith("email");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sources-tab-row.test.tsx`
Expected: FAIL, cannot resolve `@/components/sources/sources-tabs`.

- [x] **Step 3: Write the tab row**

Create `components/sources/sources-tabs.tsx`:

```tsx
"use client";

import { ChipGroup, Num } from "@/components/radar/primitives";
import { SOURCES_TABS, TAB_LABELS, type SourcesTab } from "@/lib/sources/tabs";

/**
 * The four tabs, on one row, with the counts an editor acts on.
 *
 * `idBase` is the point of wrapping ChipGroup rather than calling it inline: it is what
 * makes every tab's `aria-controls` resolve, and the screen this replaces passed none.
 * A count of `null` or `undefined` renders no figure at all, because a zero printed while
 * a request is still in flight is a claim, and Received deliberately never has one.
 */
export function SourcesTabRow({
  value,
  onChange,
  counts,
}: {
  value: SourcesTab;
  onChange: (next: SourcesTab) => void;
  counts: Partial<Record<SourcesTab, number | null>>;
}) {
  return (
    // Four tabs with counts do not fit a phone. Scrolling keeps them on one row rather
    // than wrapping into two, which would push the list below the fold on the screen
    // whose whole problem was length.
    <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ChipGroup<SourcesTab>
        label="Sources view"
        idBase="sources"
        value={value}
        onChange={onChange}
        options={SOURCES_TABS.map((tab) => {
          const count = counts[tab];
          return {
            value: tab,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {TAB_LABELS[tab]}
                {typeof count === "number" && <Num>{count}</Num>}
              </span>
            ),
          };
        })}
      />
    </div>
  );
}
```

- [x] **Step 4: Write the attention banner**

Create `components/sources/sources-attention.tsx`:

```tsx
"use client";

import { radarButtonClass } from "@/components/radar/primitives";
import type { AttentionLine } from "@/lib/sources/summary";
import type { SourcesTab } from "@/lib/sources/tabs";
import { cn } from "@/lib/utils";

/**
 * Everything wrong with the sources, in one box above the tabs.
 *
 * There were two boxes: failing feeds on the page and quiet email sources inside the email
 * manager, half a screen apart, so "is anything wrong" had two answers in two places. The
 * box takes the border of its worst line, and each line carries the jump to the tab where
 * the fix is.
 */
export function SourcesAttention({
  lines,
  onJump,
}: {
  lines: AttentionLine[];
  onJump: (tab: SourcesTab) => void;
}) {
  if (lines.length === 0) return null;

  const worst = lines.some((line) => line.tone === "err") ? "err" : "warn";

  return (
    <div
      className={cn(
        "radar-enter mb-5 overflow-hidden rounded-xl border bg-radar-surface",
        worst === "err" ? "border-radar-err" : "border-radar-warn"
      )}
    >
      {lines.map((line, index) => (
        <div
          key={line.tab}
          className={cn(
            "flex flex-wrap items-start gap-3 px-4 py-3",
            index > 0 && "border-t border-radar-line2"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
              line.tone === "err" ? "bg-radar-err" : "bg-radar-warn"
            )}
          />
          <p className="m-0 min-w-0 flex-1 text-[12.5px] text-radar-ink2">
            <span className="font-semibold text-radar-ink">{line.headline}</span>{" "}
            {line.detail}
          </p>
          <button
            type="button"
            onClick={() => onJump(line.tab)}
            className={radarButtonClass("ghost", "sm")}
          >
            {line.jumpLabel}
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/sources-tab-row.test.tsx`
Expected: PASS, 7 tests. The repo has no jest-dom, confirmed while running this task, so every assertion is plain DOM: `textContent`, `getAttribute`, and `container.innerHTML`. No dependency was added.

- [x] **Step 6: Commit**

```bash
git add components/sources/sources-tabs.tsx components/sources/sources-attention.tsx tests/unit/sources-tab-row.test.tsx
git commit -m "Sources: one tab row with the counts, and one banner over both kinds"
```

---

### Task 4: The shell

The page becomes four tabs over the existing lists. The managers still fetch for themselves at this point; that is Task 5. This task must leave the screen working.

**Files:**
- Modify: `app/dashboard/sources/page.tsx` (whole file)

**Interfaces:**
- Consumes: everything from Tasks 1 to 3. `ReceivedEmails` from `components/inbound/received-emails.tsx`, `EmailSourceManager` from `components/email-source-manager.tsx`, `RSSSourceManager` from `components/rss-source-manager.tsx`, all with their current props.
- Produces: the panel id contract, `sources-panel-<tab>`. `useSourcesTab()` is inlined here, not exported.

**Deviation, recorded while executing on 13 August.** The code below reads the tab with
`useSearchParams`. The implementation does not: it reads `window.location.search` in an
effect and writes with `window.history.replaceState`, because this project has already
settled that question twice, at `app/dashboard/page.tsx:112` and
`app/dashboard/asides/page.tsx:87`, both recording that `useSearchParams` would force a
Suspense boundary on the whole screen to prerender. Only the `tab` parameter is touched, so
the preview harness keeps its own `?screen=`. Feeds is the default and stays out of the URL.

- [x] **Step 1: Write the failing test**

There is no test for this task: it is composition over units already tested, and the page reads `useSearchParams`, which needs a router. The gate is Step 4's rendered check. Do not fake a router to manufacture a test here.

- [x] **Step 2: Rewrite the page**

Replace the whole of `app/dashboard/sources/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { EmailSourceManager } from "@/components/email-source-manager";
import { ReceivedEmails } from "@/components/inbound/received-emails";
import { RSSSourceManager } from "@/components/rss-source-manager";
import { SourcesAttention } from "@/components/sources/sources-attention";
import { SourcesTabRow } from "@/components/sources/sources-tabs";
import {
  Num,
  PageHeading,
  radarButtonClass,
  RadarMain,
} from "@/components/radar/primitives";
import {
  sourceAttention,
  sourcesHeading,
  splitSources,
  type SourceRow,
} from "@/lib/sources/summary";
import { resolveTab, type SourcesTab } from "@/lib/sources/tabs";
import { relativeTime } from "@/lib/radar/source";

/**
 * The sources screen: four tabs over one shell.
 *
 * It carried two whole collection managers stacked, each with its own header and toolbar,
 * which measured fifty viewports and twelve headings. What replaces them is one heading
 * covering both kinds, one attention banner, and one list at a time.
 *
 * The tab is in the URL so the banner can link to it and a bookmark survives a reload,
 * written with `replace` so the back button is not filled with tab switches.
 */
export default function SourcesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = resolveTab(params.get("tab"));

  const setTab = useCallback(
    (next: SourcesTab) => {
      const query = new URLSearchParams(params.toString());
      query.set("tab", next);
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const [rows, setRows] = useState<SourceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rss-sources")
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setIsLoading(false));
  }, []);

  const { feeds, emailSources } = useMemo(() => splitSources(rows), [rows]);

  // The clock this screen measures staleness against is taken once per load of the
  // sources, not once per render, for the reason recorded at email-source-manager.tsx:182.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [rows]);

  const attention = useMemo(
    () => sourceAttention({ feeds, emailSources, now }),
    [feeds, emailSources, now]
  );

  const lastCollected = useMemo(() => {
    const stamps = feeds
      .filter((feed) => feed.active)
      .map((feed) => feed.lastFetchedAt)
      .filter((value): value is string => Boolean(value))
      .sort();
    return stamps.length ? relativeTime(stamps[stamps.length - 1]) : null;
  }, [feeds]);

  const heading = sourcesHeading({
    feeds,
    emailSources,
    attentionCount: attention.count,
    isLoading,
    lastCollectedLabel: lastCollected,
  });

  return (
    <>
      <AppHeader />

      <RadarMain width="1240px">
        <PageHeading
          eyebrow="Sources"
          title={heading.title}
          subtitle={heading.subtitle.map((part, index) => (
            <span key={`${part.text}-${index}`}>
              {index > 0 && " · "}
              {part.num ? (
                <>
                  <Num>{part.num}</Num> {part.text}
                </>
              ) : (
                part.text
              )}
            </span>
          ))}
          actions={
            <Link href="/dashboard/curation" className={radarButtonClass()}>
              Curation jobs
            </Link>
          }
        />

        <SourcesAttention lines={attention.lines} onJump={setTab} />

        <SourcesTabRow
          value={tab}
          onChange={setTab}
          counts={{
            feeds: isLoading ? null : feeds.length,
            email: isLoading ? null : emailSources.length,
          }}
        />

        <div
          id={`sources-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`sources-tab-${tab}`}
          tabIndex={0}
          className="mt-5"
        >
          {tab === "feeds" && <RSSSourceManager />}
          {tab === "email" && <EmailSourceManager />}
          {tab === "unmatched" && <EmailSourceManager />}
          {tab === "received" && <ReceivedEmails />}
        </div>
      </RadarMain>
    </>
  );
}
```

Both `email` and `unmatched` render `EmailSourceManager` for now: the unknown-senders block is still inside it and Task 6 is what separates them. This is deliberate and temporary. Leave the duplication visible rather than hiding it behind a prop that Task 6 would delete.

- [x] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: clean. `useSearchParams` in a client component under App Router needs no Suspense boundary here because the page is already `"use client"` and rendered inside the dashboard layout; if the build complains, wrap the export in a `<Suspense fallback={null}>` in this file rather than changing the layout.

- [x] **Step 4: Verify rendered**

```bash
npx next dev --port 3119
```

Then open `http://localhost:3119/radar-preview?screen=sources` and confirm: the heading counts both kinds, the banner shows both lines, all four tabs switch, `?tab=` changes in the URL, and a hand-typed `?tab=nonsense` still renders Feeds. Take a screenshot to `.playwright-mcp/`.

- [x] **Step 5: Commit**

```bash
git add app/dashboard/sources/page.tsx
git commit -m "Sources: four tabs on one shell, with the tab in the URL"
```

---

### Task 5: One fetch, not three

`/api/rss-sources` is requested by the page and by each manager. This task makes the page the only caller and hands the rows down.

**Files:**
- Create: `components/sources/use-source-collections.ts`
- Modify: `app/dashboard/sources/page.tsx`
- Modify: `components/rss-source-manager.tsx:116-200` (props and the load function)
- Modify: `components/email-source-manager.tsx:111-180` (props and the load function)

**Interfaces:**
- Consumes: `splitSources`, `SourceRow` from `lib/sources/summary.ts`.
- Produces: `useSourceCollections(): SourceCollections` with exactly these members:

```ts
export interface SourceCollections {
  feeds: SourceRow[];
  emailSources: SourceRow[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  unknown: UnknownSenderGroup[];
  unknownState: "loading" | "ready" | "forbidden" | "error";
  unknownMessage: string | null;
  unknownTruncated: boolean;
  reloadUnknown: () => Promise<void>;
  reloadAll: () => Promise<void>;
}
```

`UnknownSenderGroup` moves here from `components/email-source-manager.tsx:67-77` and is exported from this module. Both managers gain props `{ sources, isLoading, error, reload }` and delete their own `loadSources`; every existing call to `loadSources()` becomes `reload()`.

- [ ] **Step 1: Write the hook**

Create `components/sources/use-source-collections.ts` with the two fetches lifted verbatim from `email-source-manager.tsx:136-180` and `page.tsx`, keeping the 403 branch, the `truncated` flag and the error wording exactly as they are. `reloadAll` awaits both in parallel with `Promise.all`.

- [ ] **Step 2: Make the managers prop-driven**

In `components/rss-source-manager.tsx`, extend `RSSSourceManagerProps`:

```ts
export interface RSSSourceManagerProps {
  /** Optional class name for the container */
  className?: string;
  /** The feeds, already split out of /api/rss-sources by the page. */
  sources: RSSSource[];
  loading: boolean;
  error: string | null;
  /** Refetch, owned by the page. Called after every mutation, as loadSources was. */
  reload: () => Promise<void>;
}
```

Delete the `sources`, `loading` and `error` `useState` declarations at `:127-130`, delete `loadSources` and its `useEffect`, and replace every `loadSources()` call with `reload()`. Where a handler calls `setError(...)`, keep local state for the handler's own error under a new name, `actionError`, so the page's load error and a failed test-fetch stay distinguishable.

Apply the same change to `components/email-source-manager.tsx`: delete its `loadSources`, `setSources` for the initial load, `loadUnknown`, and the unknown-sender state, taking all of it from props. The optimistic parse-mode update at `:350-389` keeps its local `setSources`, so the component needs a local copy of the rows synchronised from props with a `useEffect`; that is the one place local state stays.

- [ ] **Step 3: Wire the page**

In `app/dashboard/sources/page.tsx`, replace the inline `fetch` and `useState` with `const collections = useSourceCollections();` and pass the pieces down. The `unmatched` panel still renders `EmailSourceManager` until Task 6.

- [ ] **Step 4: Verify one request**

Run the dev server, open the real dashboard route, and confirm in the network panel that `/api/rss-sources` appears **once** per load. Three today.

Run: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add components/sources/use-source-collections.ts app/dashboard/sources/page.tsx components/rss-source-manager.tsx components/email-source-manager.tsx
git commit -m "Sources: one fetch of the source list, owned by the page"
```

---

### Task 6: Unmatched becomes its own tab, and the create form becomes a dialog

**Files:**
- Create: `components/sources/unknown-senders.tsx`
- Create: `components/sources/email-source-dialog.tsx`
- Modify: `components/email-source-manager.tsx` (remove both blocks)
- Modify: `app/dashboard/sources/page.tsx` (own the draft, render the dialog)

**Interfaces:**
- Consumes: `UnknownSenderGroup` from `components/sources/use-source-collections.ts`.
- Produces:
  - `UnknownSenders({ groups, state, message, truncated, onPromote }: { groups: UnknownSenderGroup[]; state: "loading" | "ready" | "forbidden" | "error"; message: string | null; truncated: boolean; onPromote: (group: UnknownSenderGroup) => void })`
  - `EmailSourceDialog({ draft, onDraftChange, onClose, onCreated }: { draft: NewSourceDraft | null; onDraftChange: (draft: NewSourceDraft) => void; onClose: () => void; onCreated: (sender: string) => Promise<void> })`
  - `NewSourceDraft` and `emptyDraft` move to `components/sources/email-source-dialog.tsx` and are exported from it.

- [ ] **Step 1: Lift the unknown-senders block**

Move `components/email-source-manager.tsx:729-818` into the new component unchanged, including the explanation paragraph, the `truncated` sentence, the subject samples and the 403 and error branches. The only change is that `promote` becomes the `onPromote` prop.

- [ ] **Step 2: Lift the create form into a dialog**

Move the form at `components/email-source-manager.tsx:441-581` into `EmailSourceDialog`, wrapped in the `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` and `DialogFooter` primitives already imported by `rss-source-manager.tsx`. The dialog is open when `draft !== null`. Keep all six fields, all their helper paragraphs, and the parse-mode pair exactly as written. Delete the `scrollIntoView` call: a dialog does not need it.

`onCreated` receives the normalised sender address and is where the page requeues held emails, which is the behaviour at `:305-327`, moved rather than rewritten.

- [ ] **Step 3: Own the draft in the page**

```tsx
const [draft, setDraft] = useState<NewSourceDraft | null>(null);

const promote = useCallback((group: UnknownSenderGroup) => {
  // The From header's display name when there is one, since it is the newsletter's own
  // name. The local part is the fallback, and a poor one: it turns "The Rundown AI" into
  // "News".
  const local = group.sender.split("@")[0] ?? group.sender;
  const fromLocal = local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

  setDraft({
    ...emptyDraft,
    name: displayName(group.displayFrom) ?? fromLocal ?? group.sender,
    senderAddress: group.sender,
    inboundTag: group.tags[0] ?? "",
  });
}, []);
```

On success the page calls `reloadAll()` and `setTab("email")`, so promoting from Unmatched lands on the source it just created.

- [ ] **Step 4: Verify the whole promote path**

Run the dev server against the harness. Open the Unmatched tab, press Promote, confirm the dialog opens prefilled with the sender and a sensible name, cancel it, press Promote again, and submit. Confirm the tab switches to Email.

Run: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`

- [ ] **Step 5: Commit**

```bash
git add components/sources/unknown-senders.tsx components/sources/email-source-dialog.tsx components/email-source-manager.tsx app/dashboard/sources/page.tsx
git commit -m "Sources: unmatched senders as a tab, and one dialog for a new email source"
```

---

### Task 7: One filter bar, one vocabulary

**Files:**
- Create: `components/sources/source-filter-bar.tsx`
- Modify: `components/rss-source-manager.tsx:724-806` (replace the toolbar markup, and the header block at `:699-722`)
- Modify: `components/email-source-manager.tsx` (replace its toolbar markup)
- Modify: `components/inbound/received-emails.tsx` (replace its toolbar markup)

**Interfaces:**
- Produces:

```tsx
export function SourceFilterBar({
  search,
  onSearch,
  searchLabel,
  searchPlaceholder,
  selects,
  sort,
  actions,
  onClear,
}: {
  search: string;
  onSearch: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  /** Each select owns its own state; the bar only lays them out. */
  selects?: React.ReactNode;
  sort?: React.ReactNode;
  /** Import, add, and anything else that acts on the collection rather than filtering it. */
  actions?: React.ReactNode;
  /** Rendered only when something is actually set. */
  onClear?: (() => void) | null;
}): React.JSX.Element;
```

- [ ] **Step 1: Build the bar**

Search box on the left using `RadarInput` with `SearchIcon`, copied from the shape at `email-source-manager.tsx:592-606` since that one is already radar-native. Then `selects`, then `sort`, then a spacer, then `actions`. `onClear` renders a ghost button reading "Clear filters".

- [ ] **Step 2: Delete the second page header**

Remove `components/rss-source-manager.tsx:699-722` entirely: the `h2`, the subtitle, and the two buttons. `Import OPML` and `Add Source` move into the bar's `actions`, and `Add Source` becomes `Add feed`. The count that was in the subtitle is now in the tab row. This is **D1**.

- [ ] **Step 3: Convert the three toolbars**

Replace the RSS toolbar's shadcn `Select` trio with `RadarSelect` inside the bar, and change the option copy to the radar dialect:

| Was | Becomes |
|---|---|
| All Categories | Every category |
| All Status | Every status |
| Name (A-Z) | Name, A to Z |
| Name (Z-A) | Name, Z to A |
| Category (A-Z) | Category, A to Z |
| Category (Z-A) | Category, Z to A |
| Newest First | Added most recently |
| Oldest First | Added first |
| Recently Fetched | Fetched most recently |
| Least Recently Fetched | Fetched longest ago |

Use `SortSelect` from `components/radar/sortable.tsx` with a `SortOption<SortOption>[]` table rather than the hand-rolled `${sortBy}-${sortDirection}` token at `:774-796`; `sortToken` already encodes the pair as `field:direction`.

Do the same for the email and received toolbars, which keep their existing option copy since it is already in the right dialect.

- [ ] **Step 4: Verify**

Run: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`. Then in the harness, confirm each of the three tabs shows one toolbar, that filtering and sorting still work on all three, and that the second heading is gone.

- [ ] **Step 5: Commit**

```bash
git add components/sources/source-filter-bar.tsx components/rss-source-manager.tsx components/email-source-manager.tsx components/inbound/received-emails.tsx
git commit -m "Sources: one filter bar in one vocabulary, and the second page header gone"
```

---

### Task 8: A page size for the feeds

434 rows in the DOM is what makes the tab tall. This is **D8**.

**Files:**
- Modify: `components/rss-source-manager.tsx:506-582` (slice before grouping) and `:865-946` (the select-all row and the list)
- Test: `tests/unit/sources-page-window.test.ts`

**Interfaces:**
- Produces: `pageWindow<T>(rows: T[], page: number, pageSize: number): { rows: T[]; page: number; totalPages: number }` exported from `lib/sources/summary.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/sources-page-window.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pageWindow } from "@/lib/sources/summary";

/**
 * Paging is what keeps the tab short, and the clamp is what keeps it usable: a filter that
 * narrows 434 feeds to 12 while the pager sits on page 6 would otherwise show an empty
 * list under a pager reading "Page 6 of 1", which is how the curation history used to
 * blank itself.
 */
describe("pageWindow", () => {
  const rows = Array.from({ length: 120 }, (_, index) => index);

  it("returns the requested slice", () => {
    const result = pageWindow(rows, 2, 50);
    expect(result.rows[0]).toBe(50);
    expect(result.rows).toHaveLength(50);
    expect(result.totalPages).toBe(3);
  });

  it("clamps a page beyond the end back to the last one", () => {
    expect(pageWindow(rows, 9, 50).page).toBe(3);
  });

  it("clamps a page below one", () => {
    expect(pageWindow(rows, 0, 50).page).toBe(1);
  });

  it("reports one page for an empty list rather than zero", () => {
    const result = pageWindow([], 1, 50);
    expect(result.totalPages).toBe(1);
    expect(result.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sources-page-window.test.ts`
Expected: FAIL, `pageWindow` is not exported.

- [ ] **Step 3: Implement**

Add to `lib/sources/summary.ts`:

```ts
/**
 * One page of a filtered list, with the page clamped into range.
 *
 * Clamped rather than trusted, because the page number outlives the filter that made it
 * reachable: narrowing the list under a pager on page 6 has to land somewhere real.
 */
export function pageWindow<T>(
  rows: T[],
  page: number,
  pageSize: number
): { rows: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const clamped = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const start = (clamped - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), page: clamped, totalPages };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sources-page-window.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Apply it to the list**

In `components/rss-source-manager.tsx`:

```tsx
const FEEDS_PER_PAGE = 50;

const [page, setPage] = useState(1);

// Filters and sort change what page 1 even means, so the pager goes back to it.
useEffect(() => {
  setPage(1);
}, [searchQuery, categoryFilter, statusFilter, sortBy, sortDirection]);

const window = pageWindow(filteredSources, page, FEEDS_PER_PAGE);
```

Then group `window.rows` instead of `filteredSources` when building `sourcesByCategory` at `:557`, so `orderedIds`, `useSelection`, shift-click ranges and the bulk bar all act on the visible page and nothing else. Change the select-all label at `:877` to `Select all ${window.rows.length} on this page` and the count beside it to `${selection.count} of ${window.rows.length} on this page selected`.

Render `<Pagination page={window.page} totalPages={window.totalPages} onPage={setPage} />` from `components/radar/controls.tsx` below the list.

- [ ] **Step 6: Verify the height**

In the harness with its 434-feed stub, measure the Feeds tab:

```js
document.documentElement.scrollHeight / 900
```

Expected: under 3. It was 50.6. Confirm the bulk bar's count matches the select-all label, that a filter narrowing the list resets the pager, and that page 2 shows different feeds.

Run: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`

- [ ] **Step 7: Commit**

```bash
git add lib/sources/summary.ts tests/unit/sources-page-window.test.ts components/rss-source-manager.tsx
git commit -m "Feeds: fifty per page, so select-all means what the bulk bar acts on"
```

---

### Task 9: Arrow keys on the tab row

`ChipGroup` renders `role="tablist"` on ten screens and supports none of that pattern's keyboard contract.

**Files:**
- Modify: `components/radar/primitives.tsx:202-262`
- Test: `tests/unit/sources-tab-row.test.tsx` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change. `ChipGroup` gains roving tabindex, Left, Right, Home and End when `kind === "tabs"`. When `kind === "options"` it stays a radiogroup and is untouched.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/sources-tab-row.test.tsx`:

```tsx
describe("SourcesTabRow keyboard", () => {
  it("keeps one tab in the tab order", () => {
    render(<SourcesTabRow value="email" onChange={() => {}} counts={{}} />);

    const tabs = screen.getAllByRole("tab");
    const reachable = tabs.filter((tab) => tab.tabIndex === 0);
    expect(reachable).toHaveLength(1);
    expect(reachable[0]).toHaveTextContent("Email");
  });

  it("moves selection with Left and Right, and wraps", () => {
    const onChange = vi.fn();
    render(<SourcesTabRow value="feeds" onChange={onChange} counts={{}} />);

    fireEvent.keyDown(screen.getByRole("tab", { name: /Feeds/ }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("email");

    fireEvent.keyDown(screen.getByRole("tab", { name: /Feeds/ }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("received");
  });

  it("jumps to the ends with Home and End", () => {
    const onChange = vi.fn();
    render(<SourcesTabRow value="email" onChange={onChange} counts={{}} />);

    fireEvent.keyDown(screen.getByRole("tab", { name: /Email/ }), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("received");

    fireEvent.keyDown(screen.getByRole("tab", { name: /Email/ }), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("feeds");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sources-tab-row.test.tsx`
Expected: FAIL on the three new tests, PASS on the earlier seven.

- [ ] **Step 3: Implement in ChipGroup**

Inside the `options.map` in `components/radar/primitives.tsx`, add to each button when `isTabs`:

```tsx
tabIndex={isTabs ? (active ? 0 : -1) : undefined}
onKeyDown={
  isTabs
    ? (event) => {
        const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
        if (!keys.includes(event.key)) return;
        event.preventDefault();

        const last = options.length - 1;
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : event.key === "ArrowRight"
                ? (index + 1) % options.length
                : (index - 1 + options.length) % options.length;

        onChange(options[next].value);
        // Selection and focus move together, which is the automatic-activation form of
        // the pattern. Every tab here switches a rendered panel with no request, so
        // arrowing through them costs nothing and manual activation would add a keypress.
        const target = event.currentTarget.parentElement?.children[next];
        if (target instanceof HTMLElement) target.focus();
      }
    : undefined
}
```

`options.map` must expose `index`. Add a short comment above the group noting that ten screens share this primitive.

- [ ] **Step 4: Run every test that touches ChipGroup**

Run: `npx vitest run` then `npx tsc --noEmit` then `npm run lint`
Expected: clean. Then open two other screens that use `ChipGroup` in the harness, `?screen=analytics` and `?screen=subscribers`, and confirm clicking still switches and nothing else changed.

- [ ] **Step 5: Commit**

```bash
git add components/radar/primitives.tsx tests/unit/sources-tab-row.test.tsx
git commit -m "Radar: give ChipGroup the keyboard contract its tablist role claims"
```

---

### Task 10: Verification and the record

**Files:**
- Modify: `CLAUDE.md` (one row in the decision table)

- [ ] **Step 1: The CI trio, in CI's order**

```bash
npx vitest run
npx tsc --noEmit
npm run lint
```

All three must pass. Report the actual counts, not "tests pass".

- [ ] **Step 2: Rendered, at both widths**

In the harness on port 3119, capture all four tabs at 1440 by 900 and at 390 by 844, into `.playwright-mcp/`. Confirm:
- Feeds tab under 3 viewports at 1440. It was 50.6.
- The tab row scrolls rather than wrapping at 390.
- No horizontal scroll on the page body at either width.
- `/api/rss-sources` requested once per load.

- [ ] **Step 3: The mechanical scan**

```bash
node "C:/Users/julian.andrade/.claude/skills/impeccable/scripts/detect.mjs" --json --scope layout app/dashboard/sources/page.tsx components/sources
```

Fix what it finds, or record why a finding does not apply.

- [ ] **Step 4: Add the decision row**

Append one row to `CLAUDE.md`'s Architecture Decisions table, in the voice of the rows already there: everything a source screen shows is a tab on one row, the heading counts both kinds and never vouches for health nothing measured, and the feeds list pages in the browser because the route returns the complete set.

- [ ] **Step 5: Commit and open the PR**

```bash
git add CLAUDE.md
git commit -m "Docs: record the sources tab decision"
git push -u origin feat/sources-tabs
gh pr create --title "Sources: four tabs on one shell" --body "..."
```

The PR body carries: what changed, the before and after measurements, the four verification results from Step 2, and the two follow-ups the spec left out of scope. **Do not merge.** Report the PR green and stop there; merging master deploys to production and that is Julian's call.

---

## Self-review

**Spec coverage.** Every section maps to a task: IA and URL state to Tasks 1 and 4; the heading and attention rules to Task 2; the components table to Tasks 3, 5, 6 and 7; contracts to Tasks 2 and 5; the data layer and **D7** to Task 5; the promote flow and **D4**, **D5** to Task 6; the filter bar and **D3**, and **D1** with the second header, to Task 7; pagination and **D8** to Task 8; accessibility to Tasks 3 and 9; testing and verification to every task and to Task 10. **D2** and **D6** are closed by Tasks 2 and 4 together.

**States.** Loading, load failure, 403, empty, no-match and narrow are all carried by the components that already implement them, moved rather than rewritten, and Task 4 Step 4 plus Task 10 Step 2 are where they are checked rendered. There is no task that invents a new empty state, because the spec asks for none.

**Type consistency.** `SourceRow` is defined in Task 2 and consumed in Tasks 4, 5 and 8. `SourcesTab` in Task 1, consumed in 2, 3 and 4. `AttentionLine` in Task 2, consumed in 3. `SourceCollections` and `UnknownSenderGroup` in Task 5, consumed in 6. `pageWindow` in Task 8. `NewSourceDraft` and `emptyDraft` move in Task 6 and are exported from `email-source-dialog.tsx`. The panel id contract, `sources-panel-<tab>` and `sources-tab-<tab>`, is asserted in Task 3 and honoured in Task 4.

**One deliberate temporary state.** Task 4 renders `EmailSourceManager` for both the `email` and `unmatched` tabs, and Task 6 separates them. Tasks 4 and 5 must not be reported as finishing the Unmatched tab.
