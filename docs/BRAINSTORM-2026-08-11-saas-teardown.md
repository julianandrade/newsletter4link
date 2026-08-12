# SaaS teardown: conclusion and gap analysis

Written 12 August 2026 against the research pass in `docs/brainstorming/SaaS Newsletter tool/`:
a teardown document plus 31 screenshots of Readless, Inoreader, Feedly Threat Intelligence and
Feeder, walked live in-browser on 11 August, with two further Inoreader captures added on the 12th.

**Posture, decided:** newsletter4link stays an **internal tool for Link/Linkroad**. That decision
does most of the filtering here. Everything the four competitors do to acquire and monetise a
stranger, pricing ladders, trials, upsell placement, self-serve onboarding, is deliberately
excluded, and §5 argues that the scaffolding for that motion already in this codebase is now a
liability rather than an asset.

Every claim about newsletter4link below was verified in code. Paths are given so each one can be
checked. This supersedes `IDEAS-2026-08-07-what-to-build-next.md` on one point, marked in §4.

**Nothing here is implemented.** This is for you to cut.

---

## 1. The single most important finding: three of the four are not competitors

The teardown's own framing is that the four split on "how much of the reading the software does
for you". That is correct for the four, and it is the wrong axis for newsletter4link, because
**all four are consumption products and newsletter4link is a production product.**

Readless, Inoreader and Feeder each serve one person reading for themselves. newsletter4link
serves one editor curating for roughly 800 colleagues. The reader never touches the app; they get
an email. Nothing in Readless's or Feeder's or Inoreader's core loop maps onto that.

The one real analogue in the set is the half of Feedly Threat Intelligence sitting under
**Produce** and **Deliver**: "Create reports", "Create newsletters", "Slack, Microsoft Teams",
"STIX API", "MCP Server". That is the same job newsletter4link does, for a different vertical,
sold at enterprise prices to 380 CTI teams.

**Consequence:** Feedly is the benchmark. Readless is the source of exactly one idea, but it is
the best idea in the document. Inoreader and Feeder contribute craft details, not strategy.

This reframing matters because a naive reading of the teardown would push toward feed volume,
refresh speed, reader ergonomics and AI-per-day quotas, which are the axes the three consumption
products compete on and which are close to irrelevant to a weekly internal edition.

---

## 2. Where newsletter4link actually sits

The teardown's sharpest observation is the four-way split on **where the AI sits**:

| Product | AI posture |
|---|---|
| Readless | AI output *is* the product; no raw feed exists |
| Inoreader | AI is an optional action on an item you already chose |
| Feedly | AI is enrichment metadata inline in the list row, signal before the click |
| Feeder | AI is a metered utility bolted on the side |

newsletter4link is a **fifth posture the document does not name: AI as the editor's pre-filter.**
The model scores and summarises every article before a human ever sees it
(`lib/curation/curator.ts`), and the human's job is approval rather than discovery. The reader
downstream gets no AI affordance at all.

That posture is defensible and probably right for an internal newsletter. It has one specific
weakness, covered in §4: the editor's screen shows the *result* of the AI's judgement without
showing the *reasoning*, which is precisely the thing Feedly sells.

---

## 3. Gap analysis

Filtered to the internal-tool posture. Ordered by value to the weekly edition, not by how
prominent the feature is in the competitor.

### 3.1 Real gaps, worth building

#### A. Cross-source synthesis and story clustering. Absent. The biggest gap in the document

Readless Max produces "one woven briefing": a single editorial narrative that merges the same
story appearing in several newsletters, organised into themes, with numbered citations back to
each originating source (`readless-03`). Feedly does the cheap version: a story row carries "Also
in IT Security News, The IT Nerd, +316 feeds" (`feedly-02`).

newsletter4link has neither. `lib/curation/deduplicator.ts` computes cosine similarity over the
last 30 days at a 0.85 threshold and **drops** the second copy. The information that six sources
carried the same story is computed and then thrown away. Ghost Writer
(`lib/generation/generator.ts`) then produces per-article summaries grouped by `article.category`,
one `sourceUrl` each; there is no multi-article merged prose anywhere.

This is unusually reachable, because the hard parts already exist: embeddings, a similarity
function, a section structure, and a rewrite pipeline with mechanical fact checks
(`lib/rewrite/checks.ts`). The missing piece is a `Story` grouping above `Article` and a
generation step that takes N articles instead of one.

