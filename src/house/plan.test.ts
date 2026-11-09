import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN, bindRooms } from "./plan";
import dwgPlan from "./dwgPlan.json";

const S = 2; // units per metre
const allRooms = () => DEFAULT_PLAN.floors.flatMap((f) => f.rooms);

describe("DEFAULT_PLAN", () => {
  it("has the ground, upper and attic levels with their labels", () => {
    expect(DEFAULT_PLAN.floors.map((f) => f.label)).toEqual(["Planta baja", "Planta alta", "Altillo"]);
    expect(DEFAULT_PLAN.floors.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(DEFAULT_PLAN.floors.map((f) => f.level)).toEqual([0, 1, 2]);
  });

  it("has unique room ids across floors, including the new rooms", () => {
    const ids = allRooms().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining(["despensa", "habitacion-papa", "habitacion-hector", "habitacion-nuria", "terraza", "altillo"]),
    );
  });

  it("has candidate area lists that are disjoint across all rooms", () => {
    const candidates = allRooms().flatMap((r) => r.areaIds);
    expect(new Set(candidates).size).toBe(candidates.length);
    for (const room of allRooms()) expect(room.areaId).toBe(room.areaIds[0]);
  });

  it("keeps every room part inside the 22 x 22 plate", () => {
    const half = DEFAULT_PLAN.plate / 2;
    for (const part of allRooms().flatMap((r) => r.parts)) {
      expect(part.x - part.w / 2).toBeGreaterThanOrEqual(-half);
      expect(part.x + part.w / 2).toBeLessThanOrEqual(half);
      expect(part.z - part.d / 2).toBeGreaterThanOrEqual(-half);
      expect(part.z + part.d / 2).toBeLessThanOrEqual(half);
    }
  });

  it("builds the terrace as an L of two parts and gives every other room one part", () => {
    const terrace = DEFAULT_PLAN.floors[1].rooms.find((r) => r.id === "terraza");
    expect(terrace?.parts).toHaveLength(2);
    for (const room of allRooms().filter((r) => r.id !== "terraza")) expect(room.parts).toHaveLength(1);
  });

  it("puts the living rooms downstairs, the bedrooms upstairs and the attic last", () => {
    const [ground, upper, attic] = DEFAULT_PLAN.floors;
    expect(ground.rooms.map((r) => r.areaId)).toEqual(expect.arrayContaining(["living_room", "kitchen"]));
    expect(upper.rooms.map((r) => r.areaId)).toEqual(expect.arrayContaining(["bedroom", "office"]));
    expect(ground.rooms.map((r) => r.id)).toEqual(expect.arrayContaining(["taller", "patio", "despensa"]));
    expect(upper.rooms.map((r) => r.id)).toContain("terraza");
    expect(attic.rooms.map((r) => r.id)).toEqual(["altillo"]);
  });

  it("uses real heights: 2.7 m levels, 1.0 m parapets, 0.2 m attic walls and knee", () => {
    const [ground, upper, attic] = DEFAULT_PLAN.floors;
    expect(ground.height).toBeCloseTo(2.7 * S);
    expect(attic.height).toBeCloseTo(2.4 * S);
    expect(ground.walls.filter((w) => w.h === 2.7 * S).length).toBeGreaterThan(0);
    expect(upper.walls.some((w) => w.h === 1.0 * S)).toBe(true);
    // Attic: four 0.2 m "attic" walls (front, back, left, right) that the gable roof starts on.
    expect(attic.walls).toHaveLength(4);
    expect(attic.walls.every((w) => w.h === 0.2 * S)).toBe(true);
  });

  it("makes every upper wall at metre y >= 7.33 a 1.0 m parapet", () => {
    // Walls are compared in the source metres (y = min corner); the plan maps them to scene units.
    const upperTerrace = dwgPlan.floors[1].walls.filter((w) => w.y >= 7.33);
    expect(upperTerrace.length).toBeGreaterThan(0);
    expect(upperTerrace.every((w) => w.h === 1.0 && w.kind === "parapet")).toBe(true);
    expect(DEFAULT_PLAN.floors[1].walls.some((w) => w.h === 1.0 * S)).toBe(true);
  });

  it("has walls tagged with a section cut, low at the facade", () => {
    for (const floor of DEFAULT_PLAN.floors) {
      for (const wall of floor.walls) expect(["low", "normal"]).toContain(wall.cut);
    }
    // The facade is at +z (y = 0 maps to z = depth/2 * S ≈ 10.4); walls whose centre is nearer than 0.7 m sit beyond z = 9.
    const facadeWalls = DEFAULT_PLAN.floors[0].walls.filter((w) => w.z > 9);
    expect(facadeWalls.length).toBeGreaterThan(0);
    expect(facadeWalls.every((w) => w.cut === "low")).toBe(true);
  });

  it("gives the ground and upper floors window glass, and each floor walls", () => {
    for (const floor of DEFAULT_PLAN.floors) expect(floor.walls.length).toBeGreaterThan(0);
    expect(DEFAULT_PLAN.floors[0].glass.length).toBeGreaterThan(0);
    expect(DEFAULT_PLAN.floors[1].glass.length).toBeGreaterThan(0);
  });

  it("climbs the ground stair continuously from the ground floor to the upper floor", () => {
    // Stair treads are the ground fixtures with the tread height (0.18 m); the list is in climbing order.
    const steps = DEFAULT_PLAN.floors[0].fixtures.filter((b) => Math.abs(b.h - 0.18 * S) < 1e-9);
    expect(steps.length).toBeGreaterThan(0);
    const tops = steps.map((s) => (s.y ?? 0) + s.h);
    expect(tops[0]).toBeLessThanOrEqual(0.2 * S);
    expect(tops[tops.length - 1]).toBeGreaterThanOrEqual(2.5 * S);
    expect(tops[tops.length - 1]).toBeLessThan(2.7 * S);
    tops.forEach((top, i) => {
      if (i > 0) expect(top).toBeGreaterThanOrEqual(tops[i - 1]);
    });
  });

  it("gives the attic a gable roof over the house footprint", () => {
    const roof = DEFAULT_PLAN.floors[2].roof;
    expect(roof).toBeDefined();
    expect(roof!.ridge).toBeCloseTo(2.4 * S);
    expect(roof!.knee).toBeCloseTo(0.2 * S);
    expect(roof!.box.w).toBeCloseTo(4.99 * S);
    expect(DEFAULT_PLAN.floors[0].roof).toBeUndefined();
  });
});

