/**
 * The model choices offered anywhere in the product.
 *
 * Kept in its own module with no server imports, so the settings screen (a
 * client component) and the server-side settings helpers read the same list
 * instead of drifting apart, which is how a retired model ends up shipping as
 * the default.
 */

export interface ModelOption {
  value: string;
  label: string;
}

/** Current models. Note there is no Haiku 5: 4.5 is the current Haiku. */
export const AI_MODELS: ModelOption[] = [
  { value: "claude-opus-5", label: "Claude Opus 5, most capable" },
  { value: "claude-sonnet-5", label: "Claude Sonnet 5, recommended" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5, fastest and cheapest" },
];

/**
 * Still selectable, because an organization may already have one stored and a
 * select must never silently jump a saved value to a different model.
 */
export const LEGACY_AI_MODELS: ModelOption[] = [
  { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (retires June 2026)" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4 (retires June 2026)" },
  { value: "claude-3-5-haiku-20241022", label: "Claude Haiku 3.5 (retired)" },
];

/** The default for new organizations and for curation when nothing is stored. */
export const DEFAULT_AI_MODEL = "claude-sonnet-5";

/**
 * Whether a model thinks when the request does not say otherwise.
 *
 * The 5-family models run adaptive thinking when the `thinking` field is absent; every
 * model before them ran without it. That difference is why the email extractor lost two
 * newsletters on 6 August 2026: `max_tokens` caps thinking and reply together, and on a
 * large prompt the thinking consumed the whole allowance before a character was emitted.
 *
 * A call that wants no thinking has to say so, and only on the models where saying so is
 * meaningful.
 */
export function thinksByDefault(model: string): boolean {
  return /^claude-(opus|sonnet|fable|mythos)-5(\b|-)/.test(model);
}

/**
 * Whether `output_config.effort` is accepted.
 *
 * Not universal, and getting it wrong is a 400 rather than a degraded answer: effort
 * errors on Haiku 4.5, which this product offers as the cheap option, and on the Claude 4
 * models still selectable for organizations that stored one.
 */
export function supportsEffort(model: string): boolean {
  return /^claude-(opus|sonnet|fable|mythos)-5(\b|-)/.test(model) ||
    /^claude-opus-4-(6|7|8)(\b|-)/.test(model) ||
    /^claude-sonnet-4-6(\b|-)/.test(model);
}

/**
 * The request fields that keep a short structured-output call inside its budget.
 *
 * Extraction is not a reasoning task: it reads a newsletter and lists what it points at.
 * Thinking on that spends the token allowance without improving the answer, and on a
 * 32000-character prompt it spends all of it. Turned off where that is expressible, with
 * the lowest effort where effort exists.
 *
 * Returns an empty object for models that never thought by default, so nothing is sent to
 * a model that would reject it.
 */
export function structuredOutputTuning(model: string): Record<string, unknown> {
  if (!thinksByDefault(model)) return {};

  const tuning: Record<string, unknown> = { thinking: { type: "disabled" } };

  // Opus 5 accepts disabled thinking only at effort `high` or below, and `low` is what a
  // extraction wants anyway, so the two constraints agree.
  if (supportsEffort(model)) tuning.output_config = { effort: "low" };

  return tuning;
}

export const EMBEDDING_MODELS: ModelOption[] = [
  { value: "text-embedding-ada-002", label: "Ada 002, recommended" },
  { value: "text-embedding-3-small", label: "Embedding 3 Small" },
  { value: "text-embedding-3-large", label: "Embedding 3 Large" },
];

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-ada-002";
