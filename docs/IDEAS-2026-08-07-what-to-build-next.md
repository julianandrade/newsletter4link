# What to build next, and what it costs

Written 7 August 2026 against your list: a podcast or video of the edition, a meme or joke slot,
PT/ES/EN versions, automatic light and dark, "and more".

Every entry says what already exists, because three of your five are further along than they look
and one of them is finished. Nothing here is implemented. This is for you to cut.

**Read §1 first.** Not because it is the most exciting, but because the product currently reports a
number that is not true, and everything else is decoration on top of that.

---

## 1. Email tracking has never recorded anything, and analytics reports on it anyway

Not on your list. It should be first.

`EmailEvent` has **zero rows**. The Resend webhook attaches an open or a click by looking up the
`SENT` event with the matching messageId, and there has never been one, so there is nothing to
attach to. Meanwhile `app/api/analytics/route.ts` computes open rates and segments them by
subscriber language, and the Analytics screen presents them.

So the dashboard shows engagement figures for a product that has never measured engagement. Until
this is fixed, every number in §4 and §5 below is unmeasurable and you cannot tell whether any of
this worked.

I did not touch it: it is a diagnosis, not a five-minute fix, and it needs a real send to verify.

**Value: the highest here. Effort: unknown until someone traces one send end to end.**

---

## 2. PT, ES and EN: the schema is already there and the sender ignores it

**What exists.** `Subscriber.preferredLanguage`, defaulting to `"en"`, documented as
`en, pt-pt, pt-br, es, ar`, with an index on `[preferredLanguage, active]`. It is set by the CSV
importer, editable on the Subscribers screen, and **segmented in analytics**. `OrgSettings` has
`rewriteLanguage`, defaulting to `pt-PT`.

**What does not exist.** Any read of it in the send path. Every subscriber gets the same email:
English chrome, Portuguese generated content. The analytics screen breaks open rates down by a
preference the sender has never honoured.

**The shape I would build.** Translate once per edition, not once per subscriber:

1. `EditionTranslation { editionId, language, payload Json, model, createdAt }`, one row per
   language, holding the translated bullets, summaries, top-story text and section names.
2. A "prepare languages" step on the send screen: one model call per language over the whole
   edition's text, which is far cheaper than per article per language, and gives an editor one
   thing to read and approve rather than forty.
3. The chrome is about 25 strings (`This week in 30 seconds`, `Top story`, `Trend radar`,
   `Internal`, `Read the full feed`, `Unsubscribe`, the disclaimer, the month abbreviations). A
   plain record per language in `lib/email/strings.ts`. No i18n framework: 25 strings times 3
   languages does not justify one.
4. **The send loop already personalizes per subscriber**, as of last night. Choosing a language
   variant there is a small step rather than a new mechanism, which is the main reason this is
   cheaper this morning than it was yesterday.

**Watch out for:** the subject line and the preheader need translating too, or the inbox lies about
the language before it is opened. And `weekRangeLabel` returns English month abbreviations.

**Value: high, and the product already claims it. Effort: medium. Cost per edition: one model call
per language, a few thousand tokens each.**

---

## 3. An audio edition. Yes. Video, not yet

**What exists that helps.** As of last night there is `/editions/[id]`, a signed per-subscriber page
that already renders one edition. **That is the natural home for a player**, and it is the reason
this is now a feature rather than a project.

**NotebookLM is the wrong dependency.** Its Audio Overviews have no public API to call from a cron
job. Do not build a product on a button in someone else's web app.

**The shape I would build.**

1. A model call turns the edition into a two-host script, 900 to 1300 words, roughly six minutes.
   Claude is good at this and you already have the key.
2. Text to speech with two distinct voices. Google Cloud TTS has multi-speaker and is the cheapest;
   ElevenLabs sounds markedly better and costs roughly two dollars for a six-minute episode.
3. Store the MP3 on Vercel Blob. Never attach audio to an email.
4. The email carries a card: a static waveform image, the duration, and a link to
   `/editions/[id]`, where an `<audio>` element plays it. **No email client plays audio inline**, so
   anything else is wasted effort.
5. Generated on demand from a button on the send screen, not on every edition. A weekly internal
   newsletter does not need an episode nobody asked for.

**The honest risk:** a six-minute synthetic two-host discussion of nine links is either delightful
or excruciating, and which one it is depends almost entirely on the script prompt. Build the script
step first, read three of them, and only then pay for voices.

**Video: recommend against, for now.** The cost is an order of magnitude higher, the assets do not
exist, and for an internal weekly the marginal value over audio is small. If you want something
visual, the cheaper win is a generated share card for the top story.

**Value: high novelty, moderate utility. Effort: medium. Cost per episode: roughly two dollars for
voices plus a few thousand tokens.**

---

## 4. The joke slot. Curated, not generated

You are right that this material is good, and right that it fits the audience. The trap is who
writes it.