describe("bindRooms", () => {
  it("resolves a Spanish candidate that is live", () => {
    const bound = bindRooms(DEFAULT_PLAN, ["salon"]);
    const salon = bound.find((r) => r.id === "salon");
    expect(salon).toMatchObject({ areaId: "salon", present: true, floor: 0 });
  });

  it("falls back to the first candidate and marks the room absent when no candidate is live", () => {
    const bound = bindRooms(DEFAULT_PLAN, []);
    const salon = bound.find((r) => r.id === "salon");
    expect(salon).toMatchObject({ areaId: "living_room", present: false });
    expect(bound).toHaveLength(allRooms().length);
  });

  it("tags rooms with their floor index", () => {
    const bound = bindRooms(DEFAULT_PLAN, ["bedroom"]);
    expect(bound.find((r) => r.id === "habitacion-papa")).toMatchObject({ floor: 1, present: true, areaId: "bedroom" });
    expect(bound.find((r) => r.id === "salon")?.floor).toBe(0);
    expect(bound.find((r) => r.id === "altillo")?.floor).toBe(2);
  });

  it("does not mutate the shared plan", () => {
    const before = JSON.stringify(DEFAULT_PLAN);
    bindRooms(DEFAULT_PLAN, ["salon", "bedroom"]);
    expect(JSON.stringify(DEFAULT_PLAN)).toBe(before);
    expect(allRooms().every((r) => !("present" in r) && !("floor" in r))).toBe(true);
  });
});
