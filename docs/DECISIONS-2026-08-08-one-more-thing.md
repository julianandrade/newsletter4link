# Decisions taken without you, 8 August 2026

You approved the design and the plan, then left with "segues sozinho e registas as decisões
que tomaste". This is that record. Everything below is a call I made alone, with the reason,
so you can reverse any of it cheaply.

**Read §1 and §2 first.** The first is a thing you have to do before this feature is useful.
The second is a security defect I found and fixed in code that was already shipped.

---

## 1. The starter library is seeded, and none of it is approved

**What I did.** `scripts/seed-asides.ts` wrote **12 candidates into each of your two
organizations**, 24 rows, every one of them `PENDING` / `MODEL`.

**Why not APPROVED.** The design's own rule, which you approved: nothing a model wrote
reaches a send without a person moving it. `asidePickerQuery` only ever offers `APPROVED`
rows, so none of these can go out by accident, and the send screen will show an empty
library until you act.

**What you have to do.** Open `/dashboard/asides?status=PENDING` and approve, edit or
discard them. They are written to the themes you named. I think about half are worth
keeping and two are weak, but that is your call and not mine, which is exactly why they are
in a queue.

**The honest caveat:** I wrote them, and I am a model. That is what `source: MODEL` records,
permanently and uneditably. If you would rather the library be entirely yours, delete all 24
and write your own; the screens work with an empty library.

---

## 2. Three security fixes in the existing upload path

Not part of the feature as specified. I pulled them in because this feature is the first
thing that puts a user-uploaded image in front of roughly 800 people, and I was not willing
to build on top of them.

**A. SVG was accepted into a public bucket.** `app/api/media/upload/route.ts` accepted
`image/svg+xml`, and `newsletter-media` is public. An SVG can carry `<script>`, so Supabase
would have served script from a domain the product owns: stored XSS, `CLAUDE.md` A05. No
mail client renders SVG either, so it was risk with no upside.

**B. The MIME type was the client's word, and was stored as the served content type.** The
route validated `file.type`, which comes from the browser's multipart header and is
controlled by whoever posts, and then passed that same string to Supabase as the object's
content type. **`evil.svg` renamed to `meme.png` and declared `image/png` passed both
checks.** `lib/media/sniff.ts` now reads magic bytes and stores the file as what it is.

**C. WebP was offered and Outlook on Windows does not render it.** A WebP meme would have
arrived broken for a large share of the internal audience. Refused rather than warned about.

**What this changes for you:** the media library now accepts PNG, JPEG and GIF only. If
anything already in the bucket is an SVG or a WebP, it still exists and still serves; this
only stops new ones.

---

## 3. Calls I made on the design, all reversible

| Decision | Why | How to reverse |
|---|---|---|
| The block is a merge tag, not a `CustomBlock` | A custom block renders only in the built-in path and lands glued to the end of `{{projects}}` in an Unlayer template. As a merge tag it reached all three templates and the editor palette from one edit | It is one entry in `RADAR_MERGE_TAGS` and one call in `edition-template.ts` |
| The block is called adjacent to its anchor, not on its own line | On its own line the byte-stability snapshot caught a blank line appearing in **every** edition, including ones with no aside. An edition without one now renders identically to before this existed | Cosmetic only |
| `send-test` takes an optional `asideId` | Not in the spec. Without it there was no way to read a joke in a real inbox before it reached 800 of them. A test send never marks the aside used | Delete the parameter |
| The tab is addressable as `?status=` | The preview harness exposed this as a real gap: driving the fixture without driving the component made the heading say "approved" over pending rows. It also means the suggest flow can link to the queue | Remove `statusFromUrl` |
| The picker card sits above the readiness checklist | An edition with no closing block is a complete edition. Putting it in the checklist would have said it was a blocker | Move the JSX |
| The selected line appears twice, in the preview and highlighted in the list | The preview carries the image and attribution the list rows do not, so it is not pure duplication. I still think it reads slightly noisy | Hide the selected row from the list |
| An unknown `kind` in a frozen snapshot falls back to `JOKE` | Losing a delivered joke over a styling field is a worse answer than showing it as a joke | `frozenAsideFor` in `sent-snapshot.ts` |
| `DELETE /api/asides/:id` does not delete the stored image | The same file can sit in the frozen snapshot of a delivered edition, and the signed archive still renders it | Call `deleteFile` |

