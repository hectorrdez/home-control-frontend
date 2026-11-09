import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN, bindRooms } from "./plan";

const allRooms = () => DEFAULT_PLAN.floors.flatMap((f) => f.rooms);

describe("DEFAULT_PLAN", () => {
  it("has the ground and upper floors with their labels", () => {
    expect(DEFAULT_PLAN.floors.map((f) => f.label)).toEqual(["Planta baja", "Planta alta"]);
    expect(DEFAULT_PLAN.floors.map((f) => f.index)).toEqual([0, 1]);
  });

  it("has unique room ids across floors", () => {
    const ids = allRooms().map((r) => r.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has candidate area lists that are disjoint across all rooms", () => {
    const candidates = allRooms().flatMap((r) => r.areaIds);
    expect(new Set(candidates).size).toBe(candidates.length);
    for (const room of allRooms()) expect(room.areaId).toBe(room.areaIds[0]);
  });

  it("keeps every room inside the 22 x 22 plate", () => {
    const half = DEFAULT_PLAN.plate / 2;
    for (const room of allRooms()) {
      expect(room.rect.x - room.rect.w / 2).toBeGreaterThanOrEqual(-half);
      expect(room.rect.x + room.rect.w / 2).toBeLessThanOrEqual(half);
      expect(room.rect.z - room.rect.d / 2).toBeGreaterThanOrEqual(-half);
      expect(room.rect.z + room.rect.d / 2).toBeLessThanOrEqual(half);
    }
  });

  it("puts the living rooms downstairs and the bedrooms upstairs", () => {
    const [ground, upper] = DEFAULT_PLAN.floors;
    const groundAreas = ground.rooms.map((r) => r.areaId);
    const upperAreas = upper.rooms.map((r) => r.areaId);
    expect(groundAreas).toEqual(expect.arrayContaining(["living_room", "kitchen"]));
    expect(upperAreas).toEqual(expect.arrayContaining(["bedroom", "office"]));
    expect(ground.rooms.map((r) => r.id)).toEqual(expect.arrayContaining(["taller", "patio"]));
    expect(upper.rooms.map((r) => r.id)).toContain("terraza");
  });

  it("gives each floor stair steps in fixtures and window glass", () => {
    for (const floor of DEFAULT_PLAN.floors) {
      expect(floor.fixtures.length).toBeGreaterThan(0);
      expect(floor.glass.length).toBeGreaterThan(0);
      expect(floor.walls.length).toBeGreaterThan(0);
    }
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
    expect(bound.find((r) => r.id === "dormitorio-principal")).toMatchObject({ floor: 1, present: true, areaId: "bedroom" });
    expect(bound.find((r) => r.id === "salon")?.floor).toBe(0);
  });

  it("does not mutate the shared plan", () => {
    const before = JSON.stringify(DEFAULT_PLAN);
    bindRooms(DEFAULT_PLAN, ["salon", "bedroom"]);
    expect(JSON.stringify(DEFAULT_PLAN)).toBe(before);
    expect(allRooms().every((r) => !("present" in r) && !("floor" in r))).toBe(true);
  });
});
