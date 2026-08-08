# One more thing: the closing slot

Written 8 August 2026. Supersedes §4 of
[docs/IDEAS-2026-08-07-what-to-build-next.md](../../IDEAS-2026-08-07-what-to-build-next.md),
which proposed a text-only curated aside and recommended against images. Images are
back in, on purpose, and this document records why and what it costs.

Every edition gets a closing block: usually a joke about what AI is doing to software
engineering and IT consulting, sometimes a signed note from the editor, sometimes an
internal shout-out. It is the thing people forward.

---

## The four decisions this design rests on

| Question | Decision |
|---|---|
| Who writes it | A curated library. The model may **suggest into an approval queue**, never into a send |
| Text or image | **Text is always the payload.** An image is optional on top, and the image's `alt` is the text |
| One kind or many | One slot, three kinds: joke, editor note, internal spotlight |
| Language | A `language` column per entry, filtered by the organization's own language |

The reasoning behind the first is the one worth keeping: model humour about LLMs lands
somewhere between flat and subtly wrong, and this goes out under Linkroad's name to
roughly 800 colleagues. One bad joke costs far more than fifty passable ones are worth.
The queue gives freshness without letting a model sign in anyone's name.

The reasoning behind the second: many corporate mail clients block images until the
reader loads them. A meme whose joke lives only in the picture reaches those readers as
an empty box.

---

## 1. Data model

One table. The rule that keeps everything else simple: **everything that goes out in an
edition is a row in this table**, including free text typed on the send screen at the
last minute.

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