**Do not have a model write the joke each week.** Model humour about LLMs lands somewhere between
flat and cringe, it will occasionally be subtly off, and this goes out under Linkroad's name to
eight hundred colleagues. The cost of one bad joke is much higher than the value of fifty passable
ones.

**What exists that helps.** `BLOCK_POSITIONS` and `CustomBlock` already exist in
`lib/email/template-renderer.ts`, with an `after-projects` anchor that is exactly where a closing
aside belongs, and the machinery to inject editor-authored blocks is already wired and tested.

**The shape I would build.**

1. An `Aside` table: `text`, `attribution`, `tags`, `lastUsedAt`. A closing one-liner, text only.
2. A curated starter set that you approve once, written to the themes you named: before ChatGPT
   versus now versus whatever is next, agentic everything, slop, the specific comedy of a senior
   engineer reviewing a diff no human wrote.
3. On the send screen, a "one last thing" slot that suggests the least recently used aside matching
   the edition's topics, with a reroll and a free-text override. The editor always sees it before it
   goes.
4. Optionally, a model *suggests candidates* into the library for you to approve. Suggestion into a
   queue, never straight into an email.

**Text, not images.** A meme image in email needs hosting, an alt text that carries the joke for
anyone with images off, and it will look wrong on a dark card. A one-liner survives all three.

**Value: real, and cheap. It is the thing people forward. Effort: small. Cost: nothing per edition.**

---

## 5. Automatic light and dark: already done, with one thing to check

**The email:** done, and two defects in it were fixed last night. It honours
`prefers-color-scheme`, carries the `[data-ogsc]` mirror Outlook.com needs, swaps a light and dark
logo pair, and never uses pure black or white. The Unlayer variants get the same treatment injected
on export.

**The dashboard: not automatic, and making it so is not one line.** I checked, expecting a quick
fix, and it is subtler than that.

`app/layout.tsx:43` sets `defaultTheme="linkroad-dark"` with `enableSystem`. Those do different
things than they look like: `enableSystem` makes `system` *available* in the picker, it does not
make it the default. So a new user gets the dark Linkroad theme whatever their operating system
says, and "automatic" is true only for someone who went looking for it.

The obvious fix, `defaultTheme="system"`, is wrong. `next-themes` resolves `system` to the themes
literally named `light` and `dark`, and this app's list has those as generic entries alongside the
sixteen branded ones. So flipping that line would hand every new user a plain unbranded light or
dark theme instead of the Linkroad palette. That is worse than what is there now.

**What it actually needs:** a small wrapper that watches `prefers-color-scheme` and picks
`linkroad-light` or `linkroad-dark`, plus a decision from you about whether the brand default
should yield to the operating system at all. That second part is a taste call, not an
implementation, which is why I stopped here rather than changing how the app looks while you were
asleep.

**Value: real. Effort: an hour, once you have decided whether brand beats OS.**

---

## 6. Six more, in the order I would take them

**A. Say why a story is here.** The scorer already produces a relevance score and reasoning, and
the email shows neither. One line under the top story, in the organisation's own words, is the
difference between a link list and an editorial product. Cheapest high-value item on this page.

> Correction, 12 August 2026: the scorer produces the score only. `scoreArticleRelevance` asks the
> model to "respond with ONLY a single number" and `Article` has no reason field; `aiRelevanceNote`
> exists on `SearchResult` and nowhere else. So this needs the reason generated and stored first,
> not just displayed. See `BRAINSTORM-2026-08-11-saas-teardown.md` §4.

**B. Reading time and story count in the masthead.** "9 stories, 4 min" gives a reader a reason to
keep scrolling. One line of code, and it was cut from last night's scope only for focus.

**C. The trend radar should report falls.** `edition-data.ts` filters `delta > 0`, so the radar only
ever says things are accelerating. A topic that dropped 40% is news. This is an editorial decision,
which is why I left it alone rather than deciding it for you.

**D. A public archive, as well as the signed one.** What exists is per-subscriber. A public,
curated-external-links-only archive would give the practice something to point clients at. Needs
you to decide what is publishable, which is exactly the question we deferred last night.

**E. Send-time per timezone.** The batch loop sends to everyone at once. Subscribers have no
timezone field yet, so this needs a column and a schedule, and it is worth measuring open rates
first, which needs §1.

**F. Deliverability posture.** Nobody has checked SPF, DKIM and DMARC alignment for the sending
domain, and the preheader is currently the lead story's first sentence rather than a written one.
Both are small and both affect whether any of the above is ever seen.

---

## If you only do three

1. **§1, make tracking real.** Everything else is unmeasurable until then, and the dashboard is
   currently reporting numbers that cannot be true.
2. **§2, the languages.** The schema, the importer, the subscriber screen and the analytics already
   promise it. Not delivering it is the largest gap between what this product says and what it does.
3. **§4, the joke slot.** Small, cheap, no AI risk if curated, and the most likely of anything here
   to make someone forward the email.

§3, the audio, is the one I would most enjoy building and the one I would schedule fourth.
