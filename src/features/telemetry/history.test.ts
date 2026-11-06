import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import {
  climateRooms,
  climateSummary,
  downsample,
  housePowerSensor,
  hourlyAverages,
  meanAcrossSeries,
  mergeClimate,
  summarize,
} from "./history";

function sensor(id: string, state: string, deviceClass: string, area: string | null, name = id): Entity {
  return {
    entityId: id,
    domain: id.split(".")[0],
    name,
    state,
    attributes: { device_class: deviceClass },
    area,
    lastChanged: "2026-11-06T08:00:00.000Z",
  };
}

describe("downsample", () => {
  it("returns the input untouched when it fits the budget", () => {
    const points = [
      { t: "a", v: 1 },
      { t: "b", v: 2 },
    ];
    expect(downsample(points, 5)).toBe(points);
  });

  it("keeps at most max points and always keeps the first and last", () => {
    const points = Array.from({ length: 1000 }, (_, i) => ({ t: String(i), v: i }));
    const out = downsample(points, 200);
    expect(out).toHaveLength(200);
    expect(out[0]).toEqual(points[0]);
    expect(out[199]).toEqual(points[999]);
  });
});

describe("meanAcrossSeries (ALL ROOMS)", () => {
  it("averages each timestamp across series and sorts by time", () => {
    const a = [
      { t: "2026-11-06T10:00:00.000Z", v: 20 },
      { t: "2026-11-06T09:00:00.000Z", v: 18 },
    ];
    const b = [{ t: "2026-11-06T10:00:00.000Z", v: 24 }];
    expect(meanAcrossSeries([a, b])).toEqual([
      { t: "2026-11-06T09:00:00.000Z", v: 18 },
      { t: "2026-11-06T10:00:00.000Z", v: 22 },
    ]);
  });

  it("is empty for no series", () => {
    expect(meanAcrossSeries([])).toEqual([]);
  });
});

describe("summarize", () => {
  it("returns peak, variance (max - min) and mean", () => {
    const s = summarize([
      { t: "t1", v: 20 },
      { t: "t2", v: 23 },
      { t: "t3", v: 21 },
    ]);
    expect(s.peak).toEqual({ t: "t2", v: 23 });
    expect(s.variance).toBe(3);
    expect(s.mean).toBeCloseTo(21.333, 3);
  });

  it("returns nulls for an empty range", () => {
    expect(summarize([])).toEqual({ peak: null, variance: null, mean: null });
  });
});

describe("hourlyAverages", () => {
  it("averages watts per local hour, in time order", () => {
    const a = new Date(2026, 10, 6, 8, 5).toISOString();
    const b = new Date(2026, 10, 6, 8, 40).toISOString();
    const c = new Date(2026, 10, 6, 9, 0).toISOString();
    expect(
      hourlyAverages([
        { t: c, v: 300 },
        { t: a, v: 100 },
        { t: b, v: 200 },
      ]),
    ).toEqual([
      { hour: "08:00", watts: 150 },
      { hour: "09:00", watts: 300 },
    ]);
  });

  it("skips timestamps that do not parse", () => {
    expect(hourlyAverages([{ t: "not-a-date", v: 1 }])).toEqual([]);
  });
});

describe("mergeClimate", () => {
  it("joins temperature and humidity by timestamp, keeping gaps as null", () => {
    expect(
      mergeClimate(
        [
          { t: "2026-11-06T08:00:00.000Z", v: 21 },
          { t: "2026-11-06T09:00:00.000Z", v: 22 },
        ],
        [{ t: "2026-11-06T09:00:00.000Z", v: 45 }],
      ),
    ).toEqual([
      { t: "2026-11-06T08:00:00.000Z", temp: 21, hum: null },
      { t: "2026-11-06T09:00:00.000Z", temp: 22, hum: 45 },
    ]);
  });
});

describe("sensor selection", () => {
  it("lists unique rooms that have a numeric temperature sensor", () => {
    const entities = [
      sensor("sensor.kitchen_temperature", "21", "temperature", "kitchen"),
      sensor("sensor.kitchen_temperature_2", "22", "temperature", "kitchen"),
      sensor("sensor.office_temperature", "unavailable", "temperature", "office"),
      sensor("sensor.bedroom_temperature", "19", "temperature", "bedroom"),
      sensor("sensor.hall_temperature", "20", "temperature", null),
    ];
    expect(climateRooms(entities)).toEqual(["kitchen", "bedroom"]);
  });

  it("finds the house power sensor by name and ignores other power sensors", () => {
    const entities = [
      sensor("sensor.desk_power", "40", "power", "office", "Desk outlet power"),
      sensor("sensor.house_power", "1240", "power", null, "House power"),
    ];
    expect(housePowerSensor(entities)?.entityId).toBe("sensor.house_power");
    expect(housePowerSensor([entities[0]])).toBeNull();
  });
});

describe("climateSummary", () => {
  it("reads peak, temperature variance and humidity mean from merged rows", () => {
    const rows = [
      { t: new Date(2026, 10, 6, 8, 0).toISOString(), temp: 20, hum: 40 },
      { t: new Date(2026, 10, 6, 9, 0).toISOString(), temp: 23, hum: 50 },
      { t: new Date(2026, 10, 6, 10, 0).toISOString(), temp: 21, hum: null },
    ];
    expect(climateSummary(rows)).toBe("PEAK 09:00 23.0 °C • TEMP VARIANCE 3.0 °C • HUMIDITY MEAN 45.0 %");
  });

  it("shows -- when the range has no data", () => {
    expect(climateSummary([])).toBe("PEAK -- • TEMP VARIANCE -- °C • HUMIDITY MEAN -- %");
  });
});