model Aside {
  id String @id @default(cuid())

  kind   AsideKind   @default(JOKE)
  status AsideStatus @default(APPROVED)
  source AsideSource @default(HUMAN)

  /** The payload. Always required, even when an image is attached: it is also the alt text. */
  text String

  /** A public URL from the newsletter-media bucket. Never an upload path of its own. */
  imageUrl String?

  /** Who said it, or where it came from. Rendered small and muted when present. */
  attribution String?

  /** Filtered against OrgSettings.rewriteLanguage. A translated joke is not a joke, so a
      second language is a second row, hand written, not a translation of this one. */
  language String @default("pt-PT")

  /** False on free text typed at send time, so a one-off note never returns in the picker. */
  reusable Boolean @default(true)

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

On `Edition`, one nullable column:

```prisma
  aside   Aside?  @relation(fields: [asideId], references: [id], onDelete: SetNull)
  asideId String?
```

`onDelete: SetNull` and not `Cascade`: deleting a retired joke must never delete an
edition.

### Why each field earns its place

- **`status` and `source` are separate.** A model-proposed aside that you approved is
  `APPROVED` / `MODEL`. Three months from now, "did the ones people forwarded come from
  a person" is a question with an answer.
- **`RETIRED` rather than deleting.** A joke that aged badly stops being offered without
  destroying the record that it was sent.
- **`reusable`** is what lets free text share one code path with the library without
  polluting it.
- **`lastUsedAt` orders the picker. `useCount` tells you the library is too small.**

Both are written **when the edition is sent, not when the aside is chosen**. Picking one,
previewing it and then changing your mind must not burn it, or the least-recently-used
ordering degrades every time someone browses. The write happens in the same place the
`sentSnapshot` is frozen.

An aside that is `RETIRED` after an edition already points at it still sends. `RETIRED`
means "stop offering this", not "revoke it", and an editor who deliberately chose it does
not get overruled by a later cleanup.

### What is the record of what was sent

`Edition.asideId` is the intention. `Edition.sentSnapshot` is the fact, it already
exists, and the signed archive already reads it. The aside joins the snapshot the same
way `customBlocks` did, and `lib/editions/sent-snapshot.ts` needs no version bump for
the same reason recorded in its own comment: absence means "this send had none", which
is the right answer for every snapshot written before today.

---

## 2. Rendering

`EmailAside { kind, text, imageUrl?, attribution? }` joins `EditionEmail` as
`oneMoreThing?`, with exactly the shape `internal?` already has
(`lib/email/edition-template.ts:104`).

1. **`oneMoreThingBlock(aside, { heading })` in `lib/email/edition-blocks.ts`**, returning
   the empty string when there is no aside. That is the convention
   `dropEmptyOptionalRows` already depends on, so the row around it disappears with no
   trace in the sent HTML.
2. **`one_more_thing` joins `RADAR_MERGE_TAGS`** in `lib/email/merge-tags.ts` and
   `editionMergeValues`. This is what puts it in the built-in renderer, both Unlayer
   variants and the Unlayer palette from one edit. The `CLAUDE.md` decision record is
   explicit that four hand-maintained lists had already drifted, and this feature does
   not start a fifth.
3. **Position in the built-in template**: after `BLOCK_ANCHORS["after-projects"]`, before
   the call to action.
4. **Dark mode is inherited, not written.** The block uses the existing `.tint`,
   `.t-body` and `.t-muted` classes, so the `[data-ogsc]` mirror that Outlook.com needs
   (`edition-blocks.ts:84`) already covers it. No new colour is introduced.
5. **The image carries `alt={aside.text}`, never `alt=""`.** The custom-block image
   renderer emits an empty alt today (`lib/email/template-renderer.ts:135`). That is the
   exact failure this design exists to avoid, and it is not repeated here.
6. An explicit `width` attribute alongside `max-width:100%`, so Outlook reserves the box
   before the image loads.

The `heading` option follows the existing pattern: the headless template variant lifts
block headings into editable Unlayer text blocks, so the block must be able to render
without its own.

---

## 3. Upload

**Nothing new is provisioned.** The project already has all of it, and it was found by
reading rather than assumed:

| Piece | Where |
|---|---|
| Public bucket `newsletter-media` | `lib/supabase/storage.ts:10` |
| Authenticated upload route | `app/api/media/upload/route.ts`, guarded by `requireOrgContext` |
| Tenant-scoped `MediaAsset` | `lib/db/tenant.ts:478` injects `organizationId` |
| A picker component | `components/media-library.tsx`, `onSelect: (url: string) => void` |
| The three env vars | Present in `.env` and in `.env.example:41-43` |

The aside form gets an image field that opens `MediaLibrary` and stores the chosen URL.
No Vercel Blob, no new dependency, no new environment variable.

### Three defects fixed on the way through

This slot is the first thing that puts a user-uploaded image in front of 800 people, so
these are in scope rather than noted and left.

**A. SVG must stop being accepted.** It is allowed in
`app/api/media/upload/route.ts:16` and `components/media-library.tsx:245`. The bucket is
public, an SVG can carry `<script>`, and it is served from our own Supabase domain: that
is stored XSS (`CLAUDE.md` A05). No email client renders SVG either, so it is risk with
no upside. Remove from both lists.

**B. The MIME type is currently the client's word.** `file.type` comes from the browser's
multipart header and is controlled by whoever posts. The route validates against it and
then stores the file with it as `contentType` (`lib/supabase/storage.ts:78`), so Supabase
serves back whatever was declared. Renaming `evil.svg` to `meme.png` and declaring
`image/png` passes both checks today.

The fix is to sniff magic bytes server-side and use the **detected** type, never the
declared one:

| Format | Leading bytes |
|---|---|
| PNG | `89 50 4E 47 0D 0A 1A 0A` |
| JPEG | `FF D8 FF` |
| GIF | `47 49 46 38` (`GIF8`, covering 87a and 89a) |

Anything else is refused with 400, whatever it claims to be.

**C. WebP is accepted and should not be offered for email.** Outlook on Windows does not
render it, so a WebP meme arrives broken for a large share of the internal audience. It
stays available in the media library for other uses; the aside form refuses it.

### The GIF constraints, which no code fixes

- **Outlook on Windows renders only the first frame.** The first frame therefore has to
  carry the joke on its own. The form states this next to the upload, and detects an
  animated GIF by the `NETSCAPE2.0` application-extension bytes to raise the warning.
  That is a heuristic and is documented as one: it catches looping GIFs, which is
  substantially all of them.
- **The 5MB cap already exists** (`app/api/media/upload/route.ts:8`) and is kept. The
  form warns above 1MB, because 800 inboxes on mobile data is a real cost.
- **No server-side resizing.** `sharp` is a heavy dependency, and re-encoding an animated
  GIF destroys the animation, which is the whole point of the file.

### Deleting

Deleting or retiring an aside does **not** delete the stored file. The same image may sit
in the `sentSnapshot` of an edition already delivered, and the signed archive still
renders it. `deleteFile` in `lib/supabase/storage.ts:100` stays unused by this feature,
deliberately.

---

## 4. The screens

Chrome in English, matching the rest of the dashboard. Only generated content follows the
organization's language.

**A "One more thing" entry under Workspace.** The library: list with filters for kind,
language and status; create; edit; retire; and the `PENDING` tab where model suggestions
are approved or discarded. The image field opens `MediaLibrary`.

**A card on the send screen**, above the send button:

- A kind selector, defaulting to `JOKE`, because that is what most weeks want.
- The chosen aside, rendered as it will appear.
- A picker ordered by least recently used, filtered to `APPROVED`, `reusable: true`, the
  organization's language, and the selected kind.
- A free-text field, which accepts an image the same way the library form does.
  Submitting it writes an `APPROVED` / `HUMAN` / `reusable: false` row and points the
  edition at it, so there is exactly one code path and "what did edition 32 send" is
  answerable.
- Choosing nothing is valid. The edition sends without the block, and the block leaves no
  trace in the HTML.

Sends are always manual from the dashboard, so an editor sees this before anything
leaves. The weekly cron proposes an edition, it does not send one.

---

## 5. Model suggestions

A button on the library screen, not a cron job.

It calls the model through `lib/ai/claude.ts` with the current edition's topics and a
sample of already-approved asides as tone reference, and writes **five** candidates as
`PENDING` / `MODEL`, text only. They appear in the pending tab. Five because it is enough
to find one worth keeping and few enough to read in under a minute; a model never
attaches an image, because it cannot make one.

**Nothing reaches a send without passing through a human `APPROVED`.** That is `CLAUDE.md`
LLM06 (agency limits) and LLM05 (treat model output as untrusted), and here it is also
the difference between a good joke and an incident carrying the company's name.

Generated text is escaped on render like any other, and the `PENDING` state means a
prompt-injected suggestion arriving through an article title has to get past a person
before it can go anywhere.

---

## 6. Verification

| Claim | How it is verified |
|---|---|
| Selection honours least-recently-used, language, kind and `reusable` | Unit tests on the selection module |
| The block renders, and returns `""` with no aside | Unit test, plus the existing snapshot in `tests/unit/__snapshots__/edition-template-snapshot.test.ts.snap`, which will change |
| `alt` carries the text, and the text is escaped | Unit test with an aside containing `<script>` and a `javascript:` URL |
| The merge tag resolves in both renderers | Free: a test already walks the whole merge-tag table and asserts both renderers resolve every entry |
| Magic bytes accept PNG, JPEG, GIF and refuse SVG even when declared `image/png` | Unit test on the sniffer with real byte buffers |
| SVG is refused end to end | Unit test on the upload route |
| Every state of the send-screen card | `/radar-preview` harness fixtures, screenshotted, as the other screens are |

`tsc --noEmit` clean and `next build` clean before this is called done, per the project's
standing bar.

---

## Out of scope, stated so nobody has to guess

- **Topic matching and auto-fill.** The §4 proposal pre-filled the slot with the least
  used aside whose tags matched the edition's topics. Cut: the matcher only earns its
  keep with a large library, and there is none yet. The `Aside` table has no `tags`
  column for the same reason. Adding one later is a migration, not a redesign.
- **Multi-language sends.** §2 of the ideas document is not built, so `language` filters
  against `OrgSettings.rewriteLanguage` and nothing more. The column exists so that when
  §2 arrives, a Spanish aside is a new row rather than a migration.
- **Server-side image resizing.**
- **Scheduled suggestion generation.** On demand only.

## One thing left for Julian

The starter library has to be written by a person, and this design deliberately does not
have a model write it. Roughly fifteen to twenty approved one-liners is enough to run for
a quarter without repeating, on the themes already named: before ChatGPT versus now
versus whatever is next, agentic everything, slop, and the specific comedy of a senior
engineer reviewing a diff no human wrote.

The implementation can ship with an empty library and the screens working. It cannot ship
with an empty library and be useful.
