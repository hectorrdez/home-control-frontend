import { useZoneToken } from "./ZoneColorsContext";
import type { ZoneToken } from "./zoneColors";

// Feature 130: colored dot for a zone. Decorative (a11y-hidden): pair it with the zone name text.
// Feature 147: the color is the area's assigned token; `token` overrides it (a card passes the token it paints with).
// An entity without area (null token) gets no dot.
export function ZoneDot({ areaId, token, className = "" }: { areaId?: string | null; token?: ZoneToken | null; className?: string }) {
  const fromArea = useZoneToken(areaId);
  const resolved = token === undefined ? fromArea : token;
  if (!resolved) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="zone-dot"
      data-zone-token={resolved}
      className={`inline-block size-2.5 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: `var(--color-${resolved})` }}
    />
  );
}
