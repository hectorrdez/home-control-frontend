import { act, renderHook } from "@testing-library/react";
import type { Setting } from "@/api/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeApi } from "@/api/HomeApi";
import { PANEL_STORAGE_KEY, gaugePanelId, panelsSetting } from "./panelVisibility";
import { usePanelVisibility } from "./usePanelVisibility";

// Feature 136: the fixed-panel visibility hook reads and writes the shared setting telemetry.panels.
const SETTING: Setting = { key: "telemetry.panels", value: null, version: 1, updatedAt: "2026-11-10T10:00:00Z", updatedBy: null };
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

function fakeApi(server: Setting | null) {
  const put = vi.fn(async (_k: string, value: unknown, _b?: number) => ({ ...SETTING, value, version: 2 }));
  const api = { getSetting: vi.fn(async () => server), putSetting: put } as unknown as HomeApi;
  return { api, put };
}

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

  it("a newly seen battery gauge is hidden and merged without removing remote ids", async () => {
    act(() => panelsSetting.set({ v: 1, hidden: [KPI_AIR], seen: [gaugePanelId("sensor.old_battery")] }));
    const { result } = renderHook(() => usePanelVisibility([NEW_BATTERY]));
    await act(() => panelsSetting.start(fakeApi(null).api));
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

  it("a battery gauge seen before the first sync settles does not pre-empt the legacy import", async () => {
    window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ v: 1, hidden: [KPI_AIR], seen: [] }));
    const { api, put } = fakeApi(null);
    const { result } = renderHook(() => usePanelVisibility([NEW_BATTERY]));
    // Before start(): the derived gauge state must not be written.
    expect(panelsSetting.get()).toBeNull();
    await act(() => panelsSetting.start(api));
    const first = put.mock.calls[0][1] as { hidden: string[] };
    expect(first.hidden).toContain(KPI_AIR);
    expect(result.current.isPanelHidden(KPI_AIR)).toBe(true);
    // The gauge is saved once settled, on top of the imported value.
    expect(panelsSetting.get()?.hidden).toEqual(expect.arrayContaining([KPI_AIR, gaugePanelId(NEW_BATTERY)]));
  });
});
