# Clarifications: RQ-002

The AI model an organization selects must be the model that is actually used.

Answer inline under each question. Where the answer is already determinable from
the product's behaviour, it is recorded as **Determined** with the evidence, and
needs no decision. The **Open** ones change what gets built and cannot be
answered without you.

---

## Determined, no decision needed

### D1. Is the setting genuinely inert, or only sometimes ignored?

**Determined: genuinely inert.** The stored selection is read into the curation
run and then never passed to any AI call. Fifteen call sites across six areas
take the fixed value instead: article scoring and summarising, newsletter
drafting and its content planner, and the two web search steps. No AI call in
the product consults the organization's choice.

### D2. Does the run history reveal the problem?

**Determined: no, it conceals it.** The model recorded against each curation run
is written from the same fixed value as the work itself, so the record always
agrees with what happened and never with what was chosen. Reading the history
cannot surface the defect.

### D3. Are the neighbouring settings affected too?

**Determined: partly.**

| Setting | Behaviour today |
|---|---|
| Article age window | Honoured |
| Similarity threshold | Honoured |
| Brand voice | Honoured |
| Relevance threshold | Honoured on one path, ignored on two others |
| Embedding model | Stored, never used |
| AI model | Stored, never used |

The relevance threshold is the one worth noting: a single function reads the
brand voice from the organization's settings and, three lines earlier, reads the
threshold from the fixed configuration. So the two disagree inside the same
piece of work.

### D4. Does an invalid selection get refused?

**Determined: yes, since the version 5 update.** Submitting a model the product
does not offer is refused when it is saved. Before that change any string was
accepted and stored.

---

## Open, please decide

### Q1. Should one selection govern all AI work, or only curation?

The setting sits among the curation settings, which suggests curation. But the
same fixed model is also used for newsletter drafting and for the two web search
steps, and an administrator who picks the cheapest model to control cost will not
expect the most expensive work in the product to ignore it.

- **(a) All AI work.** One choice, applied everywhere. Simplest to explain, and
  matches how the setting reads. **Recommended.**
- **(b) Curation only.** Narrower change, but leaves drafting and search on a
  model nobody can influence, and the same defect stays open elsewhere.
- **(c) Separate choices per area.** Most control, most surface: three or four
  settings to explain, store and keep valid.

**Answer:**

### Q2. What should happen to organizations whose stored value is a retiring model?

Every organization currently runs on the code default whatever it stored. Once
the selection takes effect, each one moves to whatever is in its row. Some rows
may still hold `claude-sonnet-4-20250514`, which retires in June 2026. Honouring
that value is correct behaviour and also a downgrade nobody asked for.

- **(a) Honour what is stored, and warn in Settings when it is a retiring or
  retired model.** Truthful, and the administrator decides. **Recommended.**
- **(b) Migrate retiring values to the current equivalent on the way through,
  once, and say so in the release note.** Kinder, but changes a stored choice
  without being asked.
- **(c) Honour it silently.** Least work, and the quietest way to have an
  organization running on a retired model.

**Answer:**

### Q3. Is the embedding model in scope?

It has the identical defect: offered, stored, never used. Including it is a small
addition. Excluding it means shipping a fix for one inert setting while leaving
its neighbour inert.

- **(a) Include it.** **Recommended.**
- **(b) Separate requirement.**

**Answer:**

### Q4. Is the relevance threshold inconsistency in scope?

Same class of defect, and it has a sharper consequence than the model: identical
content can be kept or discarded depending on which path ran. It is three lines
to make consistent.

- **(a) Include it.** **Recommended:** it is the same defect and the same fix,
  and splitting it means touching the same function twice.
- **(b) Separate requirement**, on the grounds that it changes which articles
  are accepted and so deserves its own test evidence.

**Answer:**

### Q5. Should past run records be corrected?

Existing records name a model that may not be what performed the run. They
cannot be corrected reliably, because what actually ran is not recorded anywhere
else.

- **(a) Leave them, and note in the release that records before this change are
  not trustworthy on this field.** **Recommended.**
- **(b) Backfill from the code default of the time.** Guesswork presented as
  fact.

**Answer:**

### Q6. What should happen when the provider rejects the selected model?

A model can be withdrawn, or an account can lose access to it. The run then
fails on every article.

- **(a) Fail the run and report which model was refused.** No silent quality or
  cost change. **Recommended.**
- **(b) Fall back to the default and record that a fallback happened.** Keeps
  the newsletter moving; means a run can quietly cost more than expected.

**Answer:**

---

## What this unblocks

Q1, Q3 and Q4 set the scope, so the technical specification cannot be written
without them. Q2, Q5 and Q6 are behavioural and can be settled while the work is
underway, though Q2 affects what the Settings screen has to say.

If you would rather not spend time here: answering **(a)** to all six is
internally consistent and is what I would build.
