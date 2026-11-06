import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN, bindRooms } from "./plan";

describe("DEFAULT_PLAN", () => {
  it("has one ground floor with unique room ids and area ids", () => {
    expect(DEFAULT_PLAN.floors).toHaveLength(1);
    const rooms = DEFAULT_PLAN.floors[0].rooms;
    expect(rooms.length).toBeGreaterThan(0);
    expect(new Set(rooms.map((r) => r.id)).size).toBe(rooms.length);
    expect(new Set(rooms.map((r) => r.areaId)).size).toBe(rooms.length);
  });

  it("keeps every room inside the 22 x 22 plate", () => {
    const half = DEFAULT_PLAN.plate / 2;
    for (const room of DEFAULT_PLAN.floors[0].rooms) {
      expect(room.rect.x - room.rect.w / 2).toBeGreaterThanOrEqual(-half);
      expect(room.rect.x + room.rect.w / 2).toBeLessThanOrEqual(half);
      expect(room.rect.z - room.rect.d / 2).toBeGreaterThanOrEqual(-half);
      expect(room.rect.z + room.rect.d / 2).toBeLessThanOrEqual(half);
    }
  });
});

describe("bindRooms", () => {
  it("marks a room present only when its area is known to the live areas", () => {
    const [first, second] = DEFAULT_PLAN.floors[0].rooms;
    const bound = bindRooms(DEFAULT_PLAN, [first.areaId]);

    expect(bound.find((r) => r.id === first.id)?.present).toBe(true);
    expect(bound.find((r) => r.id === second.id)?.present).toBe(false);
    expect(bound).toHaveLength(DEFAULT_PLAN.floors[0].rooms.length);
  });

  it("does not mutate the shared plan", () => {
    bindRooms(DEFAULT_PLAN, []);
    expect(DEFAULT_PLAN.floors[0].rooms.every((r) => !("present" in r))).toBe(true);
  });
});
