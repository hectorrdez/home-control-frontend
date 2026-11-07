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
