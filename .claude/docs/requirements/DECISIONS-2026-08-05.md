# Decisions taken while you slept

Night of 4 to 5 August 2026. You said to carry on with the remaining
requirements, and where I had doubts, to follow my own recommendation and write
it down for you to review. This is that list.

Every item says what I chose, why, and what to do if you disagree. Nothing here
is expensive to reverse except where marked.

---

## 1. The RQ-004 watchlist topics

**Chosen:** the five topics I had recommended: Large Language Models, AI Tools,
AI Research, Cloud AI, AI Regulation. From them, 23 entities in
`lib/radar/watchlist.ts`.

**Why:** "AI Applications" and "AI Business" are the two largest categories in
the corpus and the two least useful for choosing entities, because almost
anything qualifies. Twenty-three is inside the 15 to 25 the scope revision asked
for, and small enough that every query could be validated by hand before any data
was collected.

**To change it:** edit the file and run `npx tsx scripts/radar-seed-watchlist.ts`,
then `npx tsx scripts/radar-validate-queries.ts --write`. Adding an entity costs
nothing. Removing one loses its series, which cannot be rebuilt, because there is
no backfill.

## 2. Entities are global, not per organization

**Chosen:** one `RadarEntity` catalogue shared by everyone, plus `RadarWatch`
saying which organization follows which entity. Signal counts hang off the global
entity.

**Why:** how often Hacker News posted about MCP is a fact about the world, not
about a tenant, so it is counted once and read by everyone. This also dissolves
the flaw the plan review raised as F2 instead of working around it. The review
offered three fixes for a unique key containing a nullable `organizationId`, all
of which keep the nullable column; removing the column from the key entirely means
Postgres cannot treat NULLs as distinct and the duplicates it was meant to prevent
become impossible. It also fixes the cross-tenant leak the review noted
separately, where one organization's niche entity showed up in another's rankings.

**Cost:** if a second organization ever wants a different watchlist, it gets one
for free. If it wants the *same* entity counted differently, it cannot have that.
I judged that unlikely enough to ignore.

## 3. Query design: measured, and it contradicted the plan

The plan review called query precision make-or-break and it was right, but two of
its specific assumptions did not survive contact with the APIs.

**What it predicted:** `"MCP"` on Hacker News would be mostly Minecraft Coder Pack
and Microsoft Certified Professional, so the query should demand the phrase
"Model Context Protocol".

**What is actually true:** on Hacker News in 2026, `MCP` returns MCP discussion at
100% measured precision, and the full phrase returns almost nothing because nobody
writes it out. Demanding the phrase would have traded a live signal for silence.
The abbreviation stays.

**What the plan missed entirely:** arXiv does not do phrase matching in the `all:`
field. `all:"Mistral AI"` returned papers with no mention of Mistral, because "AI"
appears in nearly every abstract, so the disambiguating word made the query worse
rather than better. A nonsense control returns nothing, so this was my query's
fault and not the API's.

**Chosen:** the disambiguator on arXiv is a category filter, `cat:cs.AI OR cat:cs.CL
OR cat:cs.LG`, applied centrally in `lib/radar/sources.ts` so a watchlist entry
cannot forget it. That is what removes the nuclear-physics MISTRAL spectrometer and
the astronomical Gemini. Person-like names additionally use `abs:` rather than
`all:`, because `all:` includes the author list and would count every computing
paper by anyone called Claude.

## 4. Hacker News counts stories, not comments

**Chosen:** stories only. For "agentic" on 3 August: 78 stories, 361 comments.

**Why:** one popular thread producing hundreds of comments would swamp a week of
signal, and the question the radar answers is how often something was posted
about. Comments are a defensible alternative measure of the same thing, and if you
would rather have them, it is one parameter in `countHackerNews`. It cannot be
applied retrospectively to days already collected.

## 5. Precision threshold, and what failing it costs

**Chosen:** 0.7, and a query below it is dropped for that source rather than the
entity being deactivated.

**Why:** vLLM is unambiguous on Hacker News and collides with Vision LLM on arXiv.
Deactivating the entity would throw away a good series to punish a bad one.

