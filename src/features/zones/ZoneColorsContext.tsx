import { createContext, useContext, useMemo, type ReactNode } from "react";
import { cssToken } from "@/features/telemetry/chartTokens";
import { UNASSIGNED } from "@/state/entities";
import { assignZoneTokens, zoneColorToken, type ZoneToken } from "./zoneColors";

// Feature 147: the zone color of an area is its assigned token (by position in the sorted list of all HA areas).
// Outside the provider, or for an area missing from that list, it falls back to the 130 hash.
const ZoneColorsContext = createContext<Map<string, ZoneToken> | null>(null);

const NO_ZONE = new Set<string>([UNASSIGNED, "unassigned"]);

export function ZoneColorsProvider({ areaIds, children }: { areaIds: readonly string[]; children: ReactNode }) {
  // Keyed on the sorted, de-duplicated ids: the same set in another order (or a new array) keeps the same map,
  // so the same resolver and the same colors. A changed set gives a new map (and the 3D scene is rebuilt).
  const key = useMemo(() => [...new Set(areaIds)].sort((a, b) => a.localeCompare(b)).join("\n"), [areaIds]);
  const assigned = useMemo(() => assignZoneTokens(key ? key.split("\n") : []), [key]);
  return <ZoneColorsContext.Provider value={assigned}>{children}</ZoneColorsContext.Provider>;
}

// Returns the token of an area, or null for an entity without area (neutral, no zone hue).
export function useZoneTokenResolver(): (areaId: string | null | undefined) => ZoneToken | null {
  const assigned = useContext(ZoneColorsContext);
  return useMemo(
    () => (areaId) => {
      if (!areaId || NO_ZONE.has(areaId)) return null;
      return assigned?.get(areaId) ?? zoneColorToken(areaId);
    },
    [assigned],
  );
}

export function useZoneToken(areaId: string | null | undefined): ZoneToken | null {
  return useZoneTokenResolver()(areaId);
}

// CSS color for a series or a stroke: the zone token, or the neutral on-surface-variant for no zone.
export function zoneStroke(token: ZoneToken | null): string {
  return token ? cssToken(token, "currentColor") : cssToken("on-surface-variant", "currentColor");
}
