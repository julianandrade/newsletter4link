/**
 * What a settings save is allowed to change, and what it is allowed to be.
 *
 * Extracted from `PUT /api/settings`, which had grown fourteen inline branches of
 * validation that nothing could test without a session and a database. The same shape as
 * `lib/editions/patch-input.ts` and `lib/asides/input.ts`: a pure function from an unknown
 * body to either an update object or one sentence saying why not.
 *
 * The allowlist is the security property, not a convenience. `updateOrgSettings` passes
 * whatever it is given straight to Prisma, so a field absent from here cannot be written by
 * a request at all, which is what keeps `PUT /api/settings` from being a general-purpose
 * write into OrgSettings.
 */

import { AI_MODELS, LEGACY_AI_MODELS, EMBEDDING_MODELS } from "@/lib/ai-models";
import {
  MAX_ORG_CONTEXT_CHARS,
  MAX_RELEVANCE_HEADING_CHARS,
  REWRITE_LANGUAGES,
} from "@/lib/rewrite/config";

/** The cap that was already enforced inline, kept at the value it had. */
export const MAX_BRAND_VOICE_CHARS = 500;

export type SettingsPatch =
  | { ok: true; updates: Record<string, unknown> }
  | { ok: false; error: string };

interface Bounds {
  key: string;
  min: number;
  max: number;
}

const NUMBERS: Bounds[] = [
  { key: "relevanceThreshold", min: 0, max: 10 },
  { key: "maxArticlesPerEdition", min: 1, max: 100 },
  { key: "vectorSimilarityThreshold", min: 0, max: 1 },
  { key: "articleMaxAgeDays", min: 1, max: 365 },
];

/** Free text that may be cleared, with the cap it is held to. */
const TEXT: Array<{ key: string; max?: number }> = [
  { key: "brandVoicePrompt", max: MAX_BRAND_VOICE_CHARS },
  /**
   * RQ-006: the organization's own description, which grounds every relevance section.
   *
   * Editable here since 11 August 2026. It was read by `lib/rewrite/pipeline.ts` from the
   * day it was added and was absent from this allowlist, so the one field the requirement
   * says must never be hardcoded could only be changed with SQL.
   */
  { key: "orgContextPrompt", max: MAX_ORG_CONTEXT_CHARS },
  { key: "logoUrl" },
  { key: "bannerUrl" },
  { key: "primaryColor" },
  { key: "fromName" },
  { key: "replyToEmail" },
  { key: "theme" },
];

const CHOICES: Array<{ key: string; allowed: readonly string[]; label: string }> = [
  {
    key: "aiModel",
    // Restricted to the ids the product offers: an arbitrary string here would be stored
    // happily and then fail on every curation run.
    allowed: [...AI_MODELS, ...LEGACY_AI_MODELS].map((model) => model.value),
    label: "aiModel",
  },
  {
    key: "embeddingModel",
    allowed: EMBEDDING_MODELS.map((model) => model.value),
    label: "embeddingModel",
  },
  {
    key: "rewriteLanguage",
    allowed: REWRITE_LANGUAGES.map((language) => language.value),
    label: "rewriteLanguage",
  },
];

export function parseSettingsPatch(body: unknown): SettingsPatch {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "The request body must be an object." };
  }

  const input = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  for (const bounds of NUMBERS) {
    const value = input[bounds.key];
    if (typeof value !== "number") continue;

    // NaN fails both comparisons, so it is rejected here rather than stored: parseFloat on
    // an emptied number field is where it comes from.
    if (Number.isNaN(value) || value < bounds.min || value > bounds.max) {
      return {
        ok: false,
        error: `${bounds.key} must be between ${bounds.min} and ${bounds.max}`,
      };
    }

    updates[bounds.key] = value;
  }

  for (const field of TEXT) {
    const value = input[field.key];
    if (typeof value !== "string" && value !== null) continue;

    if (typeof value === "string" && field.max && value.length > field.max) {
      return {
        ok: false,
        error: `${field.key} must be ${field.max} characters or less`,
      };
    }

    // An emptied field means cleared, which the column allows. `|| null` rather than a
    // trim-and-check, because that is the behaviour these fields already had.
    updates[field.key] = value || null;
  }

  for (const choice of CHOICES) {
    const value = input[choice.key];
    if (typeof value !== "string") continue;

    if (!choice.allowed.includes(value)) {
      return { ok: false, error: `Unknown ${choice.label}` };
    }

    updates[choice.key] = value;
  }

  /**
   * The relevance heading, which is the one text field that cannot be cleared.
   *
   * The column is not nullable and it is rendered as a section heading in the prose, so an
   * empty string would produce a piece with a blank heading in it rather than fall back to
   * anything. Refused with a sentence instead, and the screen keeps what it had.
   */
  if (typeof input.relevanceHeading === "string") {
    const heading = input.relevanceHeading.trim();

    if (heading.length === 0) {
      return {
        ok: false,
        error:
          "The relevance heading cannot be empty: it is rendered as a heading inside the prose.",
      };
    }

    if (heading.length > MAX_RELEVANCE_HEADING_CHARS) {
      return {
        ok: false,
        error: `relevanceHeading must be ${MAX_RELEVANCE_HEADING_CHARS} characters or less`,
      };
    }

    updates.relevanceHeading = heading;
  }

  return { ok: true, updates };
}
