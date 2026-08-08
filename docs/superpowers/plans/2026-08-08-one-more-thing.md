# One More Thing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every edition can close with a curated joke, editor note or internal spotlight, optionally carrying an uploaded image or GIF.

**Architecture:** One `Aside` table is the single source for anything that appears in the closing slot, including free text typed at send time. The block renders through a new `{{one_more_thing}}` merge tag so the built-in renderer, both Unlayer variants and the Unlayer palette all get it from one edit. Image upload reuses the `newsletter-media` Supabase bucket and `MediaLibrary` component that already exist, hardened first.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7 + PostgreSQL (Supabase), Vitest 4, TailwindCSS 4 + shadcn/ui, Supabase Storage, `@anthropic-ai/sdk`.

**Spec:** [docs/superpowers/specs/2026-08-08-one-more-thing-design.md](../specs/2026-08-08-one-more-thing-design.md)

## Global Constraints

- **No dash wider than a hyphen, anywhere.** No em dash, en dash, horizontal bar, or minus sign used as punctuation. This covers code, comments, commit messages, UI copy, email copy and this plan's output. Use a comma, a hyphen, or a colon.
- **Dashboard chrome is English.** Only generated content follows the organization's language. The email's block heading is English too, matching `Internal` and `Top story`.
- **Do not switch branches, do not stash, do not create worktrees.** Another Claude session is active in this repository. Commit only the files each task names.
- **Every task ends green:** `npx vitest run` passes, `npx tsc --noEmit` is clean.
- **Commit message format:** `Area: action description`, ending with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer.
- **Schema changes** are applied with `npx prisma db push && npx prisma generate`. There are no migration files in this project.
- **Merge tag descriptions** must be longer than 10 characters and end with a period. `tests/unit/merge-tags.test.ts:53` asserts it.
- **Never trust a client-declared MIME type.** Sniff bytes server-side.

---

### Task 1: The `Aside` model, the enums, and the tenant contract

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/db/tenant.ts` (add an `aside` entry beside `mediaAsset` at line 459, and add `"aside"` to the `TenantModel` union at line 38)
- Test: `tests/unit/tenant-scoping.test.ts` (add `"aside"` to the `MODELS` list at line 48)

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `Aside`, enums `AsideKind` (`JOKE | NOTE | SPOTLIGHT`), `AsideStatus` (`PENDING | APPROVED | RETIRED`), `AsideSource` (`HUMAN | MODEL`); `Edition.asideId: string | null` and `Edition.aside`; `db.aside` on the tenant client with `findMany`, `findFirst`, `findUnique`, `create`, `update`, `delete`, `count`, `updateMany`.

- [ ] **Step 1: Add the enums and the model to the schema**

Append to `prisma/schema.prisma`:

```prisma
enum AsideKind {
  JOKE
  NOTE
  SPOTLIGHT
}

enum AsideStatus {
  PENDING
  APPROVED
  RETIRED
}

enum AsideSource {
  HUMAN
  MODEL
}

/**
 * The closing slot's library. Everything that appears in an edition's "one more thing"
 * block is a row here, including free text typed on the send screen, so that
 * "what did edition 32 send" has one answer and one code path.
 */