Two steps, cheap first:

1. Keep the similarity result instead of discarding it. Store the corroboration count and the
   sibling source names on the surviving article. That alone gives the editor and the email
   "reported by 6 sources", which is Feedly's pattern for a fraction of the work.
2. Only then consider a synthesis pass over a cluster.

#### B. Ask AI over our own archive. Absent, and easy to believe present

`/dashboard/search` is a primary nav entry, and it searches **the web** via Tavily
(`lib/search/providers/tavily.ts`). There is no route, no index and no endpoint that searches the
stored corpus: `Article.content` has no full-text index and nothing queries it.

Feedly's Ask AI (`feedly-01`) is a research console grounded in its own vetted sources. The
internal equivalent is worth more to Link than to a CTI team: after months of collection the
archive is a real knowledge asset and nobody can ask it a question. "What did we cover on agentic
coding last quarter" has no answer in this product today.

#### C. Microsoft Teams as a delivery channel. Absent, and the cheapest high-value item here

Feedly sells Slack and Teams delivery on its Advanced tier; Feeder gates Slack/Teams posting
behind Rules on Plus. Link is a Microsoft shop and this codebase **already has the client**:
`lib/email/graph-sender.ts` and `lib/sharepoint/publisher.ts` both authenticate against Microsoft
Graph, and SharePoint page publishing already works end to end.

Posting the edition to a Teams channel reuses existing auth, existing tokens and an existing
publisher pattern. Grep confirms no Teams or Slack integration exists: every hit for "slack" is the
English word in a comment (`lib/inbound/process.ts:190`), and every hit for "teams" is
`Project.team`, the internal project's owning team.

#### D. Per-subscriber language. Absent, still, and the product claims it

Readless sells this explicitly: "Read every newsletter in your language" (`readless-04`).
newsletter4link stores `Subscriber.preferredLanguage`, indexes it, lets the CSV importer set it,
lets the Subscribers screen edit it, **and segments analytics by it**, while
`lib/email/personalize.ts` substitutes only three signed URLs per recipient. The body is rendered
once per send.

Unchanged from `IDEAS-2026-08-07` §2, and the shape proposed there still looks right: translate
once per edition into an `EditionTranslation` row, not once per subscriber. Carried forward here
because an external product now validates the demand.

#### E. Rules and automation. Absent

Feeder's Rules (`feeder-03`) filter incoming posts and fire actions. Inoreader ships 30 rules and
50 filters on Pro. newsletter4link has no rules engine of any kind.

For an internal tool with a 458-feed InfoSec OPML preset available (`lib/config.ts:236-243`), the
valuable subset is narrow: auto-discard by keyword or source, auto-tag, auto-route. Take the
narrow version only. A general rules engine is a consumption-product feature and would be scope
for its own sake.

#### F. Editor triage ergonomics. Absent

No read state, no starring, no keyboard triage anywhere in the schema. Feeder's three-pane with a
keyboard path (`feeder-01`) exists because working a queue is the job.

The honest scale question: this editor works a proposal of about 10 articles a week, not an inbox.
The archive is large, 128 approved and 165 undated per the decision log in `CLAUDE.md`, but the
weekly loop is small. **A three-pane reader would be building Feeder for an audience of one.**
What the job actually needs is in §5b, and it is smaller than a reader.

#### G. OPML export. Absent. Import exists

`lib/opml/parser.ts` and `app/api/rss-sources/import/route.ts` import OPML; XLS is not supported.
Feeder offers export to OPML plus XLS and CSV import (`feeder-05`). Export is perhaps an hour, and
is worth doing purely as a backup path for a hand-curated source list that currently exists in
exactly one place.

#### H. Cost visibility. Absent

Feeder meters AI by daily count (2/10/60/200) and Inoreader sells Intelligence reports as a paid
add-on, both because inference costs money. newsletter4link records no token usage anywhere:
grepping `inputTokens|outputTokens|costUsd|tokensUsed` across `lib/` and `app/` hits only
`lib/rewrite/checks.ts`, and there for text analysis rather than accounting.

Every edition runs scoring, summarising, categorising, embedding, rewriting and generation across
dozens of articles, and nobody can say what an edition costs. For an internal tool this is the
form the metering question takes: not a quota to sell, a number to know.

### 3.2 Ideas correctly rejected for this posture

