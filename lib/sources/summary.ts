import { healthWarning, sourceHealth } from "@/lib/inbound/health";
import type { SourcesTab } from "@/lib/sources/tabs";

/**
 * What `/api/rss-sources` returns, both kinds in one payload.
 *
 * One row type rather than two, because the route does not split them and this module is
 * what splits them. The email-only fields are optional for the same reason.
 */
export interface SourceRow {
  id: string;
  name: string;
  category: string;
  active: boolean;
  type?: string;
  url?: string;
  lastFetchedAt: string | null;
  lastError: string | null;
  createdAt: string;
  senderAddress?: string | null;
  inboundTag?: string | null;
  parseMode?: "DIGEST" | "ESSAY" | null;
  expectedCadenceDays?: number | null;
  lastReceivedAt?: string | null;
}

export function splitSources(rows: SourceRow[]): {
  feeds: SourceRow[];
  emailSources: SourceRow[];
} {
  const feeds: SourceRow[] = [];
  const emailSources: SourceRow[] = [];

  for (const row of rows) {
    if (row.type === "EMAIL") emailSources.push(row);
    else feeds.push(row);
  }

  return { feeds, emailSources };
}

export interface AttentionLine {
  tone: "err" | "warn";
  /** Where the jump goes. */
  tab: SourcesTab;
  headline: string;
  detail: string;
  jumpLabel: string;
}

/** Two names, then a count. Four error strings in one line is not a line anyone reads. */
function nameTwoThenCount(details: string[]): string {
  const shown = details.slice(0, 2).join(" · ");
  const rest = details.length - 2;
  return rest > 0 ? `${shown} · and ${rest} more` : shown;
}

/**
 * What needs attention, each kind judged by its own measure.
 *
 * A feed announces its failure and `lastError` carries it. An email source can only fail
 * silently, so `healthWarning` is the authority and this function adds no second opinion:
 * a source with no declared cadence is not flagged, because silence cannot be judged
 * against a cadence nobody set.
 *
 * A paused source is skipped in both cases. Nothing is fetching a paused feed, so its
 * `lastError` is a fact about the past, and flagging it trains people to ignore the flag.
 */
export function sourceAttention({
  feeds,
  emailSources,
  now,
}: {
  feeds: SourceRow[];
  emailSources: SourceRow[];
  now: Date;
}): { lines: AttentionLine[]; count: number } {
  const lines: AttentionLine[] = [];

  const failing = feeds.filter((feed) => feed.active && Boolean(feed.lastError));
  if (failing.length > 0) {
    lines.push({
      tone: "err",
      tab: "feeds",
      headline: `${failing.length} ${
        failing.length === 1 ? "feed" : "feeds"
      } failed on the last run.`,
      detail: nameTwoThenCount(failing.map((feed) => `${feed.name}: ${feed.lastError}`)),
      jumpLabel: "Show feeds",
    });
  }

  const quiet = emailSources
    .filter((source) => source.active)
    .map((source) =>
      healthWarning(
        sourceHealth(
          {
            lastReceivedAt: source.lastReceivedAt ?? null,
            expectedCadenceDays: source.expectedCadenceDays ?? null,
            createdAt: source.createdAt,
          },
          now
        ),
        source.name
      )
    )
    .filter((line): line is string => line !== null);

  if (quiet.length > 0) {
    lines.push({
      tone: "warn",
      tab: "email",
      headline: `${quiet.length} email ${
        quiet.length === 1 ? "source has" : "sources have"
      } gone quiet.`,
      detail: nameTwoThenCount(quiet),
      jumpLabel: "Show email",
    });
  }

  return { lines, count: failing.length + quiet.length };
}

/** `num` is rendered inside `<Num>`, so the figures keep the mono face. */
export interface HeadingPart {
  num?: string;
  text: string;
}

/**
 * The heading, covering both kinds of source.
 *
 * "Nothing flagged" and never "all healthy". An email source has no feed URL and never
 * reports a fetch error, so a claim of health asserts something nothing measured; a claim
 * that no rule fired is true of both kinds. The count is the honest part, so it leads.
 */
export function sourcesHeading({
  feeds,
  emailSources,
  attentionCount,
  isLoading,
  lastCollectedLabel,
}: {
  feeds: SourceRow[];
  emailSources: SourceRow[];
  attentionCount: number;
  isLoading: boolean;
  lastCollectedLabel?: string | null;
}): { title: string; subtitle: HeadingPart[] } {
  if (isLoading) return { title: "Sources", subtitle: [] };

  const total = feeds.length + emailSources.length;
  const noun = total === 1 ? "source" : "sources";
  const title =
    attentionCount > 0
      ? `${total} ${noun}, ${attentionCount} ${
          attentionCount === 1 ? "needs" : "need"
        } attention`
      : `${total} ${noun}, nothing flagged`;

  const subtitle: HeadingPart[] = [
    { num: String(feeds.length), text: feeds.length === 1 ? "feed" : "feeds" },
    { num: String(emailSources.length), text: "email" },
  ];

  if (lastCollectedLabel) {
    subtitle.push({ text: `last collected ${lastCollectedLabel}` });
  }

  return { title, subtitle };
}
