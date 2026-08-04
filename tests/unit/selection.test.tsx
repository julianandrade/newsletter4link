import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSelection } from "@/components/radar/selection";

const IDS = ["a", "b", "c", "d", "e", "f"];

/**
 * StrictMode double-invokes state updaters, which is exactly how the shift-click
 * range broke in the browser while passing every test here: the anchor was moved
 * inside an updater, so the second invocation saw it already moved and fell
 * through to a plain toggle. Every range test runs under StrictMode for that
 * reason. Next.js enables it in development.
 */
const strict = { wrapper: StrictMode } as const;

describe("useSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useSelection(IDS), strict);
    expect(result.current.count).toBe(0);
    expect(result.current.allSelected).toBe(false);
    expect(result.current.partiallySelected).toBe(false);
  });

  it("toggles one id on and off", () => {
    const { result } = renderHook(() => useSelection(IDS), strict);
    act(() => result.current.toggle("b"));
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.count).toBe(1);
    act(() => result.current.toggle("b"));
    expect(result.current.count).toBe(0);
  });

  it("reports a partial selection, which drives the mixed checkbox", () => {
    const { result } = renderHook(() => useSelection(IDS), strict);
    act(() => result.current.toggle("b"));
    expect(result.current.partiallySelected).toBe(true);
    expect(result.current.allSelected).toBe(false);
  });

  it("selects every visible id and reports allSelected", () => {
    const { result } = renderHook(() => useSelection(IDS), strict);
    act(() => result.current.selectAll());
    expect(result.current.count).toBe(IDS.length);
    expect(result.current.allSelected).toBe(true);
    expect(result.current.partiallySelected).toBe(false);
  });

  describe("shift-click ranges", () => {
    it("selects the whole span, both endpoints included", () => {
      // The bug this exists for: the range once stopped one short of the row
      // that was shift-clicked.
      const { result } = renderHook(() => useSelection(IDS), strict);
      act(() => result.current.toggle("b"));
      act(() => result.current.toggle("e", { shiftKey: true }));
      expect([...result.current.selected].sort()).toEqual(["b", "c", "d", "e"]);
    });

    it("works backwards as well as forwards", () => {
      const { result } = renderHook(() => useSelection(IDS), strict);
      act(() => result.current.toggle("e"));
      act(() => result.current.toggle("b", { shiftKey: true }));
      expect([...result.current.selected].sort()).toEqual(["b", "c", "d", "e"]);
    });

    it("deselects the span when the target was already selected", () => {
      const { result } = renderHook(() => useSelection(IDS), strict);
      act(() => result.current.selectAll());
      act(() => result.current.toggle("a"));
      // "a" is now off and is the anchor; shift-clicking "c" (still on) clears
      // a through c.
      act(() => result.current.toggle("c", { shiftKey: true }));
      expect(result.current.isSelected("b")).toBe(false);
      expect(result.current.isSelected("c")).toBe(false);
      expect(result.current.isSelected("d")).toBe(true);
    });

    it("behaves like a plain toggle with no anchor yet", () => {
      const { result } = renderHook(() => useSelection(IDS), strict);
      act(() => result.current.toggle("c", { shiftKey: true }));
      expect([...result.current.selected]).toEqual(["c"]);
    });

    it("moves the anchor to the last row touched", () => {
      const { result } = renderHook(() => useSelection(IDS), strict);
      act(() => result.current.toggle("a"));
      act(() => result.current.toggle("b", { shiftKey: true }));
      // Anchor is now "b", so this extends from b, not from a.
      act(() => result.current.toggle("d", { shiftKey: true }));
      expect([...result.current.selected].sort()).toEqual(["a", "b", "c", "d"]);
    });
  });

  describe("when the filter changes", () => {
    it("drops ids that are no longer visible", () => {
      // Selecting rows then filtering must never leave a hidden row armed for
      // a bulk delete.
      const { result, rerender } = renderHook(
        ({ ids }) => useSelection(ids),
        { ...strict, initialProps: { ids: IDS } }
      );
      act(() => result.current.selectAll());
      expect(result.current.count).toBe(6);

      rerender({ ids: ["a", "b"] });
      expect([...result.current.selected].sort()).toEqual(["a", "b"]);
      expect(result.current.allSelected).toBe(true);
    });

    it("keeps the selection when the same ids come back in a new array", () => {
      const { result, rerender } = renderHook(
        ({ ids }) => useSelection(ids),
        { ...strict, initialProps: { ids: IDS } }
      );
      act(() => result.current.toggle("c"));
      rerender({ ids: [...IDS] });
      expect(result.current.isSelected("c")).toBe(true);
    });

    it("clears completely when nothing matches", () => {
      const { result, rerender } = renderHook(
        ({ ids }) => useSelection(ids),
        { ...strict, initialProps: { ids: IDS } }
      );
      act(() => result.current.selectAll());
      rerender({ ids: [] });
      expect(result.current.count).toBe(0);
      // An empty list is not "all selected", or the header checkbox would show
      // ticked with nothing to act on.
      expect(result.current.allSelected).toBe(false);
    });
  });

  it("selectOnly replaces the whole selection", () => {
    const { result } = renderHook(() => useSelection(IDS), strict);
    act(() => result.current.selectAll());
    act(() => result.current.selectOnly(["b", "d"]));
    expect([...result.current.selected].sort()).toEqual(["b", "d"]);
  });

  it("clear empties it and forgets the anchor", () => {
    const { result } = renderHook(() => useSelection(IDS), strict);
    act(() => result.current.toggle("b"));
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
    // With the anchor forgotten, a shift-click is a plain toggle again.
    act(() => result.current.toggle("e", { shiftKey: true }));
    expect([...result.current.selected]).toEqual(["e"]);
  });

  it("clears on Escape", () => {
    const { result } = renderHook(() => useSelection(IDS), strict);
    act(() => result.current.toggle("b"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.count).toBe(0);
  });
});
