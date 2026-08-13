import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { usePageSize } from "@/components/radar/use-page-size";
import { pageSizeKey } from "@/lib/list-page-size";

/**
 * Storage is read through `useSyncExternalStore`, so the server and the first client render
 * agree by construction rather than by anyone remembering to keep the read in an effect.
 *
 * The first test is the one that matters: it server-renders the component while storage
 * holds a different size, and asserts the emitted markup carries the default. That is the
 * property behind the rule. This project has paid twice on the sources screen for renders
 * that disagreed across that boundary, and both times the symptom was a console error
 * nobody would have caught in a unit test asserting client behaviour alone.
 *
 * Tests that call the setter use their own list key: chosen sizes live in a module-level
 * map for the lifetime of the page, which is right in a browser and leaks between tests.
 */

/** Records the value of every render. */
function Probe({ list, seen }: { list: string; seen: number[] }) {
  const [size] = usePageSize(list);
  seen.push(size);
  return <span data-testid="size">{size}</span>;
}

/** Renders the size and a control that changes it, so no setter escapes during render. */
function Chooser({ list, to }: { list: string; to: 25 | 50 | 100 }) {
  const [size, choose] = usePageSize(list);
  return (
    <>
      <span data-testid="size">{size}</span>
      <button type="button" data-testid="choose" onClick={() => choose(to)}>
        choose
      </button>
    </>
  );
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("usePageSize", () => {
  it("server-renders the default even when storage holds another size", () => {
    window.localStorage.setItem(pageSizeKey("feeds"), "100");

    // The real assertion behind the hydration rule: what the server emits. React uses the
    // server snapshot here, so the markup the browser receives says 50 and hydration has
    // nothing to disagree about.
    const html = renderToString(<Probe list="feeds" seen={[]} />);

    expect(html).toContain(">50<");
    expect(html).not.toContain(">100<");
  });

  it("reads the stored size on the client", () => {
    window.localStorage.setItem(pageSizeKey("feeds"), "100");

    const seen: number[] = [];
    const { getByTestId } = render(<Probe list="feeds" seen={seen} />);

    expect(getByTestId("size").textContent).toBe("100");
  });

  it("stays on the default when nothing is stored", () => {
    const seen: number[] = [];
    const { getByTestId } = render(<Probe list="articles" seen={seen} />);

    expect(getByTestId("size").textContent).toBe("50");
  });

  it("clamps a junk stored value rather than trusting it", () => {
    window.localStorage.setItem(pageSizeKey("feeds"), "5000");

    const seen: number[] = [];
    const { getByTestId } = render(<Probe list="feeds" seen={seen} />);

    expect(getByTestId("size").textContent).toBe("50");
  });

  it("keeps each list's size apart", () => {
    window.localStorage.setItem(pageSizeKey("feeds"), "100");
    window.localStorage.setItem(pageSizeKey("articles"), "25");

    const feeds: number[] = [];
    const articles: number[] = [];
    // Scoped to each container: both renders share document.body, so the default
    // queries would answer from whichever mounted first.
    const a = render(<Probe list="feeds" seen={feeds} />);
    const b = render(<Probe list="articles" seen={articles} />);

    expect(a.container.querySelector("[data-testid=size]")?.textContent).toBe("100");
    expect(b.container.querySelector("[data-testid=size]")?.textContent).toBe("25");
  });

  it("writes the chosen size through the namespaced key", () => {
    const { getByTestId } = render(<Chooser list="writes" to={100} />);
    fireEvent.click(getByTestId("choose"));

    expect(getByTestId("size").textContent).toBe("100");
    expect(window.localStorage.getItem(pageSizeKey("writes"))).toBe("100");
  });

  it("survives storage that throws, which is Safari in private mode", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("access denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("access denied");
    });

    const { getByTestId } = render(<Chooser list="private-mode" to={25} />);
    expect(getByTestId("size").textContent).toBe("50");

    // The preference cannot be stored, but the control still has to work this session.
    fireEvent.click(getByTestId("choose"));
    expect(getByTestId("size").textContent).toBe("25");
  });
});
