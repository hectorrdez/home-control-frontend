export const SCENARIOS = [
  "default",
  "empty",
  "error",
  "slow",
  "action-error",
  "stream-drop",
  "offline",
  "unauthorized",
  "no-history",
  "alias-error", // feature 115: setAlias/deleteAlias reject aliases_write_failed
  "raw-names", // feature 115: adds the real HA names (siblings, ALL CAPS) so cleanup is visible
  "many-devices", // feature 120: 20 extra office lights so the device list overflows (119 scroll proof)
  "device-flap", // feature 126: the Desk plug device goes unavailable at 1.5 s and back at 4 s (row + feed live)
  "cover-calibration", // feature 127: adds a cover without current_position (calibrate, then set a percentage)
  "alerts", // feature 129: seeded MEDIUM/HIGH/LOW rules and three timed changes (1.5 s, 4 s, 6 s)
  "remote-change", // feature 132: 1 s after subscribe another device changes the Kitchen ceiling alias (138)
  "no-settings", // feature 133: settings list and get reject not_found (backend without 017)
  "remote-settings", // feature 133: 1 s after subscribe another device hides the first telemetry widget
] as const;

export type Scenario = (typeof SCENARIOS)[number];

// `?mock=` is read once at startup (mock mode only). Unknown values fall back to default.
export function parseScenario(search: string): Scenario {
  const value = new URLSearchParams(search).get("mock");
  return (SCENARIOS as readonly string[]).includes(value ?? "") ? (value as Scenario) : "default";
}

export function parseSeed(search: string, fallback = 1): number {
  const raw = new URLSearchParams(search).get("seed");
  const n = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
