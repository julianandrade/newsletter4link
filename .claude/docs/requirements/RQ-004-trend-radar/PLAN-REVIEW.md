# Review of the Trend Radar v1 implementation plan

Reviewed against the repository as it stands at commit `184c095`.

The plan is good: the diagnosis is right (the current radar measures the media
echo and cannot lead it), the phase order is right, the decision to keep
`computeTrends` as the MEDIA layer is right, and it reuses the existing
`BackgroundJob` machinery rather than inventing a queue.

What follows is what will break, in severity order, and what the requirement is
missing. Seven findings; the first three would produce a radar that looks like it
works and is wrong, which is worse than one that visibly fails.

---

## F1. Entity query precision is the make-or-break, and the plan treats it as a detail

The plan resolves entities by `name` and `aliases` and then searches upstream
sources with `entity.hnQuery ?? entity.name`. For the entities that matter most,
that query is mostly noise:

- `"MCP"` on Hacker News returns Minecraft Coder Pack, Master Control Program,
  managed care, and Microsoft Certified Professional threads.
- `all:"MCP"` on arXiv matches monotone comparative programming, Markov chain
  papers, and multi-chip packages.
- `"Claude"` matches a common given name. `"Gemini"` matches the constellation,
  the crypto exchange, and Apollo. `"Grok"` is a verb.
- GitHub `q=Mistral` matches unrelated repositories named after the wind.

A wrong count does not announce itself. It flows into a z-score, becomes an
"acceleration", and the flagship view confidently reports a trend that is an
artefact of ambiguity. Every downstream statistic inherits it.

**What the requirement needs:** query precision as an explicit, measured
deliverable, not a field on a model. Concretely:

- Each entity carries a per-source query it was **validated** with, not a name
  reused as a query.
- A validation artefact per entity: sample N hits for the query, count how many
  actually refer to the entity, record the precision. Anything below a threshold
  is either requeried or deactivated.
- Prefer unambiguous queries even at the cost of recall: `"Model Context
  Protocol" OR modelcontextprotocol` beats `MCP`. A radar that under-counts
  consistently still detects acceleration, because acceleration is relative to
  the entity's own baseline. A radar that intermittently captures noise does not.

This is the single highest-value change to the plan and it should gate Phase 2.

## F2. The unique constraint does not do what the plan believes

```prisma
@@unique([entityId, source, date, organizationId])
```

`organizationId` is nullable, and upstream points are specified as
`organizationId = null`. In Postgres, **NULLs are distinct in a unique index**, so
this constraint does not prevent duplicate global points. Every re-run of a
backfill inserts a second row for the same entity, source and day. The plan's own
acceptance criterion, "re-run produces zero duplicate rows", fails silently, and
the sums that feed the scorer double.

Three ways out, in order of preference:

1. A sentinel instead of null: `organizationId` non-null, with a reserved value
   such as `"global"` for upstream sources. Ugly, works everywhere, keeps one
   table.
2. Two tables: `GlobalSignalPoint` and `OrgSignalPoint`. Honest about the fact
   that these are different things with different lifecycles, and the queries
   stay simple.
3. `NULLS NOT DISTINCT` on the index. Postgres 15+ only; needs raw SQL in a
   migration because Prisma does not express it.

I would take (2). The plan already says upstream and MEDIA differ in scope,
lifecycle and ownership; two tables says so in the schema instead of in a comment.

## F3. The z-score degenerates precisely where the plan needs it most

`z = (currentWeek - mean) / max(stddev, 1)`, on a trailing 12-week baseline.

For arXiv, the plan itself notes volume per entity is low, and stores weekly
points. A typical series is `0,1,0,0,2,0,1,0,0,0,1,0`. Then the standard deviation is about 0.6, the floor of
1 applies, and `z = currentWeek - mean`. That is a raw count minus a small constant.
It is not a z-score, it does not mean "standard deviations from normal", and it is
not comparable to the HN z computed on a series of hundreds.

The composite then takes a weighted mean of numbers on incompatible scales and
calls it acceleration.

Counts are not normally distributed. For low-count series the right instrument is
a rate comparison, not a distance in standard deviations:

- A Poisson rate-ratio test between the current window and the baseline window,
  reporting the ratio and a significance, or
- A variance-stabilising transform (Anscombe: `2 * sqrt(x + 3/8)`) before computing
  the z, which makes the statistic behave on counts, or
- The simplest defensible option: keep the z for high-volume sources, and for
  low-volume sources report "first appearance" and "N-week high" as discrete
  events rather than a continuous score.

Whichever is chosen, the requirement must state that per-source scores are only
combined when they are on the same scale, and the standard deviation floor must be documented as
what it is: a guard that changes the meaning of the statistic when it engages.

## F4. Mixed daily and weekly points in one column, with no marker

Backfill stores weekly totals "as the Monday's point"; incremental collection
stores daily values. Both land in `SignalPoint.value` with a `date`. Nothing
distinguishes them.

Any aggregation over a range that spans the boundary between backfilled and
incremental data mixes weekly totals with daily values and produces a number that
means nothing. The transition week is worst: partly a Monday-stamped weekly total,
partly seven daily rows.

