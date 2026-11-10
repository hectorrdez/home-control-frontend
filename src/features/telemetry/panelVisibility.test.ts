import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_PANEL_STATE,
  type PanelState,
  panelsSetting,
  gaugePanelId,
  hideNewBatteryGauges,
  isHidden,
  loadPanelState,
  parsePanelState,
  savePanelState,
  setPanelHidden,
} from "./panelVisibility";

const BATTERY = gaugePanelId("sensor.samsung_s24_battery_level");
const CACHE_KEY = "hc.setting.telemetry.panels";

afterEach(() => {
  window.localStorage.clear();
  panelsSetting.forget();
  vi.restoreAllMocks();
});

describe("panelVisibility", () => {
  it("shows everything by default", () => {
    expect(loadPanelState()).toEqual(EMPTY_PANEL_STATE);
    expect(isHidden("kpi:power", EMPTY_PANEL_STATE.hidden)).toBe(false);
  });

  it("hides a battery gauge the first time it is seen and records it as seen", () => {
    const state = hideNewBatteryGauges(EMPTY_PANEL_STATE, ["sensor.samsung_s24_battery_level"]);
    expect(isHidden(BATTERY, state.hidden)).toBe(true);
    expect(state.seen).toEqual([BATTERY]);
  });

  it("does not hide a battery gauge again once it has been seen", () => {
    const seenOnce = hideNewBatteryGauges(EMPTY_PANEL_STATE, ["sensor.samsung_s24_battery_level"]);
    const turnedOn = setPanelHidden(seenOnce, BATTERY, false);
    const again = hideNewBatteryGauges(turnedOn, ["sensor.samsung_s24_battery_level"]);
    expect(again).toBe(turnedOn);
    expect(isHidden(BATTERY, again.hidden)).toBe(false);
  });

  it("keeps a user toggle on across a reload", () => {
    const turnedOn = setPanelHidden(hideNewBatteryGauges(EMPTY_PANEL_STATE, ["sensor.samsung_s24_battery_level"]), BATTERY, false);
    savePanelState(turnedOn);
    const reloaded = hideNewBatteryGauges(loadPanelState(), ["sensor.samsung_s24_battery_level"]);
    expect(isHidden(BATTERY, reloaded.hidden)).toBe(false);
  });

  it("persists user hides under the versioned key", () => {
    savePanelState(setPanelHidden(EMPTY_PANEL_STATE, "kpi:nodes", true));
    const raw = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}").value;
    expect(raw).toEqual({ v: 1, hidden: ["kpi:nodes"], seen: [] });
    expect(loadPanelState().hidden).toEqual(["kpi:nodes"]);
  });

  it("falls back to the defaults for corrupt or unknown-version storage", () => {
    expect(parsePanelState("{not json")).toBeNull();
    expect(parsePanelState(JSON.stringify({ v: 2, hidden: [], seen: [] }))).toBeNull();
    expect(parsePanelState(JSON.stringify({ v: 1, hidden: [1], seen: [] }))).toBeNull();
    panelsSetting.forget();
    window.localStorage.setItem(CACHE_KEY, "{not json");
    expect(loadPanelState()).toEqual(EMPTY_PANEL_STATE);
  });

  // Feature 158: the legacy single climate panel hides both new cards; each card toggles on its own afterwards.
  it("a stored hidden history:climate hides both climate cards, and they toggle independently", () => {
    const parsed = parsePanelState(JSON.stringify({ v: 1, hidden: ["history:climate", "kpi:air"], seen: [] }));
    expect([...(parsed?.hidden ?? [])].sort()).toEqual(["history:climate-hum", "history:climate-temp", "kpi:air"]);
    const temp = setPanelHidden(parsed as PanelState, "history:climate-temp", false);
    expect(isHidden("history:climate-temp", temp.hidden)).toBe(false);
    expect(isHidden("history:climate-hum", temp.hidden)).toBe(true);
    expect(isHidden("history:climate", temp.hidden)).toBe(false);
  });

  it("works when storage throws on read and write", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadPanelState()).toEqual(EMPTY_PANEL_STATE);
    expect(() => savePanelState(setPanelHidden(EMPTY_PANEL_STATE, "kpi:air", true))).not.toThrow();
  });
});