model Aside {
  id String @id @default(cuid())

  kind   AsideKind   @default(JOKE)
  status AsideStatus @default(APPROVED)

  /** Kept after approval: whether a forwarded joke came from a person is worth knowing later. */
  source AsideSource @default(HUMAN)

  /** The payload. Required even with an image, because it is also the image's alt text. */
  text String

  /** A public URL from the newsletter-media bucket. */
  imageUrl String?

  attribution String?

  /**
   * Filtered against OrgSettings.rewriteLanguage. A machine-translated joke is not a joke,
   * so a second language is a second hand-written row, never a translation of this one.
   */
  language String @default("pt-PT")

  /** False on free text typed at send time, so a one-off note never returns in the picker. */
  reusable Boolean @default(true)

  /** Written when an edition is sent, never when one is chosen or previewed. */
  lastUsedAt DateTime?
  useCount   Int       @default(0)

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId String

  editions Edition[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([organizationId, status, kind, language, lastUsedAt])
  @@index([organizationId, status, createdAt(sort: Desc)])
}
```

Add to the `Edition` model, beside `sentSnapshot`:

```prisma
  /**
   * The closing block this edition will send. SetNull and not Cascade: retiring a joke
   * must never delete an edition.
   */
  aside   Aside?  @relation(fields: [asideId], references: [id], onDelete: SetNull)
  asideId String?
```

Add to the `Organization` model, beside its other relation lists:

```prisma
  asides Aside[]
```

- [ ] **Step 2: Push the schema and regenerate the client**

Run: `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema" and a generated client.

- [ ] **Step 3: Write the failing test**

In `tests/unit/tenant-scoping.test.ts`, add `"aside"` to the `MODELS` array (line 48).

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/unit/tenant-scoping.test.ts`
Expected: FAIL, because `db.aside` is undefined on the tenant client.

- [ ] **Step 5: Add the tenant client entry**

In `lib/db/tenant.ts`, add `| "aside"` to the `TenantModel` union near line 38, then add this block after the `mediaAsset` entry (which ends around line 495):

```ts
    // ==================== ASIDES ====================
    aside: {
      findMany: <T extends Prisma.AsideFindManyArgs>(args?: T) =>
        prisma.aside.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findFirst: <T extends Prisma.AsideFindFirstArgs>(args?: T) =>
        prisma.aside.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findUnique: <T extends Prisma.AsideFindUniqueArgs>(args: T) =>
        prisma.aside.findUnique(args).then((result) =>
          result?.organizationId === organizationId ? result : null
        ),

      create: <T extends Prisma.AsideCreateArgs>(args: T) =>
        prisma.aside.create({
          ...args,
          data: { ...args.data, organizationId },
        } as T),

      update: <T extends Prisma.AsideUpdateArgs>(args: T) =>
        prisma.aside.update({
          ...args,
          where: { ...args.where, organizationId },
        } as T),

      updateMany: <T extends Prisma.AsideUpdateManyArgs>(args: T) =>
        prisma.aside.updateMany({
          ...args,
          where: { ...args.where, organizationId },
        } as T),

      delete: <T extends Prisma.AsideDeleteArgs>(args: T) =>
        prisma.aside.delete({
          ...args,
          where: { ...args.where, organizationId },
        } as T),

      count: <T extends Prisma.AsideCountArgs>(args?: T) =>
        prisma.aside.count({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),
    },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/tenant-scoping.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma lib/db/tenant.ts tests/unit/tenant-scoping.test.ts
git commit -m "Schema: an edition can carry a closing aside"
```

---

### Task 2: The email block and the merge tag

**Files:**
- Modify: `lib/email/edition-template.ts` (add `EmailAside`, add `oneMoreThing?` to `EditionEmail` near line 104, place the block in the built-in template near line 245)
- Modify: `lib/email/edition-blocks.ts` (add `oneMoreThingBlock`)
- Modify: `lib/email/edition-data.ts` (add `oneMoreThing?` to `EditionInput` near line 40, pass it through in `buildEditionEmail`)
- Modify: `lib/email/merge-tags.ts` (add the tag to `RADAR_MERGE_TAGS`, add the value to `editionMergeValues`)
- Test: `tests/unit/one-more-thing-block.test.ts` (create)
- Test: `tests/unit/__snapshots__/edition-template-snapshot.test.ts.snap` (regenerate)

**Interfaces:**
- Consumes: `escapeHtml`, `safeUrl`, `topPadding`, `HeadingOption`, `SANS`, `PRIMARY`, `BODY_INK`, `MUTED` from `lib/email/edition-blocks.ts`.
- Produces:
  - `interface EmailAside { kind: "JOKE" | "NOTE" | "SPOTLIGHT"; text: string; imageUrl?: string; attribution?: string }` exported from `lib/email/edition-template.ts`
  - `oneMoreThingBlock(aside: EmailAside | undefined, options?: HeadingOption): string` exported from `lib/email/edition-blocks.ts`
  - `EditionEmail.oneMoreThing?: EmailAside`
  - `EditionInput.oneMoreThing?: EmailAside`
  - merge tag name `one_more_thing`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/one-more-thing-block.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { oneMoreThingBlock } from "@/lib/email/edition-blocks";

describe("oneMoreThingBlock", () => {
  it("renders nothing when there is no aside, so the row can be dropped", () => {
    expect(oneMoreThingBlock(undefined)).toBe("");
  });

  it("renders the text", () => {
    const html = oneMoreThingBlock({ kind: "JOKE", text: "Ship it on Friday." });
    expect(html).toContain("Ship it on Friday.");
  });

  it("escapes the text, because a suggestion can come from a model", () => {
    const html = oneMoreThingBlock({
      kind: "JOKE",
      text: '<script>alert(1)</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("gives the image the aside's own text as alt, never an empty one", () => {
    const html = oneMoreThingBlock({
      kind: "JOKE",
      text: "A senior engineer reviews a diff no human wrote.",
      imageUrl: "https://example.supabase.co/meme.gif",
    });
    expect(html).toContain('alt="A senior engineer reviews a diff no human wrote."');
    expect(html).not.toContain('alt=""');
  });

  it("drops an image URL that is not http or https", () => {
    const html = oneMoreThingBlock({
      kind: "JOKE",
      text: "Fine.",
      imageUrl: "javascript:alert(1)",
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
  });

  it("renders the attribution when there is one", () => {
    const html = oneMoreThingBlock({
      kind: "NOTE",
      text: "Welcome to the four new joiners.",
      attribution: "Julian",
    });
    expect(html).toContain("Julian");
  });

  it("drops its own heading when the template owns the headings", () => {
    const withHeading = oneMoreThingBlock({ kind: "JOKE", text: "x" });
    const headless = oneMoreThingBlock({ kind: "JOKE", text: "x" }, { heading: false });
    expect(withHeading).toContain("One more thing");
    expect(headless).not.toContain("One more thing");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/one-more-thing-block.test.ts`
Expected: FAIL with "oneMoreThingBlock is not a function" or an import error.

- [ ] **Step 3: Add the `EmailAside` type**

In `lib/email/edition-template.ts`, beside `EmailInternal`, add:

```ts
/**
 * The closing block's content. `text` is required even when there is an image, because
 * it is also the image's alt text: many corporate clients block images until the reader
 * loads them, and a meme whose joke lives only in the picture reaches them as an empty box.
 */
export interface EmailAside {
  kind: "JOKE" | "NOTE" | "SPOTLIGHT";
  text: string;
  imageUrl?: string;
  attribution?: string;
}
```

And add to `EditionEmail`, after `internal?: EmailInternal;` (line 104):

```ts
  /** The closing "one more thing" block. Absent on an edition that chose none. */
  oneMoreThing?: EmailAside;
```

- [ ] **Step 4: Write the block**

In `lib/email/edition-blocks.ts`, after `internalBlock` (which ends at line 419), add:

```ts
/**
 * The closing block: a joke, an editor's note, or an internal spotlight.
 *
 * The image is optional and the text is not, on purpose. The custom-block image renderer
 * in template-renderer.ts emits `alt=""`, which drops the whole message for anyone whose
 * client blocks images; this one uses the aside's own text, so the joke survives.
 *
 * An explicit `width` alongside `max-width:100%` so Outlook reserves the box before the
 * image loads. No dark-mode colour is introduced: the existing `.tint`, `.t-body` and
 * `.t-muted` classes already carry the `[data-ogsc]` mirror.
 */
export function oneMoreThingBlock(
  aside: EmailAside | undefined,
  options: HeadingOption = {}
): string {
  if (!aside) return "";

  const heading = options.heading !== false;
  const image = safeUrl(aside.imageUrl);
  const text = escapeHtml(aside.text);

  return `<tr><td class="px" style="padding:${topPadding(heading, "30px")} 40px 0 40px;">
  ${
    heading
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background-color:${PRIMARY}; padding:4px 8px; font-family:${SANS}; font-size:10px; line-height:14px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.4px; color:#ffffff; text-transform:uppercase;">One more thing</td>
  </tr></table>`
      : ""
  }
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="tint" style="background-color:${TINT}; border-left:3px solid ${ACCENT}; margin-top:${
    heading ? "12px" : "0"
  };"><tr><td style="padding:16px 20px;">
  ${
    image
      ? `<img src="${escapeHtml(
          image
        )}" alt="${text}" width="516" style="display:block; width:100%; max-width:516px; height:auto; border:0; margin-bottom:12px;">`
      : ""
  }
  <div class="t-body" style="font-family:${SANS}; font-size:15px; line-height:23px; mso-line-height-rule:exactly; color:${BODY_INK};">${text}</div>
  ${
    aside.attribution
      ? `<div class="t-muted" style="padding-top:8px; font-family:${SANS}; font-size:12px; line-height:18px; mso-line-height-rule:exactly; color:${MUTED};">${escapeHtml(
          aside.attribution
        )}</div>`
      : ""
  }
  </td></tr></table>