- **Digest schedules and scheduled sends.** Readless's whole model is cadence. newsletter4link
  deliberately deleted its `weekly-send` cron; `app/api/cron/weekly-proposal/route.ts:17-28`
  records the rule: "Automation may propose. Only a person may approve." That decision is right
  for something going out under the company's name, and should not be revisited because a consumer
  digest product does it differently.
- **Feed volume and refresh speed ladders.** Inoreader's 150-vs-2500 and Feeder's
  30-minute-vs-1-minute are monetisation axes. Irrelevant here.
- **Bring your own API key and provider choice.** Inoreader's genuine differentiator
  (OpenAI/Mistral/Anthropic, own key) is a privacy answer for strangers. Link runs its own keys
  already, and model choice within Anthropic exists (`OrgSettings.aiModel`, `lib/ai-models.ts`).
- **Public dashboards, embeddable widgets, RSS output.** Feeder's Publish tab (`feeder-04`). These
  serve someone republishing to an audience they do not have an email list for. Link has the list.
- **Reader/inbox UX, mobile app, offline.** Consumption features. See §3.1F and §5b.

### 3.3 The one structural idea worth copying

**Feedly's Collect / Produce / Deliver verb-based navigation** (`feedly-01`, `feedly-02`) is the
strongest structural idea in the set, and the teardown says so twice.

newsletter4link's nav (`components/app-sidebar.tsx:42-69`) is object-based and flat: seven primary
entries (This week, Trends, Search, Editions, Sources, Analytics, Settings) plus seven under a
"Workspace" heading (Articles, Projects, Curation jobs, Ghost Writer, Templates, One more thing,
Subscribers). It is clean, and "Workspace" is a label that means nothing, which is the tell that
the grouping is residual rather than designed.

The verb mapping is nearly free and reads better:

- **Collect**: Sources, Curation jobs, Articles, Search, Trends
- **Produce**: This week, Ghost Writer, Editions, Templates, One more thing, Projects
- **Deliver**: Subscribers, Analytics, Archive

The third column exposes a real absence: **there is no Archive entry in the nav at all.**
`app/editions/` renders sent editions behind a per-subscriber signed token, and the editor who
made them has no route to browse them.

This is a nav restructure, not an architecture change, and it is the cheapest item on this page.

---

## 4. What is already built and invisible

This is the part the teardown could not see, and it is where newsletter4link is ahead.

**The Link Take never reaches the reader.** `lib/rewrite/` produces an original 150 to 250 word
editorial piece per approved article, in Portuguese, with hard rules against copying, then
**mechanically verifies** the output: longest-shared-run detection against the source and
digit-token verification, fail-closed with one retry, with the verdict, the failures and the
longest shared run persisted on `ArticleRewrite` alongside full version history.

Nothing in this teardown does anything comparable. All four sell citations as the trust mechanism,
and the teardown's own conclusion is that "trust, not accuracy, is the perceived buying objection".
newsletter4link does not merely cite, it *verifies*, and then shows the result on exactly one
screen: `app/dashboard/articles/[id]/page.tsx`. Grepping `rewrite|linkTake` across `lib/email/`
returns nothing. **The email sends `Article.summary`.**

The single highest-value change available is putting the Link Take in the edition.

**The scorer produces a number and no reason.** `scoreArticleRelevance` (`lib/ai/claude.ts:22-88`)
instructs the model to "respond with ONLY a single number", and `Article` carries
`relevanceScore Float?` with no companion field. Meanwhile `SearchResult` carries `aiScore`,
`aiSentiment` **and `aiRelevanceNote`, "Why it's relevant" (`prisma/schema.prisma:879`)**. So the
web-search path explains itself and the curation path does not.

> **This corrects `IDEAS-2026-08-07` §6A**, which said the scorer "already produces a relevance
> score and reasoning, and the email shows neither". It produces the score only. Surfacing the
> reason means generating and storing it first, which is more than a display change.

It is still worth doing, and it is the exact mechanism behind Feedly's inline enrichment: the
reason is what turns a link list into an editorial product.

**The corroboration signal is computed and discarded.** See §3.1A.

---

## 5. The dead SaaS scaffolding

Now that the posture is settled, this is a finding rather than an observation.

