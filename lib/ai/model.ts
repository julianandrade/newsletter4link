/**
 * Which model an organization's AI work actually runs on.
 *
 * RQ-002: the model chosen in Settings was stored, shown back, and then ignored
 * by all fifteen AI call sites, which read a module constant instead. The
 * curation run record was written from that same constant, so the history agreed
 * with the mistake rather than exposing it.
 *
 * Resolved once per request at the route boundary and passed down explicitly.
 * An ambient store would hide which model a function is about to use and make
 * tests order-dependent; reading settings inside each AI function would turn one
 * database read per run into one per article.
 */

import { DEFAULT_AI_MODEL, DEFAULT_EMBEDDING_MODEL } from "@/lib/ai-models";
import { getSettings } from "@/lib/settings";

export interface ResolvedModels {
  model: string;
  embeddingModel: string;
}

export const FALLBACK_MODELS: ResolvedModels = {
  model: DEFAULT_AI_MODEL,
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
};

/**
 * The organization's selection, or the documented defaults.
 *
 * Never throws (BR-005): an unreadable settings row must not stop a curation
 * run, so a failure here falls back and is logged rather than propagated.
 */
export async function resolveAiModels(
  organizationId?: string | null
): Promise<ResolvedModels> {
  if (!organizationId) return { ...FALLBACK_MODELS };

  try {
    const settings = await getSettings(organizationId);
    return {
      model: settings.aiModel || DEFAULT_AI_MODEL,
      embeddingModel: settings.embeddingModel || DEFAULT_EMBEDDING_MODEL,
    };
  } catch (error) {
    console.error(
      "Could not read AI model settings, falling back to defaults:",
      error instanceof Error ? error.message : error
    );
    return { ...FALLBACK_MODELS };
  }
}

/**
 * A model the provider will not serve: withdrawn, misspelled, or not available
 * to this account.
 *
 * Q6 chose to fail the run rather than substitute another model, so this has to
 * be told apart from a timeout or a rate limit, which keep their existing
 * handling. Nothing here should treat a transient failure as a bad model, or one
 * slow response would take a whole run down.
 */
export function isModelRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    status?: number;
    error?: { type?: string; error?: { type?: string; message?: string } };
    message?: string;
  };

  const type =
    candidate.error?.error?.type ?? candidate.error?.type ?? undefined;
  const message =
    candidate.error?.error?.message ?? candidate.message ?? "";

  // The provider's answer for an unknown model id.
  if (type === "not_found_error") return true;

  // A 403 or 404 that names the model rather than the request.
  if (
    (candidate.status === 404 || candidate.status === 403) &&
    /model/i.test(message)
  ) {
    return true;
  }

  // A 400 that specifically faults the model field, as opposed to the prompt.
  if (
    candidate.status === 400 &&
    /model/i.test(message) &&
    /(not found|does not exist|invalid|unsupported|unknown)/i.test(message)
  ) {
    return true;
  }

  return false;
}

/**
 * Raised when the provider refuses the selected model. Carries the id so the
 * run record and the API response can name it (Q6).
 */
export class UnusableModelError extends Error {
  readonly model: string;

  constructor(model: string, cause?: unknown) {
    super(`Model "${model}" was refused by the provider`);
    this.name = "UnusableModelError";
    this.model = model;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Rethrow as UnusableModelError when the provider faulted the model. */
export function rethrowIfModelRejected(error: unknown, model: string): void {
  if (isModelRejection(error)) {
    throw new UnusableModelError(model, error);
  }
}

/**
 * Let a model rejection through, whether it arrived raw or already converted.
 *
 * The one to reach for in a catch that wraps another catch. `rethrowIfModelRejected` reads
 * the provider's own fields, and an `UnusableModelError` has none of them, so a nested catch
 * using it swallowed exactly the error it was added to let through. That is not theoretical:
 * the loop in `analyzeResults` did it, and the test for it failed before this existed.
 */
export function rethrowIfModelUnusable(error: unknown, model: string): void {
  if (error instanceof UnusableModelError) throw error;
  rethrowIfModelRejected(error, model);
}

/**
 * Run a model call, and let a refused model arrive as `UnusableModelError`.
 *
 * The wrapper exists because the alternative is remembering the two-line catch at every
 * call site, and eleven of them had forgotten it: `rethrowIfModelRejected` was imported by
 * four modules and called by none, so outside curation a withdrawn model surfaced as a raw
 * provider error, or as nothing at all where a catch degraded to a fallback.
 *
 * Anything that is not a model rejection is rethrown untouched, so a timeout or a rate
 * limit keeps whatever handling it already had. Q6: fail the run rather than substitute.
 */
export async function withModelRejection<T>(
  model: string,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    rethrowIfModelRejected(error, model);
    throw error;
  }
}

/**
 * What happened, and what to do about it, in one sentence.
 *
 * Here rather than at each surface because it is read by a person in four places now, the
 * curation job screen, two API responses and a progress stream, and four hand-written
 * copies of a sentence is three that will drift. Framework-free on purpose: the HTTP
 * shaping lives in `lib/ai/model-http.ts`.
 */
export function modelRejectionMessage(error: UnusableModelError): string {
  return `${error.message}. Choose a different model in Settings.`;
}