</td></tr>`;
}
```

Add `EmailAside` to the existing type import from `./edition-template` at the top of the file.

Note on the 516px width: the shell is 640px, the block has 40px gutters and the tinted cell adds 20px each side, leaving 516px of content.

- [ ] **Step 5: Run the block test to verify it passes**

Run: `npx vitest run tests/unit/one-more-thing-block.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Register the merge tag**

In `lib/email/merge-tags.ts`, add to `RADAR_MERGE_TAGS` after the `internal` entry (line 99):

```ts
  {
    name: "one_more_thing",
    label: "One more thing",
    description:
      "The closing joke, note or spotlight, with its picture when there is one. Renders nothing when the edition chose none.",
    perRecipient: false,
  },
```

Add `oneMoreThingBlock` to the import from `./edition-blocks` at line 16, and add to the object returned by `editionMergeValues` (line 239):

```ts
    one_more_thing: wrap(oneMoreThingBlock(edition.oneMoreThing, heading)),
```

- [ ] **Step 7: Pass it through `buildEditionEmail`**

In `lib/email/edition-data.ts`, add to `EditionInput` (near line 52):

```ts
  /** The closing block. Absent means the edition sends without one. */
  oneMoreThing?: EmailAside;
```

And add to the object `buildEditionEmail` returns, beside `internal`:

```ts
    oneMoreThing: input.oneMoreThing,
```

Import `EmailAside` from `./edition-template`.

- [ ] **Step 8: Place the block in the built-in template**

In `lib/email/edition-template.ts`, insert between `BLOCK_ANCHORS["after-projects"]` (line 245) and the `<!-- CTA -->` comment (line 247):

```ts
${oneMoreThingBlock(data.oneMoreThing)}
```

Import it from `./edition-blocks`.

- [ ] **Step 9: Run the full suite and update the snapshot**

Run: `npx vitest run`
Expected: `tests/unit/edition-template-snapshot.test.ts` fails on a changed snapshot; every other suite passes, including the two "the two renderers cannot diverge" assertions at `tests/unit/merge-tags.test.ts:204`, which now cover `one_more_thing` for free.

Then run: `npx vitest run tests/unit/edition-template-snapshot.test.ts -u`

Read the snapshot diff before accepting it. An edition with no aside must produce **no change at all** to the snapshot, because `oneMoreThingBlock(undefined)` returns the empty string. If the snapshot gained a stray empty row, the placement in Step 8 is wrong.

- [ ] **Step 10: Run everything to verify green**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 11: Commit**

```bash
git add lib/email/edition-template.ts lib/email/edition-blocks.ts lib/email/edition-data.ts lib/email/merge-tags.ts tests/unit/one-more-thing-block.test.ts tests/unit/__snapshots__/edition-template-snapshot.test.ts.snap
git commit -m "Email: the edition can close with one more thing"
```

---

### Task 3: The selection module

**Files:**
- Create: `lib/asides/select.ts`
- Test: `tests/unit/aside-select.test.ts` (create)

**Interfaces:**
- Consumes: the `Aside` Prisma type from Task 1.
- Produces:
  - `asidePickerQuery(input: { kind: AsideKind; language: string }): { where: object; orderBy: object[]; }` , the query the picker and the send screen both use
  - `toEmailAside(aside: Pick<Aside, "kind" | "text" | "imageUrl" | "attribution">): EmailAside`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/aside-select.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { asidePickerQuery, toEmailAside } from "@/lib/asides/select";

describe("asidePickerQuery", () => {
  it("offers only approved, reusable rows in the asked-for kind and language", () => {
    const query = asidePickerQuery({ kind: "JOKE", language: "pt-PT" });

    expect(query.where).toEqual({
      status: "APPROVED",
      reusable: true,
      kind: "JOKE",
      language: "pt-PT",
    });
  });

  it("puts the never-used first, then the least recently used", () => {
    // nulls first is the point: a joke that has never gone out should be offered
    // before one that went out a year ago.
    expect(query().orderBy).toEqual([
      { lastUsedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
    ]);

    function query() {
      return asidePickerQuery({ kind: "JOKE", language: "pt-PT" });
    }
  });

  it("never offers a pending suggestion", () => {
    const query = asidePickerQuery({ kind: "NOTE", language: "en" });
    expect((query.where as { status: string }).status).toBe("APPROVED");
  });
});

describe("toEmailAside", () => {
  it("drops nulls, because the email type uses optional and not nullable", () => {
    expect(
      toEmailAside({
        kind: "JOKE",
        text: "A one-liner.",
        imageUrl: null,
        attribution: null,
      })
    ).toEqual({ kind: "JOKE", text: "A one-liner." });
  });

  it("carries the image and the attribution when they are set", () => {
    expect(
      toEmailAside({
        kind: "SPOTLIGHT",
        text: "The team shipped it.",
        imageUrl: "https://example.supabase.co/a.png",
        attribution: "AI practice",
      })
    ).toEqual({
      kind: "SPOTLIGHT",
      text: "The team shipped it.",
      imageUrl: "https://example.supabase.co/a.png",
      attribution: "AI practice",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/aside-select.test.ts`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Write the module**

Create `lib/asides/select.ts`:

