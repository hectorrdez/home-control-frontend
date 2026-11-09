import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gaugePanelId, panelsSetting } from "./panelVisibility";
import { usePanelVisibility } from "./usePanelVisibility";

// Feature 136: the fixed-panel visibility hook reads and writes the shared setting telemetry.panels.
const KPI_AIR = "kpi:air";
const NEW_BATTERY = "sensor.new_phone_battery_level";

beforeEach(() => {
  window.localStorage.clear();
  panelsSetting.forget();
});

afterEach(() => {
  vi.restoreAllMocks();
  panelsSetting.forget();
});

describe("usePanelVisibility (feature 136)", () => {
  it("a remote change re-renders the hook without a reload", () => {
    const { result } = renderHook(() => usePanelVisibility([]));
    expect(result.current.isPanelHidden(KPI_AIR)).toBe(false);
    act(() => panelsSetting.set({ v: 1, hidden: [KPI_AIR], seen: [] }));
    expect(result.current.isPanelHidden(KPI_AIR)).toBe(true);
  });

  it("does not write back a remote value it only applies", () => {
    act(() => panelsSetting.set({ v: 1, hidden: [KPI_AIR], seen: [] }));
    const set = vi.spyOn(panelsSetting, "set");
    const { rerender } = renderHook(() => usePanelVisibility([]));
    rerender();
    expect(set).not.toHaveBeenCalled();
  });

  it("a newly seen battery gauge is hidden and merged without removing remote ids", () => {
    act(() => panelsSetting.set({ v: 1, hidden: [KPI_AIR], seen: [gaugePanelId("sensor.old_battery")] }));
    const { result } = renderHook(() => usePanelVisibility([NEW_BATTERY]));
    const newGauge = gaugePanelId(NEW_BATTERY);
    expect(result.current.isPanelHidden(newGauge)).toBe(true);
    expect(result.current.isPanelHidden(KPI_AIR)).toBe(true);
    const stored = panelsSetting.get();
    expect(stored?.hidden).toEqual(expect.arrayContaining([KPI_AIR, newGauge]));
    expect(stored?.seen).toEqual(expect.arrayContaining([gaugePanelId("sensor.old_battery"), newGauge]));
  });

  it("setPanelVisible saves the change", () => {
    const { result } = renderHook(() => usePanelVisibility([]));
    act(() => result.current.setPanelVisible(KPI_AIR, true));
    expect(panelsSetting.get()?.hidden).not.toContain(KPI_AIR);
    act(() => result.current.setPanelVisible(KPI_AIR, false));
    expect(result.current.isPanelHidden(KPI_AIR)).toBe(true);
  });
});
