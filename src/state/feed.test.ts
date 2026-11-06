import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import { FEED_LIMIT, feedValue, recordChange } from "./feed";

function entity(id: string, state: string, attributes: Record<string, unknown> = {}, lastChanged = "2026-11-06T08:00:00.000Z"): Entity {
  return { entityId: id, domain: id.split(".")[0], name: id, state, attributes, area: null, lastChanged };
}

describe("feedValue", () => {
  it("tracks binary sensors, locks, covers, climate action and light/switch on-off only", () => {
    expect(feedValue(entity("binary_sensor.motion", "on"))).toBe("on");
    expect(feedValue(entity("lock.door", "locked"))).toBe("locked");
    expect(feedValue(entity("cover.blinds", "open"))).toBe("open");
    expect(feedValue(entity("climate.main", "heat", { hvac_action: "heating" }))).toBe("heating");
    expect(feedValue(entity("light.lamp", "on"))).toBe("on");
    expect(feedValue(entity("light.lamp", "unavailable"))).toBeNull();
    expect(feedValue(entity("sensor.co2", "612"))).toBeNull();
  });
});

describe("recordChange", () => {
  it("prepends a change, ignores unchanged values and caps the feed", () => {
    const before = entity("binary_sensor.motion", "off");
    const after = entity("binary_sensor.motion", "on", {}, "2026-11-06T08:00:05.000Z");
    const feed = recordChange([], before, after);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ entityId: "binary_sensor.motion", value: "on" });
    expect(recordChange(feed, after, { ...after, lastChanged: "x" })).toBe(feed);

    let long: ReturnType<typeof recordChange> = [];
    for (let i = 0; i < FEED_LIMIT + 5; i++) {
      long = recordChange(long, entity("light.a", i % 2 ? "on" : "off"), entity("light.a", i % 2 ? "off" : "on", {}, `t${i}`));
    }
    expect(long).toHaveLength(FEED_LIMIT);
  });

  it("records nothing without a known before state", () => {
    expect(recordChange([], undefined, entity("light.a", "on"))).toEqual([]);
  });
});
