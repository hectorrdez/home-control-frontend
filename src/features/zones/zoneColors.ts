// Feature 130: stable per-zone color. Pure: no React, no DOM, no render-order or data dependency.
// Returns a token name without the `--color-` prefix (same convention as DESIGN.md / HouseScene's token()).

export const ZONE_TOKENS = [
  "zone-coral",
  "zone-amber",
  "zone-lime",
  "zone-green",
  "zone-cyan",
  "zone-blue",
  "zone-violet",
  "zone-pink",
] as const;

export type ZoneToken = (typeof ZONE_TOKENS)[number];

// djb2 over the UTF-16 code units of the area id. Chosen because it spreads the known mock areas
// (living_room, kitchen, bedroom, office) over distinct buckets of the 8-token palette.
function djb2(text: string): number {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(hash, 33) + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function zoneColorToken(areaId: string): ZoneToken {
  return ZONE_TOKENS[djb2(areaId) % ZONE_TOKENS.length];
}

// Feature 147: unique color per area. Sorted ids -> ZONE_TOKENS[index % 8]: up to 8 areas are all different,
// the same set gives the same result whatever the input order, and a 9th area wraps around.
export function assignZoneTokens(areaIds: readonly string[]): Map<string, ZoneToken> {
  const sorted = [...new Set(areaIds)].sort((a, b) => a.localeCompare(b));
  return new Map(sorted.map((id, index) => [id, ZONE_TOKENS[index % ZONE_TOKENS.length]]));
}
