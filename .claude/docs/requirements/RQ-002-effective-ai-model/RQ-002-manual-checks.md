# Manual checks: RQ-002

Two behaviours cannot be proven without a live provider and a real curation run,
so they are recorded here rather than asserted in the suite. Both are cheap.

## MC-1: the selected model is the model that runs

1. Settings → AI → set **Scoring and writing** to a model other than the current
   default, for example Claude Haiku 4.5. Save.
2. Start a curation run from Curation jobs.
3. Open the run and read its log. The entry **"Effective settings for this run"**
   must name the model you selected.
4. Optional, from the provider side: the Anthropic console usage for that period
   should attribute the calls to the selected model.

**Expected:** the log names the selected model, not `claude-sonnet-5`.

**Before this change** there was no such log entry at all, and the run used the
code default whatever Settings said. This step is the confirmation that the
requirement is met.

## MC-2: a model the provider refuses fails the run and names it

The product refuses unknown ids when they are saved, so this needs a model that
is valid but unavailable to the account, or a temporary edit to the stored value.

1. Store a model id the account cannot use. Either pick one from the "Earlier
   models" group that has since been retired, or set the row directly:
   `update "OrgSettings" set "aiModel" = 'claude-3-opus-20240229' where ...`
2. Start a curation run.

**Expected:** the job goes to **FAILED**, and the message reads
`Model "claude-3-opus-20240229" was refused by the provider. Choose a different
model in Settings.` The run must not fall back to another model, and must not
report hundreds of per-article errors.

3. Restore the previous value in Settings.

## Not checked here

- **Embedding model.** Covered by the same mechanism and the unit tests, but a
  visible behaviour change needs a model with different dimensions, which would
  invalidate stored vectors. Not worth doing on the production database.
- **Search and drafting.** They resolve through the same function as curation and
  are covered by the unit tests. Neither logs its effective model, since neither
  has a run record to log into; that is the open half of Q7.

---

## Evidence recorded 4 August 2026

Both checks were run against the live Anthropic API, at the provider boundary
rather than through the dashboard, since the UI loop needs an authenticated
session. This covers the part that was actually uncertain: the error shapes in
`isModelRejection` were inferred from documentation, not observed.

### MC-2, verified

A call with `claude-3-opus-20240229`, a model this account cannot serve, returned:

```
status: 404
body:   {"type":"error","error":{"type":"not_found_error","message":"model: claude-3-opus-20240229"}}
```

`isModelRejection` returned **true**, and `rethrowIfModelRejected` produced
`UnusableModelError: Model "claude-3-opus-20240229" was refused by the provider`.

The inferred shape was right, including the nesting: the useful `not_found_error`
sits at `error.error.type`, while `error.type` is only `"error"`. Code that read
the outer field alone would have missed it.

### MC-1, verified

Requested `claude-haiku-4-5`, which is not the default (`claude-sonnet-5`). The
provider reported serving `claude-haiku-4-5-20251001`. Cost: 14 input and 4
output tokens.

A non-default model therefore reaches the provider as that model.

### Still open

The full loop through the interface, Settings → save → run curation → read the
job log, needs a signed-in session and a real curation run. Steps 1 to 3 of MC-1
above remain the way to confirm it, and it is the last thing between this
requirement and done.
