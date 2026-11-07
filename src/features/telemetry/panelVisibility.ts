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
export const historyPanelId = (history: "climate" | "power") => `history:${history}`;
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

// Corrupt JSON, unknown schema version or bad shape -> null (caller falls back to the defaults).
export function parsePanelState(raw: string | null): PanelState | null {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as { v?: unknown; hidden?: unknown; seen?: unknown };
    if (data.v !== SCHEMA_VERSION || !isStringArray(data.hidden) || !isStringArray(data.seen)) return null;
    return { hidden: data.hidden, seen: data.seen };
  } catch {
    return null;
  }
}

// Storage access can throw (private mode, blocked site data), so every access is guarded.
export function loadPanelState(): PanelState {
  try {
    return parsePanelState(window.localStorage.getItem(PANEL_STORAGE_KEY)) ?? EMPTY_PANEL_STATE;
  } catch {
    return EMPTY_PANEL_STATE;
  }
}

export function savePanelState(state: PanelState): void {
  try {
    window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ v: SCHEMA_VERSION, ...state }));
  } catch {
    // Storage unavailable: the choice still works for this session.
  }
}
