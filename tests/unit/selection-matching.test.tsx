import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useSelection, type Selection } from "@/components/radar/selection";

/**
 * A selection used to mean one thing: the rows on screen. It now means one of two things,
 * and which one is explicit, opt-in, and visible in the bulk bar.
 *
 * The rule that makes the second mode safe is the last test here. Matching mode is a claim
 * about a filter, so when the filter changes the claim expires: staying in matching mode
 * across a filter change would let an action hit a set nobody can see any more, which is
 * the failure this whole contract exists to prevent.
 */

function harness(
  ids: string[],
  options?: Parameters<typeof useSelection>[1]
): { current: Selection; rerender: (nextIds: string[]) => void } {
  const box = {} as { current: Selection; rerender: (nextIds: string[]) => void };

  function Probe({ visible }: { visible: string[] }) {
    box.current = useSelection(visible, options);
    return null;
  }

  const view = render(<Probe visible={ids} />);
  box.rerender = (nextIds: string[]) => {
    act(() => {
      view.rerender(<Probe visible={nextIds} />);
    });
  };

  return box;
}

const PAGE = ["a", "b", "c"];

describe("useSelection, page mode", () => {
  it("still means the rows on screen when given no matching total", () => {
    const s = harness(PAGE);

    expect(s.current.mode).toBe("page");
    expect(s.current.canSelectMatching).toBe(false);

    act(() => s.current.selectAll());
    expect(s.current.count).toBe(3);
  });

  it("offers nothing more when the filter matches only what is shown", () => {
    const s = harness(PAGE, { matchingTotal: 3 });
    expect(s.current.canSelectMatching).toBe(false);
  });

  it("offers the second step when the filter matches more than the page", () => {
    const s = harness(PAGE, {
      matchingTotal: 434,
      resolveMatchingIds: vi.fn().mockResolvedValue([]),
    });
    expect(s.current.canSelectMatching).toBe(true);
  });

  it("offers nothing when there is no way to resolve the set", () => {
    // Deliberate: a control that cannot work is worse than no control, so the second step
    // is not offered at all when the host supplied no resolver.
    const s = harness(PAGE, { matchingTotal: 434 });
    expect(s.current.canSelectMatching).toBe(false);
  });
});

describe("useSelection, matching mode", () => {
  it("reports the matching total as the count", () => {
    const s = harness(PAGE, {
      matchingTotal: 434,
      resolveMatchingIds: vi.fn().mockResolvedValue([]),
    });

    act(() => s.current.selectAllMatching());

    expect(s.current.mode).toBe("matching");
    expect(s.current.count).toBe(434);
    expect(s.current.allSelected).toBe(true);
  });

  it("resolves to the ids the host supplies, not to the page", async () => {
    const every = Array.from({ length: 434 }, (_, i) => `id-${i}`);
    const resolveMatchingIds = vi.fn().mockResolvedValue(every);
    const s = harness(PAGE, { matchingTotal: 434, resolveMatchingIds });

    act(() => s.current.selectAllMatching());
    const ids = await s.current.idsForAction();

    expect(resolveMatchingIds).toHaveBeenCalledOnce();
    expect(ids).toHaveLength(434);
    expect(ids[0]).toBe("id-0");
  });

  it("returns the explicit selection in page mode without asking the host", async () => {
    const resolveMatchingIds = vi.fn().mockResolvedValue(["never"]);
    const s = harness(PAGE, { matchingTotal: 434, resolveMatchingIds });

    act(() => s.current.toggle("b"));
    const ids = await s.current.idsForAction();

    expect(ids).toEqual(["b"]);
    expect(resolveMatchingIds).not.toHaveBeenCalled();
  });

  it("propagates a failed resolve so the caller can abort the action", async () => {
    const resolveMatchingIds = vi.fn().mockRejectedValue(new Error("network"));
    const s = harness(PAGE, { matchingTotal: 434, resolveMatchingIds });

    act(() => s.current.selectAllMatching());

    await expect(s.current.idsForAction()).rejects.toThrow("network");
  });

  it("refuses matching mode when the host offered no resolver", () => {
    const s = harness(PAGE, { matchingTotal: 434 });

    act(() => s.current.selectAllMatching());

    // Nothing could resolve it, so the claim is never made in the first place.
    expect(s.current.mode).toBe("page");
  });

  it("drops back to page mode when the rows change, because the filter moved", () => {
    const resolveMatchingIds = vi.fn().mockResolvedValue([]);
    const s = harness(PAGE, { matchingTotal: 434, resolveMatchingIds });

    act(() => s.current.selectAllMatching());
    expect(s.current.mode).toBe("matching");

    s.rerender(["x", "y"]);

    expect(s.current.mode).toBe("page");
    expect(s.current.count).toBe(0);
  });

  it("clear leaves matching mode", () => {
    const resolveMatchingIds = vi.fn().mockResolvedValue([]);
    const s = harness(PAGE, { matchingTotal: 434, resolveMatchingIds });

    act(() => s.current.selectAllMatching());
    act(() => s.current.clear());

    expect(s.current.mode).toBe("page");
    expect(s.current.count).toBe(0);
  });
});
