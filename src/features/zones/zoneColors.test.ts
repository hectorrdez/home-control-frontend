import { describe, expect, it } from "vitest";
import { ZONE_TOKENS, assignZoneTokens, zoneColorToken } from "./zoneColors";

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
describe("assignZoneTokens (feature 147)", () => {
  const IDS = ["living_room", "kitchen", "bedroom", "office", "garage", "attic", "patio", "hall"];

  it("gives 8 distinct tokens to 8 areas", () => {
    expect(new Set(assignZoneTokens(IDS).values()).size).toBe(8);
  });

  it("gives the same result whatever the input order", () => {
    expect([...assignZoneTokens(IDS)]).toEqual([...assignZoneTokens([...IDS].reverse())]);
  });

  it("assigns the tokens by position in the sorted ids", () => {
    const map = assignZoneTokens(["office", "bedroom"]);
    expect(map.get("bedroom")).toBe(ZONE_TOKENS[0]);
    expect(map.get("office")).toBe(ZONE_TOKENS[1]);
  });

  it("wraps around at the 9th area", () => {
    const ids = Array.from({ length: 9 }, (_, i) => "area_" + String(i).padStart(2, "0"));
    const map = assignZoneTokens(ids);
    expect(map.get("area_00")).toBe(ZONE_TOKENS[0]);
    expect(map.get("area_08")).toBe(ZONE_TOKENS[0]);
    expect(map.get("area_07")).toBe(ZONE_TOKENS[7]);
  });

  it("ignores duplicate ids", () => {
    expect(assignZoneTokens(["kitchen", "kitchen"]).size).toBe(1);
  });
});
