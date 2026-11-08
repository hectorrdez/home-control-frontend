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
  mergeRoomClimate,
  roomLines,
  summarize,
} from "./history";

// Feature 131: ALL ROOMS per-room merge and total mean.
describe("mergeRoomClimate", () => {
  const at = (h: number) => `2026-11-06T0${h}:00:00.000Z`;

  it("keys each room's value by area and joins temperature, mean and humidity by timestamp", () => {
    const kitchen = [
      { t: at(8), v: 20 },
      { t: at(9), v: 22 },
    ];
    const bedroom = [{ t: at(9), v: 18 }];
    const total = meanAcrossSeries([kitchen, bedroom]);
    const rows = mergeRoomClimate(
      [
        { room: "kitchen", points: kitchen },
        { room: "bedroom", points: bedroom },
      ],
      total,
      [{ t: at(8), v: 40 }],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ t: at(8), temp: 20, hum: 40, rooms: { kitchen: 20 }, humRooms: {} });
    // Total mean at 09:00 = (22 + 18) / 2, bedroom has no point at 08:00.
    expect(rows[1]).toEqual({ t: at(9), temp: 20, hum: null, rooms: { kitchen: 22, bedroom: 18 }, humRooms: {} });
  });

  it("returns no rows when there is no data", () => {
    expect(mergeRoomClimate([], [], [])).toEqual([]);
  });
});

// Feature 144: humidity room lines use the same merge; a room with no humidity points gets no line.
describe("roomLines and humidity rooms (feature 144)", () => {
  const at = (h: number) => `2026-11-06T0${h}:00:00.000Z`;

  it("builds one line per room with data for a device class, skipping empty rooms", () => {
    const series: Record<string, { t: string; v: number }[][]> = {
      kitchen: [[{ t: at(8), v: 40 }], [{ t: at(8), v: 60 }]],
      bedroom: [],
    };
    const lines = roomLines(["kitchen", "bedroom"], (room) => series[room]);
    expect(lines).toEqual([{ room: "kitchen", points: [{ t: at(8), v: 50 }] }]);
  });

  it("merges humidity room values into humRooms beside the temperature rooms", () => {
    const rows = mergeRoomClimate(
      [{ room: "kitchen", points: [{ t: at(8), v: 20 }] }],
      [{ t: at(8), v: 20 }],
      [{ t: at(8), v: 45 }],
      [{ room: "kitchen", points: [{ t: at(8), v: 48 }] }],
    );
    expect(rows).toEqual([{ t: at(8), temp: 20, hum: 45, rooms: { kitchen: 20 }, humRooms: { kitchen: 48 } }]);
  });
});

describe("ALL ROOMS total mean", () => {
  it("is the mean of every room's series per timestamp", () => {
    const a = [{ t: "2026-11-06T08:00:00.000Z", v: 20 }];
    const b = [{ t: "2026-11-06T08:00:00.000Z", v: 24 }];
    expect(meanAcrossSeries([a, b])).toEqual([{ t: "2026-11-06T08:00:00.000Z", v: 22 }]);
  });
});

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
