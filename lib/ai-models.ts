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

export const EMBEDDING_MODELS: ModelOption[] = [
  { value: "text-embedding-ada-002", label: "Ada 002, recommended" },
  { value: "text-embedding-3-small", label: "Embedding 3 Small" },
  { value: "text-embedding-3-large", label: "Embedding 3 Large" },
];

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-ada-002";
