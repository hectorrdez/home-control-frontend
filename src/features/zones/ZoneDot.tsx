import { zoneColorToken } from "./zoneColors";

// Feature 130: colored dot for a zone. Decorative (a11y-hidden): pair it with the zone name text.
export function ZoneDot({ areaId, className = "" }: { areaId: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-zone-token={zoneColorToken(areaId)}
      className={`inline-block size-2.5 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: `var(--color-${zoneColorToken(areaId)})` }}
    />
  );
}
