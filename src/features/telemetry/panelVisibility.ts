import { createSyncedSetting, registerSyncedSetting, type SyncedSetting } from "@/features/settings/syncedSetting";

// Feature 125: show/hide the telemetry fixed panels (KPI cards, Levels gauges, climate/power history).
// Pure module, no React. The usePanelVisibility hook wraps it for the page and the CHARTS panel.

export const PANEL_STORAGE_KEY = "hc.telemetry.panels.v1";
const SCHEMA_VERSION = 1;

export interface PanelState {
  hidden: string[];
  // Battery gauges already seen once: they were hidden on first sight, so a later user "on" sticks.
  seen: string[];
}

export const EMPTY_PANEL_STATE: PanelState = { hidden: [], seen: [] };

export const kpiPanelId = (kpi: "climate" | "air" | "power" | "nodes") => `kpi:${kpi}`;
// Feature 158: the climate history is two cards; the old single id is only read by the migration below.
// Feature 159: history:climate-temp / history:climate-hum are no longer fixed-panel toggles. The page reads them
// (never writes) once, as the default visible flag of the climate widgets (widgets.ts) that do not exist yet.
export type HistoryPanel = "climate-temp" | "climate-hum" | "power";
export const historyPanelId = (history: HistoryPanel) => `history:${history}`;
const LEGACY_CLIMATE_ID = "history:climate";
export const gaugePanelId = (entityId: string) => `gauge:${entityId}`;

export function isHidden(id: string, hidden: readonly string[]): boolean {
  return hidden.includes(id);
}

// Hides every battery gauge never seen before and marks it seen. Returns the same object when nothing is new.
export function hideNewBatteryGauges(state: PanelState, batteryGaugeIds: readonly string[]): PanelState {
  const fresh = batteryGaugeIds.map(gaugePanelId).filter((id) => !state.seen.includes(id));
  if (fresh.length === 0) return state;
  return {
    hidden: [...new Set([...state.hidden, ...fresh])],
    seen: [...state.seen, ...fresh],
  };
}

export function setPanelHidden(state: PanelState, id: string, hidden: boolean): PanelState {
  const without = state.hidden.filter((x) => x !== id);
  return { ...state, hidden: hidden ? [...without, id] : without };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string");
}

// Feature 136: the stored value is the v1 object { v: 1, hidden, seen }; parse also takes the legacy localStorage JSON
// string. Corrupt JSON, unknown schema version or bad shape -> null (caller falls back to the defaults).
export type StoredPanels = PanelState & { v: typeof SCHEMA_VERSION };

export function parseStoredPanels(raw: unknown): StoredPanels | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object" || data === null) return null;
  const { v, hidden, seen } = data as { v?: unknown; hidden?: unknown; seen?: unknown };
  if (v !== SCHEMA_VERSION || !isStringArray(hidden) || !isStringArray(seen)) return null;
  return { v: SCHEMA_VERSION, hidden: migrateHidden(hidden), seen };
}

// Feature 158: a hidden legacy "history:climate" hides both climate cards; the old id is dropped on the next save.
export function migrateHidden(hidden: readonly string[]): string[] {
  if (!hidden.includes(LEGACY_CLIMATE_ID)) return [...hidden];
  const rest = hidden.filter((id) => id !== LEGACY_CLIMATE_ID);
  return [...new Set([...rest, historyPanelId("climate-temp"), historyPanelId("climate-hum")])];
}

export function parsePanelState(raw: string | null): PanelState | null {
  return raw === null ? null : parseStoredPanels(raw);
}

// Feature 136: the fixed-panel visibility is shared across devices (backend setting telemetry.panels, 134).
// PANEL_STORAGE_KEY is only the one-time import source.
export const panelsSetting = createSyncedSetting<StoredPanels>({
  key: "telemetry.panels",
  legacyKey: PANEL_STORAGE_KEY,
  parse: parseStoredPanels,
});
registerSyncedSetting(panelsSetting as SyncedSetting<unknown>);

export function loadPanelState(): PanelState {
  return panelsSetting.get() ?? EMPTY_PANEL_STATE;
}

export function savePanelState(state: PanelState): void {
  panelsSetting.set({ v: SCHEMA_VERSION, hidden: state.hidden, seen: state.seen });
}
