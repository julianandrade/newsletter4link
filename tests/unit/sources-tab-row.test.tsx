import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SourcesTabRow } from "@/components/sources/sources-tabs";
import { SourcesAttention } from "@/components/sources/sources-attention";
import type { AttentionLine } from "@/lib/sources/summary";

/**
 * The tab row carries the counts an editor acts on, which is why Received has none: its
 * size is not a number anyone does anything about, and fetching it would cost a request
 * for decoration.
 *
 * `aria-controls` has to resolve to a real panel id. ChipGroup only emits it when given an
 * `idBase`, and the page passing none is the state this component exists to prevent.
 *
 * Plain DOM assertions throughout: this project has no jest-dom, and a matcher is not
 * worth a dependency.
 */
describe("SourcesTabRow", () => {
  it("shows a count for feeds, email and unmatched, and none for received", () => {
    render(
      <SourcesTabRow
        value="feeds"
        onChange={() => {}}
        counts={{ feeds: 434, email: 4, unmatched: 4 }}
      />
    );

    expect(screen.getByRole("tab", { name: /Feeds/ }).textContent).toContain("434");
    expect(screen.getByRole("tab", { name: /Email/ }).textContent).toContain("4");
    expect(screen.getByRole("tab", { name: /Received/ }).textContent ?? "").not.toMatch(
      /\d/
    );
  });

  it("points every tab at the panel id the page uses", () => {
    render(<SourcesTabRow value="feeds" onChange={() => {}} counts={{}} />);

    expect(
      screen.getByRole("tab", { name: /Feeds/ }).getAttribute("aria-controls")
    ).toBe("sources-panel-feeds");
    expect(screen.getByRole("tab", { name: /Feeds/ }).getAttribute("id")).toBe(
      "sources-tab-feeds"
    );
  });

  it("omits a count that is not known yet rather than printing zero", () => {
    render(
      <SourcesTabRow value="feeds" onChange={() => {}} counts={{ unmatched: null }} />
    );

    expect(screen.getByRole("tab", { name: /Unmatched/ }).textContent ?? "").not.toMatch(
      /\d/
    );
  });

  it("reports the chosen tab", () => {
    const onChange = vi.fn();
    render(<SourcesTabRow value="feeds" onChange={onChange} counts={{}} />);

    fireEvent.click(screen.getByRole("tab", { name: /Unmatched/ }));
    expect(onChange).toHaveBeenCalledWith("unmatched");
  });
});

/**
 * ChipGroup has rendered `role="tablist"` on ten screens without supporting a single key of
 * the pattern it claims. A tablist that cannot be arrowed through is a promise to a screen
 * reader that the keyboard then breaks.
 */
describe("SourcesTabRow keyboard", () => {
  it("keeps one tab in the tab order", () => {
    render(<SourcesTabRow value="email" onChange={() => {}} counts={{}} />);

    const reachable = screen.getAllByRole("tab").filter((tab) => tab.tabIndex === 0);
    expect(reachable).toHaveLength(1);
    expect(reachable[0].textContent).toContain("Email");
  });

  it("moves selection with Left and Right, and wraps", () => {
    const onChange = vi.fn();
    render(<SourcesTabRow value="feeds" onChange={onChange} counts={{}} />);

    fireEvent.keyDown(screen.getByRole("tab", { name: /Feeds/ }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("email");

    fireEvent.keyDown(screen.getByRole("tab", { name: /Feeds/ }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("received");
  });

  it("jumps to the ends with Home and End", () => {
    const onChange = vi.fn();
    render(<SourcesTabRow value="email" onChange={onChange} counts={{}} />);

    fireEvent.keyDown(screen.getByRole("tab", { name: /Email/ }), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("received");

    fireEvent.keyDown(screen.getByRole("tab", { name: /Email/ }), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("feeds");
  });

  it("leaves other keys to the browser, so Tab still leaves the row", () => {
    const onChange = vi.fn();
    render(<SourcesTabRow value="feeds" onChange={onChange} counts={{}} />);

    fireEvent.keyDown(screen.getByRole("tab", { name: /Feeds/ }), { key: "Tab" });
    fireEvent.keyDown(screen.getByRole("tab", { name: /Feeds/ }), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

const FEED_LINE: AttentionLine = {
  tone: "err",
  tab: "feeds",
  headline: "12 feeds failed on the last run.",
  detail: "The Information: 401 · and 11 more",
  jumpLabel: "Show feeds",
};

const EMAIL_LINE: AttentionLine = {
  tone: "warn",
  tab: "email",
  headline: "2 email sources have gone quiet.",
  detail: "Morning Brew IT has never received an email.",
  jumpLabel: "Show email",
};

describe("SourcesAttention", () => {
  it("renders nothing when nothing is flagged", () => {
    const { container } = render(<SourcesAttention lines={[]} onJump={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("carries both kinds in one box", () => {
    render(<SourcesAttention lines={[FEED_LINE, EMAIL_LINE]} onJump={() => {}} />);

    expect(screen.getByText(/12 feeds failed/)).toBeTruthy();
    expect(screen.getByText(/2 email sources have gone quiet/)).toBeTruthy();
  });

  it("jumps to the tab holding the problem", () => {
    const onJump = vi.fn();
    render(<SourcesAttention lines={[FEED_LINE, EMAIL_LINE]} onJump={onJump} />);

    fireEvent.click(screen.getByRole("button", { name: "Show email" }));
    expect(onJump).toHaveBeenCalledWith("email");
  });
});
