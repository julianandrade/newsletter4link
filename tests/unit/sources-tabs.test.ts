import { describe, expect, it } from "vitest";
import { resolveTab, SOURCES_TABS, TAB_LABELS } from "@/lib/sources/tabs";

/**
 * The tab is in the URL so the attention banner's jump and a bookmark both work.
 * A URL is typed by hand and pasted between environments, so an unknown value has to
 * resolve to a real tab: rendering no panel at all is how a shared link becomes a blank
 * screen.
 */
describe("resolveTab", () => {
  it("accepts every declared tab", () => {
    for (const tab of SOURCES_TABS) {
      expect(resolveTab(tab)).toBe(tab);
    }
  });

  it("falls back to feeds for an unknown value, null, or nothing", () => {
    expect(resolveTab("rss")).toBe("feeds");
    expect(resolveTab("")).toBe("feeds");
    expect(resolveTab(null)).toBe("feeds");
    expect(resolveTab(undefined)).toBe("feeds");
  });

  it("labels every tab, because a tab with no label cannot be rendered", () => {
    for (const tab of SOURCES_TABS) {
      expect(TAB_LABELS[tab]).toBeTruthy();
    }
  });
});
