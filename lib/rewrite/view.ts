/**
 * RQ-006_03: what the screen shows, decided away from the screen.
 *
 * Pure, and here rather than in the component because this is the part of the detail
 * view worth testing and it needs no React, no network and no database.
 *
 * The distinction it exists for is "nothing was ever attempted" against "something was
 * attempted and refused". Both arrive from the API as `rewrite: null`, and the screen
 * must offer to write a piece in the first case and must not in the second.
 *
 * Rendering the body is not here. That is `lib/markdown/blocks.ts`, which knows nothing
 * about rewrites and should stay that way: the next feature that has to show
 * model-authored prose safely will want it too.
 */

export interface LinkTakeAttribution {
  publication: string;
  url: string;
  publishedAt: string;
  originalTitle: string;
}

/** The rewrite as the API serializes it, which is dates as strings. */
export interface ViewRewrite {
  id: string;
  title: string;
  body: string;
  language: string;
  inputMode: "FULL_TEXT" | "EXCERPT";
  generatedAt: string;
  model: string;
  checkSummary: string | null;
  longestSharedRun: number | null;
  wordCount: number | null;
}

export interface LinkTakePayload {
  /** Never optional. Rule 5: no surface renders the prose without the source. */
  attribution: LinkTakeAttribution;
  /** Only ever a piece that passed its checks. A refusal never arrives here. */
  rewrite: ViewRewrite | null;
  unavailableReason: string | null;
  stale: boolean;
  /** Whether anything has ever been attempted, passing or not. */
  attempted: boolean;
  summary: string | null;
}

export type LinkTakeState =
  | { kind: "ready"; rewrite: ViewRewrite }
  | { kind: "stale"; rewrite: ViewRewrite }
  | { kind: "absent" }
  | { kind: "refused"; reason: string };

/**
 * The state of the screen, from the payload alone.
 *
 * Loading and request failure are deliberately not states here. They belong to the
 * route component, and keeping them out is what lets this be a total function of the
 * payload with nothing mocked.
 */
export function resolveLinkTakeState(payload: LinkTakePayload): LinkTakeState {
  if (payload.rewrite) {
    return payload.stale
      ? { kind: "stale", rewrite: payload.rewrite }
      : { kind: "ready", rewrite: payload.rewrite };
  }

  // `attempted`, not the wording of the reason. The route's fallback sentence is a
  // sentence, and a screen that branched on it would break silently the day somebody
  // reworded it, by offering to write a piece that had already been refused.
  if (payload.attempted) {
    return {
      kind: "refused",
      reason:
        payload.unavailableReason ??
        "An attempt was made and produced nothing usable, and the reason was not recorded.",
    };
  }

  return { kind: "absent" };
}

export function formatInputMode(mode: ViewRewrite["inputMode"]): string {
  return mode === "FULL_TEXT" ? "full article text" : "feed excerpt only";
}

/** One past version, as the history endpoint serializes it. */
export interface RewriteHistoryEntry {
  id: string;
  status: "GENERATED" | "FAILED" | "STALE";
  checksPassed: boolean;
  checkSummary: string | null;
  longestSharedRun: number | null;
  wordCount: number | null;
  inputMode: ViewRewrite["inputMode"];
  model: string;
  generatedAt: string;
  error: string | null;
}

/**
 * The label required by the plan's rule 7, in the language of the prose.
 *
 * The dashboard chrome is English, as every other screen is. This label is not chrome:
 * it labels the generated prose, which is written in `OrgSettings.rewriteLanguage` and
 * is pt-PT by default. Rule 7 gives the Portuguese wording and allows the
 * "org-language equivalent", so the label follows the piece rather than the app, and it
 * comes from the rewrite's own `language` field rather than from a hardcoded guess.
 */
export function aiLabelFor(language: string): string {
  if (language.toLowerCase().startsWith("pt")) {
    return "Análise gerada por AI a partir da fonte original";
  }

  return "AI analysis generated from the original source";
}
