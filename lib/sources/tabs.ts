/**
 * The four things a sources screen shows, as one vocabulary.
 *
 * In the URL rather than in component state, so the attention banner can link to the tab
 * holding the problem and a bookmark survives a reload. Not four sidebar entries: RQ-005
 * AC-4.4 forbids two destinations for one list, and these are four views of one screen.
 */
export const SOURCES_TABS = ["feeds", "email", "unmatched", "received"] as const;

export type SourcesTab = (typeof SOURCES_TABS)[number];

export const TAB_LABELS: Record<SourcesTab, string> = {
  feeds: "Feeds",
  email: "Email",
  unmatched: "Unmatched",
  received: "Received",
};

/** Feeds is the fallback: an unknown value in the URL must still render a screen. */
export function resolveTab(raw: string | null | undefined): SourcesTab {
  return SOURCES_TABS.includes(raw as SourcesTab) ? (raw as SourcesTab) : "feeds";
}