```ts
/**
 * How the closing slot chooses what to offer.
 *
 * A query builder rather than a function that runs it, so the picker on the send screen,
 * the library screen and any test can share one definition of "what is offerable" without
 * this module reaching for Prisma. `lastUsedAt` and `useCount` are written when an edition
 * is sent, never here: choosing an aside, previewing it and changing your mind must not
 * burn it, or the ordering degrades every time someone browses.
 */

import type { AsideKind } from "@prisma/client";
import type { EmailAside } from "@/lib/email/edition-template";

export function asidePickerQuery(input: { kind: AsideKind; language: string }) {
  return {
    where: {
      status: "APPROVED" as const,
      reusable: true,
      kind: input.kind,
      language: input.language,
    },
    /**
     * Never-used first, then least recently used. `nulls: "first"` is the whole point:
     * without it Postgres sorts nulls last on an ascending order and a joke that has
     * never gone out would be offered after one that went out a year ago.
     */
    orderBy: [
      { lastUsedAt: { sort: "asc" as const, nulls: "first" as const } },
      { createdAt: "asc" as const },
    ],
  };
}

export function toEmailAside(aside: {
  kind: AsideKind;
  text: string;
  imageUrl: string | null;
  attribution: string | null;
}): EmailAside {
  return {
    kind: aside.kind,
    text: aside.text,
    ...(aside.imageUrl ? { imageUrl: aside.imageUrl } : {}),
    ...(aside.attribution ? { attribution: aside.attribution } : {}),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/aside-select.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add lib/asides/select.ts tests/unit/aside-select.test.ts
git commit -m "Asides: the picker offers the never-used first"
```

---

### Task 4: The send path attaches the aside, freezes it, and marks it used

**Files:**
- Modify: `app/api/email/send-all/route.ts`
- Modify: `app/api/email/send-test/route.ts`
- Modify: `app/api/email/preview/route.ts`
- Modify: `lib/editions/sent-snapshot.ts`
- Create: `lib/asides/mark-used.ts`
- Test: `tests/unit/aside-mark-used.test.ts` (create)
- Test: `tests/unit/sent-snapshot.test.ts` (extend)

**Interfaces:**
- Consumes: `toEmailAside` from Task 3, `EmailAside` from Task 2, `db.aside` from Task 1.
- Produces: `markAsideUsed(db, asideId): Promise<void>`; `SentSnapshot.aside?: unknown | null`.

- [ ] **Step 1: Write the failing test for marking used**

Create `tests/unit/aside-mark-used.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { markAsideUsed } from "@/lib/asides/mark-used";

function fakeDb() {
  const update = vi.fn().mockResolvedValue({});
  return { db: { aside: { update } } as never, update };
}

describe("markAsideUsed", () => {
  it("stamps the time and increments the counter in one write", async () => {
    const { db, update } = fakeDb();

    await markAsideUsed(db, "aside-1");

    expect(update).toHaveBeenCalledTimes(1);
    const args = update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "aside-1" });
    expect(args.data.useCount).toEqual({ increment: 1 });
    expect(args.data.lastUsedAt).toBeInstanceOf(Date);
  });

  it("does nothing when the edition carried no aside", async () => {
    const { db, update } = fakeDb();

    await markAsideUsed(db, null);

    expect(update).not.toHaveBeenCalled();
  });

  it("does not throw when the row is gone, because a send must not fail on bookkeeping", async () => {
    const update = vi.fn().mockRejectedValue(new Error("Record to update not found"));
    const db = { aside: { update } } as never;

    await expect(markAsideUsed(db, "aside-1")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/aside-mark-used.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the module**

Create `lib/asides/mark-used.ts`:

```ts
/**
 * Records that an aside actually went out.
 *
 * Called where the sent snapshot is frozen, not where the aside is chosen, so browsing
 * the picker never changes the ordering.
 *
 * Swallows its own failure on purpose: this is bookkeeping that orders a picker, and a
 * send that already reached Resend must not report failure because a counter did not
 * increment. The error is logged so it is not silent.
 */

import type { TenantClient } from "@/lib/db/tenant";

export async function markAsideUsed(
  db: TenantClient,
  asideId: string | null | undefined
): Promise<void> {
  if (!asideId) return;

  try {
    await db.aside.update({
      where: { id: asideId },
      data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
    });
  } catch (error) {
    console.error("Failed to mark aside as used", { asideId, error });
  }
}
```

If `TenantClient` is not the exported type name in `lib/db/tenant.ts`, use whatever `createTenantClient` returns: `ReturnType<typeof createTenantClient>`.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/aside-mark-used.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the aside to the sent snapshot**

In `lib/editions/sent-snapshot.ts`, add to the `SentSnapshot` interface beside `customBlocks` (line 76):

```ts
  /**
   * The closing block this send carried, frozen. Absent on every send before this existed
   * and on every send that chose none, which a reader must treat identically.
   */
  aside?: unknown | null;
```

Add to the builder input interface (line 101) and to the object it returns (line 145):

```ts
  aside: input.aside ?? null,
```

Do **not** bump `SNAPSHOT_VERSION`. The file's own comment at line 27 explains why: every reader treats absence as "this send had none", which is the correct answer for an older record, and a bump would imply handling that is not needed.

Add a reader beside `frozenCustomBlocksFor`:

```ts
/** The closing block a frozen edition sent, or null. */
export function frozenAsideFor(sentSnapshot: unknown): unknown | null {
  if (!isSentSnapshot(sentSnapshot)) return null;
  return sentSnapshot.aside ?? null;
}
```

- [ ] **Step 6: Extend the snapshot test**

Add to `tests/unit/sent-snapshot.test.ts`:

```ts
  it("records the closing aside, and null when there was none", () => {
    const withAside = buildSentSnapshot({
      ...baseInput,
      aside: { kind: "JOKE", text: "A one-liner." },
    });
    expect(frozenAsideFor(withAside)).toEqual({ kind: "JOKE", text: "A one-liner." });

    expect(frozenAsideFor(buildSentSnapshot(baseInput))).toBeNull();
  });

  it("reads an older snapshot, written before the aside existed, as having none", () => {
    const older = { ...buildSentSnapshot(baseInput) } as Record<string, unknown>;
    delete older.aside;
    expect(frozenAsideFor(older)).toBeNull();
  });
