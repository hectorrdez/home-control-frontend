import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import { FEED_LIMIT, availabilityChange, deviceKeyOf, feedValue, recordChange } from "./feed";

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

describe("availability transitions (126)", () => {
  const device = (id: string, state: string, at: string, deviceName = "Desk plug", area = "office"): Entity => ({
    ...entity(id, state, {}, at),
    area,
    deviceName,
  });

  it("records disconnected and reconnected for any domain", () => {
    const sensor = (state: string, at: string) => device("sensor.temp", state, at, "Hall sensor", "hall");
    let feed = recordChange([], sensor("20.1", "2026-11-06T08:00:00.000Z"), sensor("unavailable", "2026-11-06T08:01:00.000Z"));
    expect(feed).toMatchObject([{ entityId: "sensor.temp", value: "disconnected", deviceKey: "hall~hall sensor" }]);

    feed = recordChange(feed, sensor("unavailable", "2026-11-06T08:01:00.000Z"), sensor("20.3", "2026-11-06T08:05:00.000Z"));
    expect(feed[0]).toMatchObject({ value: "reconnected", at: "2026-11-06T08:05:00.000Z" });
    expect(feed).toHaveLength(2);
  });

  it("treats unknown as unavailable except for cover, scene and script", () => {
    const fan = (state: string) => entity("fan.hall", state);
    expect(recordChange([], fan("on"), fan("unknown"))[0]).toMatchObject({ value: "disconnected" });
    const cover = (state: string) => entity("cover.blinds", state);
    expect(availabilityChange(cover("open"), cover("unknown"))).toBeNull();
    expect(availabilityChange(cover("open"), cover("unavailable"))).toBe("disconnected");
  });

  it("dedupes members of one device that change within 2 s, but not later transitions", () => {
    const plug = device("switch.desk", "on", "2026-11-06T08:00:00.000Z");
    const meter = device("sensor.desk_power", "42", "2026-11-06T08:00:00.000Z");
    let feed = recordChange([], plug, device("switch.desk", "unavailable", "2026-11-06T08:00:10.000Z"));
    feed = recordChange(feed, meter, device("sensor.desk_power", "unavailable", "2026-11-06T08:00:11.500Z"));
    expect(feed).toHaveLength(1);

    feed = recordChange(feed, device("switch.desk", "unavailable", "2026-11-06T08:00:10.000Z"), device("switch.desk", "on", "2026-11-06T08:01:00.000Z"));
    expect(feed.map((e) => e.value)).toEqual(["reconnected", "disconnected"]);
    const later = recordChange(feed, meter, device("sensor.desk_power", "unavailable", "2026-11-06T08:05:00.000Z"));
    expect(later.map((e) => e.value)).toEqual(["disconnected", "reconnected", "disconnected"]);
  });

  it("keeps the feed limit", () => {
    let feed: ReturnType<typeof recordChange> = [];
    for (let i = 0; i < FEED_LIMIT + 3; i++) {
      const at = new Date(Date.parse("2026-11-06T08:00:00.000Z") + i * 10_000).toISOString();
      feed = recordChange(feed, entity("light.a", i % 2 ? "unavailable" : "on"), entity("light.a", i % 2 ? "on" : "unavailable", {}, at));
    }
    expect(feed).toHaveLength(FEED_LIMIT);
  });
});

describe("deviceKeyOf (126)", () => {
  it("groups by area and trimmed, case-insensitive device name; standalone entities key on their id", () => {
    expect(deviceKeyOf({ ...entity("switch.a", "on"), area: "office", deviceName: " Desk Plug " })).toBe("office~desk plug");
    expect(deviceKeyOf(entity("lock.door", "locked"))).toBe("lock.door");
  });
});
