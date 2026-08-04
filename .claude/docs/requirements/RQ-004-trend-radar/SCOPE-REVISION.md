# RQ-004, scope revision: forward-only collection, focused topics

Decided 4 August 2026. Supersedes the backfill sections of `PLAN.md` and changes
the sequencing in `PLAN-REVIEW.md`.

**The decision.** No 12-month backfill of Hacker News or arXiv. Collection starts
today and runs forward. The watchlist is scoped to the topics this organization
actually follows, not a generic 60 to 80 entity map of the AI landscape.

This is cheaper, less legally exposed, and kinder to the two APIs. It also has one
consequence that has to be stated rather than discovered.

## The consequence: the radar measures nothing for about six weeks

The scoring compares the current week against a trailing baseline. The plan's own
validity gate requires at least six weeks of history before a score means anything,
and twelve before the baseline is full.

Starting today, with no history:

| Week | What the radar can say |
|---|---|
| 1 to 5 | Nothing. Counts with no baseline are not signals. |
| 6 | First scores, on a thin baseline. Treat as indicative. |
| 12 | Full baseline. The design works as intended from here. |

There is no way around this. A baseline is history, and history takes time when it
is not bought in advance. The decision is defensible: what it costs is three months
of patience, and what it buys is not scraping a year of someone else's archive.

## The larger consequence: the go/no-go gate cannot run before the build

`RQ-004_04` was to measure, retrospectively, whether upstream signals fire before
media coverage: median lead time at least 2 weeks, false positives at most 40%, on
a sample of at least 15 entities. Those thresholds were agreed. **The measurement
needed the backfilled history, and there is now none.**

So the protection against building something that does not work has moved from
before the build to three months after it. That inverts the risk, and the right
answer is to invert the build to match.

## Revised sequencing: collect now, build later

**Phase A, now.** Storage and collectors only.

- The entity model and the focused watchlist.
- The HN and arXiv collectors, forward-only, one day at a time.
- A daily schedule.
- Nothing else. No scoring, no stage classification, no snapshots, no API beyond
  what is needed to confirm rows are arriving, no UI, no report.

Cost, at roughly 20 entities: HN is 20 requests a day at one per second, arXiv is 20
at one per three seconds. Twenty and sixty seconds respectively, inside one cron
invocation with room to spare. Compare the original plan, where the arXiv backfill
alone was 960 requests and fifty minutes.

**Phase B, at about week 10 to 12.** Run the lead-time measurement against the
thresholds already agreed, using the history Phase A accumulated. Then decide.

- If it passes, build the scoring, the stages, the API, the UI and the report,
  knowing the premise holds.
- If it fails, the cost was one small collector and three months of a cron job, not
  eight sub-requirements of pipeline, screens and reports.

**What this changes about `RQ-004_02`, query validation.** It stays, and it comes
first, because a forward-only series poisoned by ambiguous queries cannot be
repaired later: there is no archive to re-query. Getting "MCP" wrong on day one
means the whole series is worthless at week 12. On backfilled data a bad query could
be fixed by re-running; here it cannot.

## The watchlist: what the topics actually are

The topics in use, from 167 articles the pipeline has categorised:

| Articles | Topic |
|---|---|
| 86 | AI Applications |
| 76 | AI Business |
| 60 | Large Language Models |
| 38 | AI Tools |
| 25 | AI Ethics |
| 18 | AI Research |
| 16 | AI Regulation |
| 10 | Cloud AI |
| 7 | Machine Learning |

Below that there is a tail of 23 more, and most of it is not topics: "2026",
"reporting", "display sizes", "Snapdragon 8 Elite chip", "Samsung Galaxy S25
release", "phone specifications". Those come from `categorizeArticle` inventing
categories instead of choosing from the list its prompt supplies, which is a defect
worth fixing on its own: the prompt offers a fixed list and the model is departing
from it.

**Two things follow.** The tail is excluded from the watchlist, and the categoriser
should be constrained before it pollutes further. A radar focused on topics cannot
be built on a topic field that accepts anything.

Note also that these are categories, not entities. The radar tracks entities:
"Model Context Protocol", not "AI Tools". The categories say which entities are
worth tracking; they are not themselves the watchlist.

## Open, and it blocks Phase A

**Which topics scope the watchlist?** My reading is the nine above, and my
recommendation is narrower still: the five that are both high-volume and specific
enough to yield entities, being Large Language Models, AI Tools, AI Research, Cloud
AI and AI Regulation. "AI Applications" and "AI Business" are the two largest and
the two least useful for choosing entities, because almost anything qualifies.

From those five, a watchlist of roughly 15 to 25 entities is the right size: enough
to see movement, small enough that every query can be validated by hand before a
single day of data is collected.