```

Match `baseInput` and the import list to whatever the file already uses. Import `frozenAsideFor`.

- [ ] **Step 7: Wire the three routes**

In each of `app/api/email/send-all/route.ts`, `app/api/email/send-test/route.ts` and `app/api/email/preview/route.ts`, where the edition is loaded, include the relation and pass it through:

```ts
// on the edition query
include: { /* whatever is already included */, aside: true },

// where EditionInput is assembled
oneMoreThing: edition.aside ? toEmailAside(edition.aside) : undefined,
```

In `send-all` only, after the sent snapshot is written, add:

```ts
await markAsideUsed(db, edition.asideId);
```

It goes after the snapshot write, not before, so a send that dies mid-flight does not burn the aside.

- [ ] **Step 8: Run everything**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 9: Commit**

```bash
git add lib/asides/mark-used.ts lib/editions/sent-snapshot.ts app/api/email/send-all/route.ts app/api/email/send-test/route.ts app/api/email/preview/route.ts tests/unit/aside-mark-used.test.ts tests/unit/sent-snapshot.test.ts
git commit -m "Send: the closing aside goes out and is recorded"
```

---

### Task 5: Upload hardening, magic bytes and no SVG

**Files:**
- Create: `lib/media/sniff.ts`
- Modify: `app/api/media/upload/route.ts:11-17` and `:52-63`
- Modify: `components/media-library.tsx:245`
- Test: `tests/unit/media-sniff.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `sniffImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/gif" | null`; `isAnimatedGif(bytes: Uint8Array): boolean`.

**Why this is in scope:** this feature is the first thing that puts a user-uploaded image in front of roughly 800 people. The bucket is public, so an accepted SVG is served from our own Supabase domain and can carry `<script>`: stored XSS, `CLAUDE.md` A05. And the route currently validates the client-declared `file.type` and then stores the file with it as `contentType`, so `evil.svg` renamed to `meme.png` and declared `image/png` passes both checks today.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-sniff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAnimatedGif, sniffImageType } from "@/lib/media/sniff";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const GIF87 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0, 0]);
const GIF89 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0]);

function bytesOf(text: string): Uint8Array {
  return new Uint8Array([...text].map((c) => c.charCodeAt(0)));
}

