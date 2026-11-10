import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTERS, type ChartFilters as Filters, type FacetCounts } from "@/features/telemetry/widgetFilters";
import ChartFilters from "./ChartFilters";
import { ZoneColorsProvider } from "@/features/zones/ZoneColorsContext";
import { ZONE_TOKENS } from "@/features/zones/zoneColors";

const facets: FacetCounts = {
  zones: [
    { id: "kitchen", name: "Kitchen", count: 2 },
    { id: "unassigned", name: "Unassigned", count: 1 },
  ],
  categories: [
    { id: "temperature", label: "TEMPERATURE", count: 2 },
    { id: "power", label: "POWER", count: 1 },
  ],
  kinds: [
    { id: "sensor", label: "SENSOR", count: 2 },
    { id: "actuator", label: "ACTUATOR", count: 1 },
  ],
};

function renderFilters(filters: Filters = EMPTY_FILTERS, shown = 3, total = 3) {
  const onChange = vi.fn();
  render(<ChartFilters filters={filters} onChange={onChange} facets={facets} shown={shown} total={total} />);
  return onChange;
}

// The filter modal is opened from the FILTERS button; its groups are only in the DOM while it is open.
function openModal() {
  fireEvent.click(screen.getByRole("button", { name: /^FILTERS/ }));
  return screen.getByRole("dialog", { name: "FILTERS" });
}

const group = (name: string) => screen.getByRole("group", { name });

describe("ChartFilters", () => {
  afterEach(cleanup);

  it("shows the counter and disables CLEAR when nothing is filtered", () => {
    renderFilters(EMPTY_FILTERS, 3, 3);
    expect(screen.getByRole("status", { name: "Devices shown" }).textContent).toBe("3 OF 3");
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

  it("shows the active filter count on the FILTERS button", () => {
    renderFilters({ ...EMPTY_FILTERS, zones: ["kitchen"], kinds: ["sensor"], visibility: "added" }, 1, 3);
    expect(screen.getByRole("button", { name: "FILTERS · 3" })).toBeTruthy();
  });

  it("opens the modal from FILTERS with aria-expanded and closes it with CLOSE", () => {
    renderFilters();
    const button = screen.getByRole("button", { name: "FILTERS" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    openModal();
    expect(screen.getByRole("button", { name: "FILTERS" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "CLOSE" }));
    expect(screen.queryByRole("dialog", { name: "FILTERS" })).toBeNull();
  });

  it("applies the modal draft on APPLY and drops it on CLOSE", () => {
    const onChange = renderFilters();
    const dialog = openModal();
    fireEvent.click(within(dialog).getByRole("button", { name: "POWER 1" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "CLOSE" }));
    expect(onChange).not.toHaveBeenCalled();

    openModal();
    fireEvent.click(screen.getByRole("button", { name: "POWER 1" }));
    fireEvent.click(screen.getByRole("button", { name: "APPLY" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, categories: ["power"] });
    expect(screen.queryByRole("dialog", { name: "FILTERS" })).toBeNull();
  });

  it("renders one zone pill per zone with its count and toggles membership in the draft", () => {
    const onChange = renderFilters({ ...EMPTY_FILTERS, zones: ["kitchen"] });
    openModal();
    const kitchen = within(group("Zones")).getByRole("button", { name: "KITCHEN 2" });
    expect(kitchen.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(kitchen);
    fireEvent.click(within(group("Zones")).getByRole("button", { name: "UNASSIGNED 1" }));
    fireEvent.click(screen.getByRole("button", { name: "APPLY" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, zones: ["unassigned"] });
  });

  it("renders field, kind and status pills; kind pills toggle membership (OR inside the group)", () => {
    const onChange = renderFilters({ ...EMPTY_FILTERS, kinds: ["sensor"] });
    openModal();
    expect(within(group("Fields")).getByRole("button", { name: "TEMPERATURE 2" })).toBeTruthy();
    const sensor = within(group("Kind")).getByRole("button", { name: "SENSOR 2" });
    expect(sensor.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(group("Kind")).getByRole("button", { name: "ACTUATOR 1" }));
    fireEvent.click(sensor);
    fireEvent.click(screen.getByRole("button", { name: "APPLY" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, kinds: ["actuator"] });
  });

  it("selects one status option at a time", () => {
    const onChange = renderFilters({ ...EMPTY_FILTERS, visibility: "added" });
    openModal();
    expect(within(group("Status")).getByRole("button", { name: "ADDED" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(group("Status")).getByRole("button", { name: "NOT ADDED" }));
    fireEvent.click(within(group("Status")).getByRole("button", { name: "ALL" }));
    fireEvent.click(within(group("Status")).getByRole("button", { name: "NOT ADDED" }));
    fireEvent.click(screen.getByRole("button", { name: "APPLY" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, visibility: "notAdded" });
  });

  it("renders no field pills when there are none", () => {
    render(
      <ChartFilters
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        facets={{ zones: [], categories: [], kinds: [] }}
        shown={0}
        total={0}
      />,
    );
    openModal();
    expect(within(group("Fields")).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("status", { name: "Devices shown" }).textContent).toBe("0 OF 0");
  });
});

// Feature 147: each zone pill shows the zone dot of the assigned token; the unassigned pill has no dot.
describe("ChartFilters zone pills (feature 147)", () => {
  it("shows the assigned zone dot before the zone name", () => {
    render(
      <ZoneColorsProvider areaIds={["kitchen", "office"]}>
        <ChartFilters filters={EMPTY_FILTERS} onChange={vi.fn()} facets={facets} shown={3} total={3} />
      </ZoneColorsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "FILTERS" }));
    const kitchen = screen.getByRole("button", { name: "KITCHEN 2" });
    expect(kitchen.querySelector("[data-zone-token]")?.getAttribute("data-zone-token")).toBe(ZONE_TOKENS[0]);
    expect(screen.getByRole("button", { name: "UNASSIGNED 1" }).querySelector("[data-zone-token]")).toBeNull();
  });
});
