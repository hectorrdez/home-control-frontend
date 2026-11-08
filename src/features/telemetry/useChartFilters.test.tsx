import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useChartFilters } from "./useChartFilters";
import { EMPTY_FILTERS, filtersSetting, type StoredFilters } from "./widgetFilters";

const ZONES = new Set(["kitchen", "office"]);
const stored = (over: Partial<StoredFilters>): StoredFilters => ({ v: 1, query: "", zones: [], categories: [], visibility: "all", ...over });

beforeEach(() => {
  window.localStorage.clear();
  filtersSetting.forget();
});

afterEach(() => cleanup());

describe("useChartFilters", () => {
  it("restores the saved filters on mount", () => {
    filtersSetting.set(stored({ query: "kitchen", zones: ["kitchen"] }));
    const { result } = renderHook(() => useChartFilters(ZONES));
    expect(result.current.filters).toEqual({ ...EMPTY_FILTERS, query: "kitchen", zones: ["kitchen"] });
  });

  it("starts empty when nothing is saved", () => {
    const { result } = renderHook(() => useChartFilters(ZONES));
    expect(result.current.filters).toEqual(EMPTY_FILTERS);
  });

  it("saves a user change through the setting", () => {
    const { result } = renderHook(() => useChartFilters(ZONES));
    act(() => result.current.change({ ...EMPTY_FILTERS, categories: ["co2"] }));
    expect(result.current.filters.categories).toEqual(["co2"]);
    expect(filtersSetting.get()).toEqual(stored({ categories: ["co2"] }));
  });

  it("applies a remote change live", () => {
    const { result } = renderHook(() => useChartFilters(ZONES));
    act(() => filtersSetting.set(stored({ visibility: "off" })));
    expect(result.current.filters.visibility).toBe("off");
  });

  it("holds a remote change while the search has focus and applies it on blur", () => {
    const { result } = renderHook(() => useChartFilters(ZONES));
    act(() => result.current.onSearchFocusChange(true));
    act(() => filtersSetting.set(stored({ query: "remote" })));
    expect(result.current.filters.query).toBe("");
    act(() => result.current.onSearchFocusChange(false));
    expect(result.current.filters.query).toBe("remote");
  });

  it("ignores zone ids that are not on screen, and keeps them stored until the next change", () => {
    filtersSetting.set(stored({ zones: ["kitchen", "deleted"] }));
    const { result } = renderHook(() => useChartFilters(ZONES));
    expect(result.current.filters.zones).toEqual(["kitchen"]);
    expect(filtersSetting.get()?.zones).toEqual(["kitchen", "deleted"]);
    act(() => result.current.change({ ...result.current.filters, visibility: "on" }));
    expect(filtersSetting.get()?.zones).toEqual(["kitchen"]);
  });
});