The codebase carries a full self-serve SaaS apparatus that will never be used:
`Plan FREE|STARTER|PROFESSIONAL|ENTERPRISE` with prices of $0/$29/$99
(`lib/plans/features.ts:91-115`), a nine-flag feature matrix enforced at roughly 25 route sites,
`components/upgrade-prompt.tsx`, `components/usage-card.tsx`, a Plan tab in Settings,
`customDomain` and `whiteLabel` flags with **no implementing code**, and an `ApiKey` model that is
issuable and unusable because no route ever verifies a key (`keyHash` is read only by the
key-management routes themselves). There is no Stripe and no billing: `grep -ri stripe` returns
nothing.

Two consequences:

1. **It gates real features behind a plan nobody is selling.** `ghostWriter` requires STARTER;
   `trendRadar`, `personalization` and `apiAccess` require PROFESSIONAL. An organization row on
   `FREE` or `STARTER` has Ghost Writer and Trend Radar switched off by a commercial model that
   does not exist.
2. It is permanent drag: every new route inherits the question of which tier it belongs to.

**Checked on 12 August 2026, and consequence 1 is not currently live.** There is exactly one
organization, `link-consulting` / `default-org-001`, and it is already `ENTERPRISE` with
`subscriberLimit` 999999 and 17 subscribers. Nothing is gated off today. The earlier draft of this
document treated that as an open risk; it was not, and no data change was needed.

Two smaller things the check turned up:

- **The `subscriberLimit` column is decorative.** Nothing reads it. Every limit check goes through
  `getSubscriberLimit(plan)`, which returns `PLAN_FEATURES[plan].subscriberLimit`, so ENTERPRISE is
  `Infinity` in code regardless of the 999999 stored on the row.
- **The recurrence risk is real and unfixed.** See below.

### Decision, 12 August 2026

**Set every organization to `ENTERPRISE` and leave the apparatus dormant behind a one-line note.**

The alternative, deleting the gating and keeping `Plan` as an inert label, is a real refactor and
throws away optionality: a Link Consulting client offering was on the table and was not chosen
*today*, which is not the same as never.

What that means concretely:

- ~~Every existing `Organization.plan` set to `ENTERPRISE`.~~ **Done, and it required no work:**
  the only org was already ENTERPRISE. Verified 12 August 2026 by a read-only query. If a second
  org ever appears, `scripts/upgrade-org.ts` is the existing script for this shape of change and
  the superadmin console at `/dashboard/platform` can do it by hand.
- **`Organization.plan` must default to `ENTERPRISE`. This is the only part still outstanding, and
  it is the whole of the remaining risk.** `prisma/schema.prisma:20` reads `plan Plan
  @default(FREE)`, and `createOrganization` (`lib/auth/context.ts:272`) does not set `plan`, so
  **every org created through `/onboarding` lands on FREE with Ghost Writer, Trend Radar,
  personalization and API access switched off.** The reason this has never bitten is that exactly
  one org has ever been created, and it predates the flags. The fix is a one-word schema change
  plus applying it to the database, so it is the only part of this item that is not a data edit.
- One note at the top of `lib/plans/features.ts` recording that the ladder is dormant, that every
  org is ENTERPRISE by decision rather than by accident, and that the flags are kept because the
  client-offering posture was deferred and not rejected. Without that note the next reader finds a
  nine-flag matrix that nothing varies, and deletes it as dead code.
- Leave `upgrade-prompt.tsx` and `usage-card.tsx` in place. With every org on ENTERPRISE the
  upgrade prompt is unreachable and the usage card reports against an infinite subscriber limit,
  which is harmless. The Plan tab in Settings is worth a second look: a tab showing a plan nobody
  can change is a control that changes nothing, which this project has a decision against.

---

## 5b. Inoreader's list and detail: take the interaction, not the layout

Two further captures added 12 August (`2026-08-12_16h42_03.png`, `2026-08-12_16h42_10.png`) show
Inoreader's card grid over 360 unread items and, over it, the article detail.

**The detail is the part worth having.** It opens as an overlay on the dimmed list, not a
navigation: the toolbar sits at the top (save, tag, mark read, an AI sparkle, share), the body
renders inline, and **chevrons on both edges step to the previous and next article without
closing**. Note the unread count going 360 to 359 behind the overlay: the list stays live and keeps
its place.

Ours is a page. Clicking a story navigates to `/dashboard/articles/[id]`, and coming back is a
second navigation that loses scroll position and, on the articles list, the filter and selection
state. For a job whose whole shape is "look at 10 to 30 scored stories and say yes or no", that is
the wrong transaction cost, and it is the concrete form the triage gap in §3.1F takes. It fits
better than Feeder's three-pane, because the problem is not wanting a permanent list pane, it is
not wanting to lose your place.