**Where we ended:** all 38 query and source pairs pass, the weakest at 0.75. So
nothing is currently dropped. Worth knowing that two earlier rounds of that
measurement were wrong: judging arXiv hits by title alone put Claude at 15% on a
sample that was mostly benchmarking Claude, and truncating the abstract to 320
characters still put it at 45%. Both were flaws in how I measured, not in the
query, and both would have deactivated three good entities.

## 6. AI spend, unattended

**Chosen:** I spent roughly 120 Haiku calls on query validation, across four
measurement rounds. Judging 20 short abstracts is not work that needs a large
model.

**Why it is on this list:** you were asleep and I spent your API budget without
asking. The amount is a few cents. Say so if you would rather I did not do that
again.

## 7. The categoriser's stored damage was NOT repaired

**Chosen:** `scripts/clean-article-categories.ts` exists, is dry run by default,
and **I did not apply it**.

**Why:** it rewrites curated data with no undo, and 23 stories were lost to one
unconfirmed bulk action earlier in this project. Thirteen articles would change
and seven would be left with no category. That is small enough to wait for you.

**What the dry run says:** run it with no arguments to see the same report I saw.
Add `--apply` when you are happy.

Its first version was wrong, and the dry run is what caught it: it reported 3134
changes because it treated the 3121 articles that were never categorised as
unplaceable, which is a different and untrue statement about 70% of the corpus.

## 8. RQ-006 was not built

**Chosen:** left alone deliberately, beyond what is already written in its plan
and review.

**Why:** it is the only requirement on the list whose main risk is not technical.
Its own review records that no human is guaranteed to read a generated piece before
it reaches a subscriber, which makes the mechanical checks the only control, and
F3 needs a publisher allowlist that is an editorial decision rather than a
technical one. Shipping AI-rewritten news derived from other publishers' articles
while you sleep is not a call I should make.

**My recommendation for F3, when you get to it:** default deny, and start the
allowlist with publishers who already publish full text in their feeds, since
fetching those adds nothing they have not already given away. Ars Technica, The
Verge and TechCrunch truncate deliberately and should stay off it.

## 9. RQ-002 Q7, the model column on CurationJob

**Chosen:** not added.

**Why:** the log entry already records the effective model, so the column buys
tidiness rather than capability, and it costs a migration. If you want it, say so
and it is ten minutes.

---

## Things I found that nobody asked about

**The checkbox in every list never showed a tick.** Clicking one row selected it,
the bar counted it, and the box stayed empty, in all five lists. `onClick` called
preventDefault, and the browser's revert of the property it had optimistically set
landed after React had rendered. Fixed, with tests that fail against the old
version. This one had been live since the selection work shipped.

**The collection status band on the proposal screen had no data.** The client
expected `pipeline` in the payload and the route never sent it, so story 5 of
RQ-005, which exists so nobody starts a run to find out whether one is needed,
answered nothing. Worth knowing why it looked fine: the preview harness stubs that
field in its fixture.

**Force delete and delete scoped the edition but not its delivery events.** No live
bug, because ids always arrive from a tenant-scoped read, but `deleteNeverSentEditions`
filtered the edition on `sentAt: null` while deleting its events unconditionally,
so asked for a sent edition it would have kept the edition and destroyed the record
that it went out.

**The categoriser's real failure was not inventing categories.** Where an article
was not about AI, and many are not, the model refused in a sentence, and the
sentence was split on commas and stored as categories. "Based on the title and
content provided" is a category in your database. That also says something about
the corpus: solar energy, Linux CVEs and GnuPG are being collected and scored.

**Hacker News is already an active RSS source**, with 43 articles collected. That
is why the radar collector counts mentions rather than ingesting items: the
ingestion already exists and is a different job.

**3121 of 4418 articles have no category at all**, because they scored below the
threshold and never reached the categoriser. Not a defect, but it means any
category-based filter sees 29% of the corpus.

---

## What I did not touch

The 45-feed OPML is still not imported, and the two dead active feeds are still
active. Both are one-click jobs, and importing four arXiv feeds carrying 100 to
710 items a day each is a spend decision I was not going to take for you at two in
the morning.
