# Technical specification: RQ-002

The AI model an organization selects must be the model that is actually used.

> **Note on the flow.** AIDLC splits this into a backend and a frontend tech
> spec. This project has no such split: a feature touches a route handler and a
> screen as one unit of work, as recorded in [docs/AIDLC.md](../../../../docs/AIDLC.md).
> This is the single spec for both.

## Scope, from the answered clarifications

All six answered **(a)**:

| # | Decision |
|---|---|
| Q1 | One selection governs every AI call: curation, generation, search |
| Q2 | Honour the stored value, warn in Settings when it names a retiring or retired model |
| Q3 | The embedding model is in scope |
| Q4 | The relevance threshold inconsistency is in scope |
| Q5 | Past run records are left alone |
| Q6 | A provider rejection fails the run and names the model |

## Current state

`getSettings(organizationId)` returns the organization's `aiModel`,
`embeddingModel` and thresholds. The curation pipeline loads it and honours
`articleMaxAgeDays`, `vectorSimilarityThreshold` and `brandVoicePrompt`. It does
not pass `aiModel` anywhere, and no other area loads settings at all.

Fifteen call sites read the module constant `config.ai.anthropic.model`:

| File | Sites | Reached from |
|---|---|---|
| `lib/ai/claude.ts` | 3 | curation |
| `lib/generation/generator.ts` | 5 | `POST /api/generate` |
| `lib/generation/content-planner.ts` | 1 | generation |
| `lib/search/query-processor.ts` | 1 | `POST /api/search` |
| `lib/search/result-analyzer.ts` | 4 | search |
| `lib/curation/curator.ts` | 1 | the run record |

Neither the search nor the generation modules take an `organizationId`, so
nothing below their entry points can resolve a preference today.

## Design

**An explicit parameter, resolved once per request at the route boundary.**

Rejected alternatives: an ambient store (`AsyncLocalStorage`) hides which model
a function will use and makes tests order-dependent; reading settings inside each
AI function turns one database read per run into one per article.

### New module: `lib/ai/model.ts`

```
resolveAiModels(organizationId?): Promise<{ model, embeddingModel }>
```

Reads the organization's settings, falls back to `DEFAULT_AI_MODEL` and
`DEFAULT_EMBEDDING_MODEL`, and never throws: an unreadable settings row must not
stop a run (BR-005).

```
class UnusableModelError extends Error { model: string }
isModelRejection(error): boolean
```

`isModelRejection` recognises the provider's answer for a model that does not
exist or that the account may not use (`not_found_error`, and 403/404 with a
model reference). Everything else stays a transient error and keeps its current
handling.

### Signature changes

Each AI function gains a trailing optional `model?: string`, matching the
existing convention of a trailing optional `brandVoicePrompt`. Omitted, it
resolves to `DEFAULT_AI_MODEL`, so nothing breaks while the callers are updated.

- `scoreArticleRelevance`, `summarizeArticle`, `categorizeArticle`,
  `scoreArticlesBatch`
- `processQuery`, `analyzeResult`, `analyzeResults`, `batchAnalyzeResults`
- `planNewsletter`, `generateNewsletter`, `regenerateSubjectLines`,
  `quickGenerateNewsletter`
- `generateEmbedding` and its callers gain `embeddingModel?: string`

### Error handling

Today every AI function swallows failures and returns a default: score 5, an
empty summary, no categories. For a rejected model that is the silent
substitution Q6 rules out. Each catch block gains:

```
if (isModelRejection(error)) throw new UnusableModelError(model)
```

`runCurationPipeline` and `runCurationPipelineWithStreaming` let it propagate,
mark the job `FAILED`, and record `Model "<id>" was refused by the provider`.
The generation and search routes return 502 with the same message. Transient
failures keep today's behaviour, so one flaky call still does not fail a run.

### The relevance threshold

Three sites read `config.curation.relevanceThreshold` instead of the loaded
setting:

- `curator.ts:85`, in `runCurationPipeline`, which does not load settings at all:
  it must, the same way the streaming variant does.
- `curator.ts:503` and `:520`, in `curateArticle`, which already has `settings`
  in scope and reads `settings.brandVoicePrompt` three lines earlier.

### The run record

`curator.ts:209` writes `aiModel: config.ai.anthropic.model`. It becomes the
model that was resolved for the run, so the record states what performed the work
(BR-003).

### Settings screen

`AI_MODELS` and `LEGACY_AI_MODELS` already separate current from older ids. When
the stored value is in `LEGACY_AI_MODELS`, the screen shows a warning naming the
model and the fact that it is superseded, next to the select rather than as a
toast, so it is visible without an interaction (Q2).

## Files to change

| File | Change |
|---|---|
| `lib/ai/model.ts` | New: resolver, `UnusableModelError`, `isModelRejection` |
| `lib/ai/claude.ts` | 3 sites take the parameter, catches detect rejection |
| `lib/ai/embeddings.ts` | Takes the embedding model |
| `lib/curation/curator.ts` | Resolve once per run, pass down, fix 3 threshold sites, record the effective model, load settings in `runCurationPipeline` |
| `lib/generation/generator.ts` | 5 sites, entry points take the model |
| `lib/generation/content-planner.ts` | 1 site |
| `lib/search/query-processor.ts` | 1 site |
| `lib/search/result-analyzer.ts` | 4 sites |
| `app/api/generate/route.ts` | Resolve and pass, map rejection to 502 |
| `app/api/search/route.ts` | Resolve and pass, map rejection to 502 |
| `app/dashboard/settings/page.tsx` | Warn on a superseded stored value |

## Test plan

Unit, in `tests/unit/ai-model.test.ts`:

1. `resolveAiModels` returns the organization's stored ids.
2. It falls back to the defaults when no settings row exists.
3. It falls back rather than throwing when the read fails.
4. `isModelRejection` is true for a provider not-found and false for a timeout,
   a rate limit and a 500.
5. `UnusableModelError` carries the model id it was refused for.
6. Every AI function defaults to `DEFAULT_AI_MODEL` when the parameter is
   omitted, so an un-updated caller cannot silently reach a different model.

Behavioural, not automated here because both need a live provider: a run with a
valid non-default model reaches the provider as that model, and a run with a
withdrawn model fails the job with the model named. Both are recorded as manual
checks in this folder.

## Out of scope

- Correcting historical run records (Q5).
- Per-area model selection (Q1 chose one global selection).
- Any change to which models are offered.
