import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTERS, type ChartFilters as Filters, type FacetCounts } from "@/features/telemetry/widgetFilters";
import ChartFilters from "./ChartFilters";

const facets: FacetCounts = {
  zones: [
    { id: "kitchen", name: "Kitchen", count: 2 },
    { id: "unassigned", name: "Unassigned", count: 1 },
  ],
  categories: [
    { id: "temperature", label: "TEMPERATURE", count: 2 },
    { id: "power", label: "POWER", count: 1 },
  ],
};

function renderFilters(filters: Filters = EMPTY_FILTERS, shown = 3, total = 3) {
  const onChange = vi.fn();
  render(<ChartFilters filters={filters} onChange={onChange} facets={facets} shown={shown} total={total} />);
  return onChange;
}

const group = (name: string) => screen.getByRole("group", { name });

describe("ChartFilters", () => {
  afterEach(cleanup);

  it("shows the counter and disables CLEAR when nothing is filtered", () => {
    renderFilters(EMPTY_FILTERS, 3, 3);
    expect(screen.getByRole("status", { name: "Charts shown" }).textContent).toBe("3 OF 3");
    expect(screen.getByRole("button", { name: "CLEAR" }).hasAttribute("disabled")).toBe(true);
  });

  it("emits a query change from the search box", () => {
    const onChange = renderFilters();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search charts" }), { target: { value: "kit" } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, query: "kit" });
  });

  it("enables CLEAR when filtered and resets to the empty filters", () => {
    const filters: Filters = { ...EMPTY_FILTERS, query: "kit" };
    const onChange = renderFilters(filters, 1, 3);
    const clear = screen.getByRole("button", { name: "CLEAR" });
    expect(clear.hasAttribute("disabled")).toBe(false);
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });

  it("renders one zone pill per zone with its count and toggles membership", () => {
    const onChange = renderFilters({ ...EMPTY_FILTERS, zones: ["kitchen"] });
    const kitchen = within(group("Zones")).getByRole("button", { name: "KITCHEN 2" });
    expect(kitchen.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(kitchen);
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, zones: [] });

    fireEvent.click(within(group("Zones")).getByRole("button", { name: "UNASSIGNED 1" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, zones: ["kitchen", "unassigned"] });
  });

  it("renders category pills and toggles membership", () => {
    const onChange = renderFilters({ ...EMPTY_FILTERS, categories: ["power"] });
    const power = within(group("Categories")).getByRole("button", { name: "POWER 1" });
    expect(power.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(power);
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, categories: [] });

    fireEvent.click(within(group("Categories")).getByRole("button", { name: "TEMPERATURE 2" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, categories: ["power", "temperature"] });
  });

  it("selects one visibility option at a time", () => {
    const onChange = renderFilters({ ...EMPTY_FILTERS, visibility: "on" });
    expect(within(group("Visibility")).getByRole("button", { name: "ON" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(group("Visibility")).getByRole("button", { name: "OFF" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, visibility: "off" });
    fireEvent.click(within(group("Visibility")).getByRole("button", { name: "ALL" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, visibility: "all" });
  });

  it("renders no category pills when there are none", () => {
    render(
      <ChartFilters
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        facets={{ zones: [], categories: [] }}
        shown={0}
        total={0}
      />,
    );
    expect(within(group("Categories")).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("status", { name: "Charts shown" }).textContent).toBe("0 OF 0");
  });
});
