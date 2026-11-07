import { describe, expect, it } from "vitest";
import { ZONE_TOKENS, zoneColorToken } from "./zoneColors";

const MOCK_AREAS = ["living_room", "kitchen", "bedroom", "office"];

describe("zoneColorToken", () => {
  it("is deterministic: the same area id always maps to the same token", () => {
    for (const id of MOCK_AREAS) {
      expect(zoneColorToken(id)).toBe(zoneColorToken(id));
    }
  });

  it("gives every known mock area a distinct token", () => {
    const tokens = MOCK_AREAS.map(zoneColorToken);
    expect(new Set(tokens).size).toBe(MOCK_AREAS.length);
  });

  it("only returns tokens from the ordered palette, with at least 8 distinct entries", () => {
    expect(new Set(ZONE_TOKENS).size).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < 200; i++) {
      expect(ZONE_TOKENS).toContain(zoneColorToken(`area_${i}`));
    }
  });

  it("wraps around when there are more areas than tokens, using every token", () => {
    const used = new Set<string>();
    for (let i = 0; i < ZONE_TOKENS.length * 20; i++) {
      used.add(zoneColorToken(`room-${i}`));
    }
    expect(used.size).toBe(ZONE_TOKENS.length);
  });

  it("returns a valid palette token for an unknown or empty id, stably", () => {
    expect(ZONE_TOKENS).toContain(zoneColorToken("does-not-exist"));
    expect(zoneColorToken("does-not-exist")).toBe(zoneColorToken("does-not-exist"));
    expect(ZONE_TOKENS).toContain(zoneColorToken(""));
  });
});
