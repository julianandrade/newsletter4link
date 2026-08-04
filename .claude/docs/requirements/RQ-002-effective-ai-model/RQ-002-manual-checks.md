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