**Fix:** a `granularity` field (`DAY` | `WEEK`) on the point, and a documented
rule for the boundary, or normalise everything to weekly on write. Normalising on
write is simpler and the scorer works weekly anyway.

## F5. The GitHub cron does not fit, by arithmetic

The plan says shard by source into four cron entries before reaching for a queue.
For GitHub that is not enough:

- 80 entities × 2 search queries (repositories + issues) = 160 requests.
- Authenticated Search API: 30 requests per minute.
- 160 ÷ 30 = 5.3 minutes = **320 seconds**, against a `maxDuration` of 300 that
  this repo already sets on every cron route, and which the comment in
  `app/api/curation/collect/route.ts` notes only works on Pro at all.

That is before retries, and GitHub applies a secondary rate limit to search that
can throttle further. Options: split GitHub across two cron entries by entity
half, drop the issues query, or accept every-other-day collection for GitHub.
Also worth knowing: `total_count` on the Search API is documented as
**approximate** for large result sets, so it is a weaker signal than the plan's
weight of 1.0 implies.

Sanity check on the others, since the plan does not do the arithmetic: HN at 1
req/s for 80 entities is 80s, fine. arXiv at 1 req/3s is 240s, which fits with
20 seconds of headroom for 80 entities and no retries. Add entities and arXiv
breaks first.

## F6. Nothing tests the premise

The stated goal is to lead the media. None of the four acceptance criteria test
whether it does. They test that data is present, that a flag can be true, that
snapshots are written, and that a cron completes. All four could pass on a radar
with no predictive value at all.

**The backfill makes the premise testable retrospectively, and that is the most
valuable thing in this plan.** With 12 months of upstream history and the existing
article archive:

- Take entities that clearly broke into the org's media coverage during the
  window.
- For each, find the first week the upstream signal would have fired.
- Report the lead time distribution: median weeks of warning, and the false
  positive rate (upstream fires, media never follows).

If the median lead is a week and the false positive rate is 80%, the feature does
not work and should not ship, however elegant the pipeline. That is worth knowing
before Phase 3, not after. This belongs in the requirement as a **go/no-go gate**,
with a stated threshold agreed in advance.

## F7. Global entities carry one organization's interests into another's radar

The plan says, correctly, that entities are public data and should not be
tenant-scoped. But entity **creation** is driven by extraction over a specific
organization's articles. So a niche entity that only Org A follows is created
globally and appears in Org B's entity list and rankings.

That is probably fine, and may even be desirable, but it is a decision with a
consequence and the plan does not name it. If it is not wanted, the fix is that
extraction proposes entities and an approval step promotes them to global. State
which it is.

---

## What the requirement is missing, beyond the findings

1. **A definition of success that is not "the pipeline runs".** F6.
2. **Query precision as a deliverable.** F1.
3. **A statement of what happens when a source is missing at launch.** GitHub
   stars have no backfill path, so at launch the GITHUB weight of 1.0 rests on
   mentions alone. Either the weights are staged over time or that is documented.
4. **Cost.** Entity extraction adds a Claude call per article, on top of scoring,
   summarising and categorising. That is a fourth call per article, and the
   backfill runs it over the whole archive. The requirement should carry an
   estimate and a per-run cap. RQ-002 made the model configurable, so extraction
   should use the cheapest acceptable model rather than the org's default.
5. **What happens to `computeTrends`.** The plan keeps it behind `?mode=topics`
   until the newsletter migrates, which is right, but no criterion says when it is
   removed. Otherwise both live forever and diverge.

## How to structure it as requirements

One requirement cannot hold this: four phases, a schema change, four collectors,
a scoring model, a UI change and a report. Per the `validate-requirement` skill it
fails "bounded" and "testable as one thing". Split it, with the folder structure
that skill prescribes:

| Requirement | Scope | Gate to the next |
|---|---|---|
| `RQ-004_01` | Schema, entity model, extraction, MEDIA backfill | Entities resolve with measured precision |
| `RQ-004_02` | Query validation for the seed watchlist | Precision threshold met per source, or entity deactivated |
| `RQ-004_03` | HN and arXiv collectors and backfill | 12 months loaded, idempotent re-run proven |
| `RQ-004_04` | Retrospective validation of the premise | **Go/no-go**: median lead time and false positive rate against agreed thresholds |
| `RQ-004_05` | Scoring, stages, API, snapshots | Parity with the old topic mode confirmed |
| `RQ-004_06` | GitHub and PyPI collectors | Fits the cron budget |
| `RQ-004_07` | UI adaptation | The flagship view is reachable and correct |
| `RQ-004_08` | Monthly report | Generates from snapshots without touching live tables |

The important change from the plan's sequencing: **`RQ-004_02` and `RQ-004_04`
are new, and both are gates.** The plan goes straight from collectors to scoring
to UI. Inserting query validation before the collectors, and premise validation
before the scoring, is what stops this becoming a well-built instrument that
measures the wrong thing.

`RQ-004_06` moves after the scoring work rather than before, because GitHub and
PyPI are the two weakest signals (approximate counts, no backfill for stars, only
a subset of entities have a package) and the radar should be proven on the two
good ones first.
