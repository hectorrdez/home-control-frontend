import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import { MAX_POINTS, WINDOW_MS, appendPoint, latestValue, sampleBuffers, trendDelta, type Point } from "./liveBuffer";

function sensor(id: string, state: string): Entity {
  return { entityId: id, domain: "sensor", name: id, state, attributes: { device_class: "temperature" }, area: null, lastChanged: "2026-11-06T08:00:00.000Z" };
}

describe("appendPoint", () => {
  it("drops points older than the 5 minute window", () => {
    const old: Point = { t: 0, v: 1 };
    const recent: Point = { t: WINDOW_MS, v: 2 };
    const next = appendPoint([old, recent], { t: WINDOW_MS + 1000, v: 3 });
    expect(next.map((p) => p.v)).toEqual([2, 3]);
  });

  it("caps the series at MAX_POINTS, keeping the newest", () => {
    let series: Point[] = [];
    for (let i = 0; i < MAX_POINTS + 25; i++) series = appendPoint(series, { t: i, v: i });
    expect(series).toHaveLength(MAX_POINTS);
    expect(series[0].v).toBe(25);
    expect(series[series.length - 1].v).toBe(MAX_POINTS + 24);
  });
});

describe("sampleBuffers", () => {
  it("samples every entity at the same instant (sample-and-hold keeps quiet sensors moving)", () => {
    const first = sampleBuffers({}, [sensor("sensor.a", "20")], 1000);
    const second = sampleBuffers(first, [sensor("sensor.a", "20")], 2000);
    expect(second["sensor.a"]).toEqual([
      { t: 1000, v: 20 },
      { t: 2000, v: 20 },
    ]);
  });

  it("appends a gap (null), not 0, for unavailable and non-numeric states", () => {
    const buffers = sampleBuffers({}, [sensor("sensor.a", "unavailable"), sensor("sensor.b", "heating")], 500);
    expect(buffers["sensor.a"]).toEqual([{ t: 500, v: null }]);
    expect(buffers["sensor.b"]).toEqual([{ t: 500, v: null }]);
  });

  it("does not mutate the previous buffers", () => {
    const before = sampleBuffers({}, [sensor("sensor.a", "1")], 1);
    sampleBuffers(before, [sensor("sensor.a", "2")], 2);
    expect(before["sensor.a"]).toHaveLength(1);
  });
});

describe("latestValue and trendDelta", () => {
  it("returns the last non-gap value", () => {
    expect(latestValue([{ t: 1, v: 5 }, { t: 2, v: null }])).toBe(5);
    expect(latestValue([{ t: 1, v: null }])).toBeNull();
  });

  it("compares with the last value at least one minute old", () => {
    const series: Point[] = [
      { t: 0, v: 10 },
      { t: 30_000, v: 12 },
      { t: 60_000, v: 14 },
      { t: 90_000, v: 15 },
    ];
    // Reference is the newest point at or before 90 s - 60 s = 30 s (value 12).
    expect(trendDelta(series, 90_000)).toBe(15 - 12);
  });

  it("is null when there is no point a minute back", () => {
    expect(trendDelta([{ t: 0, v: 1 }, { t: 5000, v: 2 }], 5000)).toBeNull();
  });
});
