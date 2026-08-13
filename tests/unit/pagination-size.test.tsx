import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Pagination } from "@/components/radar/controls";

/**
 * The size control is optional, because three screens already render this component and a
 * shared primitive that changes shape under everyone is how a "consistency" change becomes
 * three regressions.
 *
 * The state worth pinning is the one that reads backwards: a single page still shows the
 * control. Thirty rows at twenty-five per page is exactly when someone reaches for "show me
 * all of them", and the old early return would have hidden the control precisely there.
 */
describe("Pagination", () => {
  it("renders as before when handed no size control", () => {
    render(<Pagination page={1} totalPages={3} onPage={() => {}} />);

    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("renders nothing for a single page when there is no size control", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPage={() => {}} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("still renders the size control on a single page", () => {
    render(
      <Pagination
        page={1}
        totalPages={1}
        onPage={() => {}}
        pageSize={25}
        onPageSize={() => {}}
      />
    );

    expect(screen.getByRole("combobox", { name: "Rows per page" })).toBeTruthy();
    expect(screen.queryByText(/Page 1 of/)).toBeNull();
  });

  it("offers the three sizes and marks the current one", () => {
    render(
      <Pagination
        page={2}
        totalPages={9}
        onPage={() => {}}
        pageSize={50}
        onPageSize={() => {}}
      />
    );

    const select = screen.getByRole("combobox", { name: "Rows per page" });
    expect([...select.querySelectorAll("option")].map((o) => o.textContent)).toEqual([
      "25 per page",
      "50 per page",
      "100 per page",
    ]);
    expect((select as HTMLSelectElement).value).toBe("50");
  });

  it("reports a number, not the string the select hands back", () => {
    const onPageSize = vi.fn();
    render(
      <Pagination
        page={1}
        totalPages={9}
        onPage={() => {}}
        pageSize={50}
        onPageSize={onPageSize}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Rows per page" }), {
      target: { value: "100" },
    });

    expect(onPageSize).toHaveBeenCalledWith(100);
  });
});