describe("sniffImageType", () => {
  it("recognises PNG, JPEG and both GIF versions", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(GIF87)).toBe("image/gif");
    expect(sniffImageType(GIF89)).toBe("image/gif");
  });

  it("refuses an SVG, which a public bucket must never serve", () => {
    expect(sniffImageType(bytesOf('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
  });

  it("refuses HTML dressed as an image", () => {
    expect(sniffImageType(bytesOf("<!DOCTYPE html><html>"))).toBeNull();
  });

  it("refuses WebP, which Outlook on Windows does not render", () => {
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(sniffImageType(webp)).toBeNull();
  });

  it("refuses a buffer too short to identify", () => {
    expect(sniffImageType(new Uint8Array([0x89]))).toBeNull();
  });
});

describe("isAnimatedGif", () => {
  it("finds the loop extension a looping GIF carries", () => {
    const bytes = new Uint8Array([...GIF89, ...bytesOf("NETSCAPE2.0"), 0, 0]);
    expect(isAnimatedGif(bytes)).toBe(true);
  });

  it("says no for a still GIF", () => {
    expect(isAnimatedGif(GIF89)).toBe(false);
  });

  it("says no for anything that is not a GIF", () => {
    expect(isAnimatedGif(PNG)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/media-sniff.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the sniffer**

Create `lib/media/sniff.ts`:

```ts
/**
 * What an uploaded file actually is, read from its bytes.
 *
 * The upload route used to validate `file.type`, which is the browser's word taken from
 * the multipart header and controlled by whoever posts, and then stored the file with
 * that value as its `contentType`. Renaming `evil.svg` to `meme.png` and declaring
 * `image/png` passed both checks, and the bucket is public, so Supabase would serve it
 * back as script from our own domain.
 *
 * The accepted set is deliberately the three formats every email client renders. WebP is
 * excluded because Outlook on Windows does not render it, and SVG because a public bucket
 * must never serve one.
 */

export type SniffedImageType = "image/png" | "image/jpeg" | "image/gif";

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // "GIF8", covering both 87a and 89a.
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  return null;
}

/**
 * Whether a GIF loops, detected by the NETSCAPE2.0 application extension.
 *
 * A heuristic, and stated as one: it is what looping GIFs carry, which is substantially
 * all animated ones. It exists only to raise a warning in the editor, because Outlook on
 * Windows renders the first frame and nothing else, so the first frame has to carry the
 * joke on its own. Nothing depends on it being exact.
 */
export function isAnimatedGif(bytes: Uint8Array): boolean {
  if (sniffImageType(bytes) !== "image/gif") return false;

  const marker = "NETSCAPE2.0";
  const limit = Math.min(bytes.length, 4096);

  outer: for (let i = 0; i + marker.length <= limit; i++) {
    for (let j = 0; j < marker.length; j++) {
      if (bytes[i + j] !== marker.charCodeAt(j)) continue outer;
    }
    return true;
  }

  return false;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/media-sniff.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Harden the upload route**

In `app/api/media/upload/route.ts`, replace the `ALLOWED_TYPES` constant (lines 11-17) and the type validation (lines 51-63) with:

```ts
// Deliberately not a constant list of declared types: see lib/media/sniff.ts.
```

and, after the size check:

```ts
    // The declared type is the client's word. Read the bytes instead, and store the file
    // as what it actually is rather than as what it claimed to be.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = sniffImageType(bytes);

    if (!detected) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unsupported image. Upload a PNG, JPEG or GIF. SVG and WebP are refused: SVG can carry script, and WebP does not render in Outlook on Windows.",
        },
        { status: 400 }
      );
    }

    const { url } = await uploadFile(Buffer.from(bytes), file.name, detected);
```

Import `sniffImageType` from `@/lib/media/sniff`. Keep `MAX_FILE_SIZE` at 5MB and keep the `requireOrgContext` guard exactly as it is. The `mediaAsset.create` call now stores `type: detected` rather than `file.type`.

- [ ] **Step 6: Narrow the picker's accept attribute**

In `components/media-library.tsx:245`, change:

```tsx
accept="image/jpeg,image/png,image/gif"
```

The `accept` attribute is a convenience for the file dialog and never a control: the server sniff is the control.

- [ ] **Step 7: Run everything**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 8: Commit**

```bash
git add lib/media/sniff.ts app/api/media/upload/route.ts components/media-library.tsx tests/unit/media-sniff.test.ts
git commit -m "Media: an upload is what its bytes say, not what it claims"
```

---

### Task 6: The aside API routes

**Files:**
- Create: `app/api/asides/route.ts` (GET list, POST create)
- Create: `app/api/asides/[id]/route.ts` (PATCH, DELETE)
- Create: `lib/asides/input.ts`
- Test: `tests/unit/aside-input.test.ts` (create)

**Interfaces:**
- Consumes: `requireOrgContext` from `@/lib/auth/context`, `hasRoleAtLeast` from `@/lib/auth/roles`, `asidePickerQuery` from Task 3.
- Produces: `parseAsideCreate(body: unknown): { ok: true; value: AsideCreateInput } | { ok: false; error: string }` and `parseAsidePatch(body: unknown)` from `lib/asides/input.ts`.

**Pattern to follow:** `app/api/articles/[id]/route.ts` for the guard and the tenant client, and `tests/unit/article-patch-input.test.ts` for how input parsing is tested separately from the route.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/aside-input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseAsideCreate, parseAsidePatch } from "@/lib/asides/input";

describe("parseAsideCreate", () => {
  it("accepts the minimum: text alone", () => {
    const result = parseAsideCreate({ text: "A one-liner." });
    expect(result).toEqual({
      ok: true,
      value: { text: "A one-liner.", kind: "JOKE", language: "pt-PT", reusable: true },
    });
  });

  it("refuses empty text, because the text is also the image's alt", () => {
    expect(parseAsideCreate({ text: "   " }).ok).toBe(false);
    expect(parseAsideCreate({ imageUrl: "https://x.co/a.png" }).ok).toBe(false);
  });

  it("refuses an image URL that is not http or https", () => {
    const result = parseAsideCreate({ text: "x", imageUrl: "javascript:alert(1)" });
    expect(result.ok).toBe(false);
  });

  it("refuses an unknown kind", () => {
    expect(parseAsideCreate({ text: "x", kind: "MEME" }).ok).toBe(false);
  });

  it("trims the text and drops a blank attribution", () => {
    const result = parseAsideCreate({ text: "  x  ", attribution: "  " });
    expect(result).toMatchObject({ ok: true, value: { text: "x" } });
    expect((result as { value: Record<string, unknown> }).value.attribution).toBeUndefined();
  });

  it("caps the text, because an email block is not an essay", () => {
    expect(parseAsideCreate({ text: "x".repeat(501) }).ok).toBe(false);
  });
});

describe("parseAsidePatch", () => {
  it("accepts a status change on its own", () => {
    expect(parseAsidePatch({ status: "RETIRED" })).toEqual({
      ok: true,
      value: { status: "RETIRED" },
    });
  });

  it("refuses an unknown status", () => {
    expect(parseAsidePatch({ status: "DELETED" }).ok).toBe(false);
  });

  it("refuses an empty patch, which is a caller bug", () => {
    expect(parseAsidePatch({}).ok).toBe(false);
  });

  it("never lets a caller set the counters", () => {
    const result = parseAsidePatch({ text: "x", useCount: 99, lastUsedAt: "2020-01-01" });
    expect(result).toEqual({ ok: true, value: { text: "x" } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/aside-input.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the parser**

Create `lib/asides/input.ts`:

```ts
/**
 * What a caller may set on an aside, and what it may not.
 *
 * Separated from the route so the rules are testable without a session, following
 * lib/articles' article-patch-input pattern. `useCount` and `lastUsedAt` are absent from
 * both parsers on purpose: they are written by the send path and by nothing else.
 */

const KINDS = ["JOKE", "NOTE", "SPOTLIGHT"] as const;
const STATUSES = ["PENDING", "APPROVED", "RETIRED"] as const;

/** An email block, not an essay. Long enough for a paragraph-length note. */
const MAX_TEXT = 500;

export type AsideKindInput = (typeof KINDS)[number];
export type AsideStatusInput = (typeof STATUSES)[number];

export interface AsideCreateInput {
  text: string;
  kind: AsideKindInput;
  language: string;
  reusable: boolean;
  imageUrl?: string;
  attribution?: string;
  status?: AsideStatusInput;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** http(s) only. A javascript: or data: URL must never reach an inbox. */
function cleanUrl(value: unknown): { ok: true; url?: string } | { ok: false } {
  const text = cleanText(value);
  if (!text) return { ok: true };
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false };
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false };
  }
}

export function parseAsideCreate(body: unknown): Result<AsideCreateInput> {
  if (!isRecord(body)) return { ok: false, error: "Body must be an object." };

  const text = cleanText(body.text);
  if (!text) {
    return {
      ok: false,
      error: "Text is required. It is also the image's alt text, so an image alone is not enough.",
    };
  }
  if (text.length > MAX_TEXT) {
    return { ok: false, error: `Text must be ${MAX_TEXT} characters or fewer.` };
  }

  const kind = body.kind === undefined ? "JOKE" : body.kind;
  if (!KINDS.includes(kind as AsideKindInput)) {
    return { ok: false, error: `Kind must be one of ${KINDS.join(", ")}.` };
  }

  const image = cleanUrl(body.imageUrl);
  if (!image.ok) return { ok: false, error: "Image URL must be http or https." };

  const status = body.status;
  if (status !== undefined && !STATUSES.includes(status as AsideStatusInput)) {
    return { ok: false, error: `Status must be one of ${STATUSES.join(", ")}.` };
  }

  const attribution = cleanText(body.attribution);
  const language = cleanText(body.language) ?? "pt-PT";
  const reusable = body.reusable === undefined ? true : Boolean(body.reusable);

  return {
    ok: true,
    value: {
      text,
      kind: kind as AsideKindInput,
      language,
      reusable,
      ...(image.url ? { imageUrl: image.url } : {}),
      ...(attribution ? { attribution } : {}),
      ...(status ? { status: status as AsideStatusInput } : {}),
    },
  };
}

export function parseAsidePatch(
  body: unknown
): Result<Partial<Pick<AsideCreateInput, "text" | "kind" | "imageUrl" | "attribution" | "language" | "status">>> {
  if (!isRecord(body)) return { ok: false, error: "Body must be an object." };

  const value: Record<string, unknown> = {};

  if (body.text !== undefined) {
    const text = cleanText(body.text);
    if (!text) return { ok: false, error: "Text cannot be blank." };
    if (text.length > MAX_TEXT) {
      return { ok: false, error: `Text must be ${MAX_TEXT} characters or fewer.` };
    }
    value.text = text;
  }

  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind as AsideKindInput)) {
      return { ok: false, error: `Kind must be one of ${KINDS.join(", ")}.` };
    }
    value.kind = body.kind;
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as AsideStatusInput)) {
      return { ok: false, error: `Status must be one of ${STATUSES.join(", ")}.` };
    }
    value.status = body.status;
  }

  if (body.imageUrl !== undefined) {
    const image = cleanUrl(body.imageUrl);
    if (!image.ok) return { ok: false, error: "Image URL must be http or https." };
    value.imageUrl = image.url ?? null;
  }

  if (body.attribution !== undefined) value.attribution = cleanText(body.attribution) ?? null;
  if (body.language !== undefined) {
    const language = cleanText(body.language);
    if (!language) return { ok: false, error: "Language cannot be blank." };
    value.language = language;
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  return { ok: true, value };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/aside-input.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Write the routes**

Create `app/api/asides/route.ts`. Read `app/api/articles/[id]/route.ts` first and copy its guard shape exactly, including the role check, because four routes in this repository shipped with no authentication at all.

- `GET` accepts `?kind=`, `?status=`, `?language=`, `?offerable=true`. With `offerable=true` it uses `asidePickerQuery` from Task 3. Requires `VIEWER`.
- `POST` requires `EDITOR` and uses `parseAsideCreate`, returning 400 with the parser's error, 201 with the created row.

Create `app/api/asides/[id]/route.ts`:

- `PATCH` requires `EDITOR`, uses `parseAsidePatch`, writes through `db.aside.update`.
- `DELETE` requires `ADMIN`. It does **not** delete the stored image: the same file may sit in a delivered edition's snapshot and the signed archive still renders it.

Every route wraps its body in try/catch and returns a sanitized message, per `CLAUDE.md` A10.

- [ ] **Step 6: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS, clean, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add lib/asides/input.ts app/api/asides tests/unit/aside-input.test.ts
git commit -m "API: asides can be listed, written and retired"
```

---

### Task 7: The library screen

**Files:**
- Create: `app/dashboard/asides/page.tsx`
- Create: `components/aside-form.tsx`
- Modify: the dashboard navigation component (find it with `grep -rn "Curation jobs" components/ app/` and add an entry under Workspace)

**Interfaces:**
- Consumes: `/api/asides` from Task 6, `MediaLibrary` from `components/media-library.tsx` (`onSelect: (url: string) => void`), `isAnimatedGif` from Task 5.
- Produces: nothing other tasks consume.

**Copy is English**, matching the rest of the dashboard.

- [ ] **Step 1: Add the navigation entry**

Label: `One more thing`. Place it under Workspace, after `Templates`.

- [ ] **Step 2: Build the list page**

`app/dashboard/asides/page.tsx`, following the existing dashboard screen patterns and the AI Radar design vocabulary in `components/radar/`:

- Tabs: `Approved`, `Pending`, `Retired`. The `Pending` tab is where model suggestions are approved.
- Filters: kind and language.
- Each row shows the text, a thumbnail when there is an image, the kind, the source (`Human` or `AI suggested`), and `Last used` or `Never used`.
- Actions per row: edit, retire, and on a pending row, approve or discard.
- Every fetch has a loading state and an error state, per `CLAUDE.md` principle 4.

- [ ] **Step 3: Build the form**

`components/aside-form.tsx`:

- A textarea for the text, with a 500 character counter, marked required.
- Helper text under it: `This is also the image's alt text. Readers whose client blocks images see only this.`
- Kind selector, language selector, attribution input.
- An image field that opens `MediaLibrary` and stores the returned URL, with a `Remove image` action.
- **Two warnings, shown after a file is chosen:**
  - When `isAnimatedGif` is true: `Outlook on Windows shows the first frame only. Make sure the first frame carries the joke.`
  - When the file is over 1MB: `This is <n>MB. It reaches around 800 inboxes, many on mobile data.`

- [ ] **Step 4: Verify in the browser**

Start the dev server on port 3111 and click through: create an aside with text only, create one with a GIF and confirm both warnings appear, retire one, and edit one.

Run: `npm run dev` then open `http://localhost:3111/dashboard/asides`

- [ ] **Step 5: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS, clean, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/asides components/aside-form.tsx
git commit -m "UI: the closing slot has a library"
```

---

### Task 8: The send screen card

**Files:**
- Modify: `app/dashboard/send/[id]/page.tsx`
- Create: `components/aside-picker.tsx`
- Modify: `app/api/editions/[id]/route.ts` (accept `asideId` on PATCH)
- Modify: the preview harness route so the new card has fixtures (find it with `grep -rn "radar-preview" app/`)

**Interfaces:**
- Consumes: `/api/asides?offerable=true` from Task 6, `parseAsidePatch` conventions, `MediaLibrary`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Let an edition's aside be set**

In `app/api/editions/[id]/route.ts`, accept `asideId: string | null` on PATCH. Validate that the id belongs to this organization by reading it through `db.aside.findUnique` first, which returns null across tenants. Null clears the slot.

- [ ] **Step 2: Build the picker**

`components/aside-picker.tsx`, rendered above the send button:

- A kind selector defaulting to `JOKE`.
- A list from `/api/asides?offerable=true&kind=<kind>&language=<org language>`, already ordered never-used first.
- A preview of the selected aside, image included.
- A `Write one now` free-text form. Submitting it POSTs to `/api/asides` with `reusable: false`, `status: "APPROVED"`, then PATCHes the edition with the new id.
- A `Send without one` action that PATCHes `asideId: null`.

Selecting an aside does **not** touch `lastUsedAt`. That happens at send, in Task 4.

- [ ] **Step 3: Add preview harness fixtures**

Four screens, matching how the other screens are verified: `aside-picked`, `aside-picked-image`, `aside-empty`, `aside-freetext`.

- [ ] **Step 4: Screenshot each state**

Use the harness at `/radar-preview?screen=aside-picked` and the other three. Take **viewport** screenshots, not `fullPage`: a full-page capture renders the sticky header at its scroll position, which reads as the title being clipped and is an artefact of the capture.

- [ ] **Step 5: Send one real test email**

Pick an aside with a GIF, use the test send to `julian.andrade@linkconsulting.com`, and confirm in Outlook that the image appears, that the alt text appears when images are blocked, and that the block renders in dark mode.

Local sending needs `node --use-system-ca`, because corporate TLS inspection means Node's own CA bundle cannot reach `api.resend.com` from Windows.

- [ ] **Step 6: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS, clean, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/send components/aside-picker.tsx app/api/editions
git commit -m "Send: an edition picks its closing aside"
```

---

### Task 9: Model suggestions into the pending queue

**Files:**
- Create: `lib/asides/suggest.ts`
- Create: `app/api/asides/suggest/route.ts`
- Modify: `app/dashboard/asides/page.tsx` (add the button)
- Test: `tests/unit/aside-suggest.test.ts` (create)

**Interfaces:**
- Consumes: `lib/ai/claude.ts`, `lib/ai/message.ts`, `parseAsideCreate` from Task 6.
- Produces: `parseSuggestions(replyText: string): string[]`, `buildSuggestPrompt(input: { topics: string[]; samples: string[]; language: string }): string`.

**The rule this task exists to enforce:** suggestions land as `PENDING` / `MODEL` and nothing reaches a send without a human moving it to `APPROVED`. That is `CLAUDE.md` LLM06, and here it is also the difference between a good joke and an incident carrying the company's name.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/aside-suggest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSuggestPrompt, parseSuggestions } from "@/lib/asides/suggest";

describe("parseSuggestions", () => {
  it("reads one candidate per line", () => {
    expect(parseSuggestions("First one.\nSecond one.\nThird one.")).toEqual([
      "First one.",
      "Second one.",
      "Third one.",
    ]);
  });

  it("drops blank lines and numbering the model added anyway", () => {
    expect(parseSuggestions("1. First one.\n\n2. Second one.\n")).toEqual([
      "First one.",
      "Second one.",
    ]);
  });

  it("drops a line over the 500 character cap rather than truncating a joke", () => {
    const long = "x".repeat(501);
    expect(parseSuggestions(`Fine.\n${long}`)).toEqual(["Fine."]);
  });

  it("returns nothing for an empty reply, which the caller must handle", () => {
    expect(parseSuggestions("")).toEqual([]);
    expect(parseSuggestions("   \n  ")).toEqual([]);
  });
});

describe("buildSuggestPrompt", () => {
  it("carries the topics and the approved samples as tone reference", () => {
    const prompt = buildSuggestPrompt({
      topics: ["agentic coding", "model releases"],
      samples: ["An approved one."],
      language: "pt-PT",
    });

    expect(prompt).toContain("agentic coding");
    expect(prompt).toContain("An approved one.");
    expect(prompt).toContain("pt-PT");
  });

  it("asks for five, one per line, and no numbering", () => {
    const prompt = buildSuggestPrompt({ topics: [], samples: [], language: "pt-PT" });
    expect(prompt).toContain("five");
    expect(prompt.toLowerCase()).toContain("one per line");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/aside-suggest.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the module**

Create `lib/asides/suggest.ts` with `buildSuggestPrompt` and `parseSuggestions`. The prompt asks for exactly five one-liners, one per line, no numbering, in the given language, on the relationship between AI and software engineering and IT consulting, using the approved samples as tone reference and the edition's topics as subject matter. `parseSuggestions` splits on newlines, strips leading `1.` / `-` / `*` numbering, trims, drops blanks, and drops anything over 500 characters to match `MAX_TEXT` in Task 6.

The model call itself lives in the route, not here, so this module stays testable without a key. Follow how `lib/inbound/` separates its prompt building from its call.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/aside-suggest.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the route**

`app/api/asides/suggest/route.ts`, `POST`, requires `EDITOR`:

1. Reads the current edition's topics and up to ten `APPROVED` asides as samples.
2. Calls the model through `lib/ai/claude.ts`.
3. Runs each line through `parseAsideCreate` and writes the survivors with `status: "PENDING"`, `source: "MODEL"`, text only, no image, because a model cannot make one.
4. Returns how many were written.

Set an explicit `max_tokens` and check the stop reason. This repository has been bitten in twenty-one places by a reply whose text is empty because it opens with a thinking block, and twice more by thinking scaling to fill whatever budget it is given.

- [ ] **Step 6: Add the button**

On `app/dashboard/asides/page.tsx`, a `Suggest five` button on the `Pending` tab, with a loading state and an error state.

- [ ] **Step 7: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS, clean, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add lib/asides/suggest.ts app/api/asides/suggest app/dashboard/asides tests/unit/aside-suggest.test.ts
git commit -m "Asides: the model suggests into a queue, never into a send"
```

---

## After the last task

The library ships empty and the screens work. It is not useful until roughly fifteen to twenty approved one-liners exist, and the spec is deliberate that a person writes them: before ChatGPT versus now versus whatever is next, agentic everything, slop, and the specific comedy of a senior engineer reviewing a diff no human wrote.

Update `CLAUDE.md`'s Architecture Decisions table with one row, matching the style of the entries already there:

| Decision | Rationale | Date |
|---|---|---|
| The closing block is a merge tag, and its content is always a library row | A `CustomBlock` would have rendered only in the built-in path and landed glued to the end of `{{projects}}` in an Unlayer template. Free text typed at send time writes a `reusable: false` row rather than taking a second path, so "what did edition 32 send" has one answer | Aug 2026 |