---

## 4. A bug the typechecker caught that no test would have

`template-renderer.ts`'s `RenderContext` dropped `oneMoreThing`. **A send uses the active
stored template when there is one**, and you have two seeded and editable. So the block
would have rendered in the built-in edition and in nothing an editor had actually built,
and every test would have stayed green because the built-in path was the one under test.

Fixed, and worth knowing as a shape: this repository has three render paths and a feature
is not done until all three carry it.

---

## 5. A trap closed in the tenant contract test

`tests/unit/tenant-scoping.test.ts` skips a model whose method is not a function, which is
correct for a model with no `update` or `delete`. But it meant **adding `"aside"` to
`MODELS` and forgetting the wrapper added zero tests and the suite still reported green.**
I only noticed because I expected a red test and got a green one.

There is now an assertion per model that it is wrapped at all. That one failed first, as it
should have.

---

## 6. What was verified, and how

| Claim | Evidence |
|---|---|
| The block renders and the alt text carries the joke | 15 unit tests in `one-more-thing-block.test.ts`, including a `<script>` payload and a quote-breaking alt |
| An edition with no aside is byte-identical to before | The existing snapshot did not change |
| Both renderers resolve the tag | The pre-existing merge-tag table test, which now covers it for free |
| Magic-byte sniffing refuses SVG declared as PNG | 9 unit tests in `media-sniff.test.ts` |
| Real delivery | **Two real emails sent and accepted by Resend**: `julian.andrade@linkconsulting.com` (`219f6c62-1d1f-4d29-821e-8620d2853af3`) and `jgrandrade@gmail.com` (`bbc60542-8a22-4b98-8fa8-2b9db5fb7812`) |
| The library screen, three states | Playwright at 1440px, zero console errors |
| The send-screen picker | Playwright: listed never-sent first, attaching rendered the preview and revealed "Send without one" |
| The suite | **1345 passing, 1 skipped**, `tsc` clean, `next build` clean |

**The skipped one is deliberate.** `scripts/send-aside-test.test.ts` only runs with
`SEND_REAL_EMAIL=1`, so `npx vitest run` never mails anybody.

---

## 7. What I did not do

- **The `/api/asides/suggest` endpoint has never been called against the real model.** It is
  typechecked, built and its prompt and parser are unit tested, but I did not spend your
  Anthropic budget proving the round trip. That is the one thing on this page with no
  end-to-end evidence behind it.
- **No test send used an image or a GIF**, because the library has no image in it yet. The
  image path is unit tested and rendered in the browser, not confirmed in Outlook. When you
  approve a meme, send yourself a test before an edition carries one.
- **Nothing was sent to a real subscriber list.** Every send in this session went to the two
  addresses you named.
- **I could not reach your phone.** The push notification returned "Remote Control inactive",
  so only the terminal notification fired. If you expected a phone alert and did not get one,
  that is why, and it is not a Claude Code failure you need to chase.

---

## 8. Where the paperwork is

- Spec: [docs/superpowers/specs/2026-08-08-one-more-thing-design.md](superpowers/specs/2026-08-08-one-more-thing-design.md)
- Plan: [docs/superpowers/plans/2026-08-08-one-more-thing.md](superpowers/plans/2026-08-08-one-more-thing.md)
- Supersedes §4 of [docs/IDEAS-2026-08-07-what-to-build-next.md](IDEAS-2026-08-07-what-to-build-next.md), which recommended text only and against images. You reversed that, and the upload work in §2 above is the price of the reversal.
