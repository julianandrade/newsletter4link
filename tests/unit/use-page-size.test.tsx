import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { usePageSize } from "@/components/radar/use-page-size";
import { pageSizeKey } from "@/lib/list-page-size";

/**
 * The stored size is read in an effect, never during render.
 *
 * Reading storage during render is a server/client branch: the server has no
 * `localStorage`, so it would emit 50 while the browser emits 100, and React reports the
 * difference as a hydration mismatch. This project has already paid for that twice on the
 * sources screen, both times through a subtree that rendered differently on the two sides.
 * The first client render therefore matches the server exactly, and the stored preference
 * arrives one render later.
 */

/** Records the value of every render, so the first one can be asserted separately. */
function Probe({ list, seen }: { list: string; seen: number[] }) {
  const [size] = usePageSize(list);
  seen.push(size);
  return <span data-testid="size">{size}</span>;
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("usePageSize", () => {
  it("renders the default first, then the stored size", () => {
    window.localStorage.setItem(pageSizeKey("feeds"), "100");

    const seen: number[] = [];
    const { getByTestId } = render(<Probe list="feeds" seen={seen} />);

    expect(seen[0]).toBe(50);
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
    let setSize: ((next: 25 | 50 | 100) => void) | null = null;

    function Setter() {
      const [size, set] = usePageSize("feeds");
      setSize = set;
      return <span data-testid="size">{size}</span>;
    }

    const { getByTestId } = render(<Setter />);
    act(() => setSize?.(100));

    expect(getByTestId("size").textContent).toBe("100");
    expect(window.localStorage.getItem(pageSizeKey("feeds"))).toBe("100");
  });

  it("survives storage that throws, which is Safari in private mode", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("access denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("access denied");
    });

    let setSize: ((next: 25 | 50 | 100) => void) | null = null;

    function Setter() {
      const [size, set] = usePageSize("feeds");
      setSize = set;
      return <span data-testid="size">{size}</span>;
    }

    const { getByTestId } = render(<Setter />);
    expect(getByTestId("size").textContent).toBe("50");

    // The preference cannot be stored, but the control still has to work this session.
    act(() => setSize?.(25));
    expect(getByTestId("size").textContent).toBe("25");
  });
});