**Take:**

- The detail as an overlay over the list, with prev/next chevrons and arrow-key equivalents.
- Approve, reject and discard in a fixed bar at the top of the overlay, with keyboard shortcuts,
  reusing `components/article/article-state-controls.tsx` rather than a second set of controls.
- The sparkle slot, repurposed. Inoreader's is Summarize, which is its posture and not ours,
  because we summarise before the editor arrives. Ours is the natural home for "regenerate the
  Link Take" and, once §4 exists, "why did this score 8".

**Do not take the card grid.** It is the wrong default here, for reasons that are specific rather
than aesthetic:

- **We have no images.** `imageUrl` exists on `Project` (`prisma/schema.prisma:359`),
  `SearchResult` (`:868`) and `Aside` (`:1343`), and **not on `Article`**. Every card in the queue
  would be an empty box. Filling them means an OG-image fetch per article against publishers we
  deliberately do not fetch: `lib/rewrite/fetch-policy.ts` ships an empty allowlist on purpose.
- **It hides the signals the job runs on.** In the capture you get four headlines, all truncated to
  three lines, and nothing else above the fold. Our compact row already carries title, source,
  score meter, categories, status chip and summary in less vertical space
  (`components/article/article-list-row.tsx`). A grid trades every one of those for a photo, and a
  truncated headline is actively harmful when the headline is the thing being judged.
- **A grid is a browsing affordance and we are not browsing.** Inoreader's user is choosing what to
  read out of 360 items. Ours is judging 10 to 30 items a model has already scored.

If a card view is ever wanted, `components/layout-toggle.tsx` already defines
`cards | compact | table`, so it belongs there as an option someone opts into, never as the default.

**Also do not take read state.** Inoreader is an inbox-zero model: opening marks read, and "Mark
all as read" clears the count. Ours is a verdict model, `PENDING_REVIEW / APPROVED / REJECTED` plus
`discardedAt`, and those carry the editorial decision that read/unread cannot. A separate read flag
would give two overlapping notions of "dealt with", and the queue count would stop meaning "still
needs a decision".

One thing the capture is a reminder of rather than a proposal: its search box says "Search in
articles" and searches the corpus. Ours searches the web. That is §3.1B, and it is separate work.

---

## 6. Conclusion

The teardown is good research and its most valuable output is negative: it shows that three of the
four products studied are solving a different problem, and that copying their roadmaps would take
newsletter4link sideways.

Filtered to what actually applies, the gap is narrower than 31 screenshots suggest, and it is
concentrated in one place: **newsletter4link's AI does excellent work that the product never shows
anyone.** It verifies its own prose and hides the verdict. It scores every article and stores no
reason. It detects that six sources carried a story and deletes the fact. The three strongest ideas
in the entire teardown, Readless's woven synthesis with citations, Feedly's inline enrichment, and
the universal citation-as-trust pattern, all point at the same underused asset.

Meanwhile the product carries the machinery of a business it has decided not to be in.

## If you only do three

1. **Put the Link Take in the edition** (§4). The most defensible thing in the codebase is visible
   on one dashboard page and absent from the product's only output. No new AI, no new model call,
   no new cost.
2. **Keep the corroboration count instead of discarding it** (§3.1A). The similarity computation
   already runs. Storing its result gives the editor and the reader "reported by 6 sources", which
   is Feedly's whole inline-enrichment pattern for a fraction of the work, and it is the first step
   toward real synthesis if that turns out to be wanted.
3. **Change the `Organization.plan` default from FREE to ENTERPRISE, and note the ladder dormant**
   (§5). The data half is already done: the one existing org is ENTERPRISE and nothing is gated off
   today. What is left is the default, because every org created through `/onboarding` currently
   lands on FREE with four features switched off, and the only reason that has never bitten is that
   nobody has created a second org.

Then, in order: the overlay detail with prev/next (§5b), Teams delivery (§3.1C, the Graph client
already exists), the Collect/Produce/Deliver nav with an Archive entry (§3.3), a relevance reason on
curated articles (§4), and the per-subscriber languages (§3.1D) this product has promised since the
schema was written.

Ask AI over the archive (§3.1B) is the most interesting thing on this page, and the one I would
schedule after those, because it is the only item needing a component the codebase does not have in
some form already.
