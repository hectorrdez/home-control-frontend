import { describe, expect, it } from "vitest";
import type { Area, Entity } from "@/api/types";
import { entitiesReducer, initialEntitiesState, reconcileEvent, type EntitiesState } from "./entities";

const at = "2026-01-01T10:00:00.000Z";
const T0 = Date.parse(at);

function light(state: string, lastChanged = at, area: string | null = "kitchen"): Entity {
  return { entityId: "light.a", domain: "light", name: "A", state, attributes: {}, area, lastChanged };
}

const areas: Area[] = [
  { areaId: "kitchen", name: "Kitchen", entities: [light("off")] },
  { areaId: "unassigned", name: "Unassigned", entities: [] },
];

function loaded(): EntitiesState {
  return entitiesReducer(initialEntitiesState, { type: "loaded", areas });
}

describe("stream merge (105)", () => {
  it("updates a known entity in place", () => {
    const next = entitiesReducer(loaded(), { type: "entityUpdated", entity: light("on", "2026-01-01T10:01:00.000Z") });
    expect(next.entities["light.a"].state).toBe("on");
    expect(next.areas[0].entityIds).toEqual(["light.a"]);
  });

  it("adds an unknown entity to its area, or to unassigned when the area is unknown", () => {
    const known = entitiesReducer(loaded(), {
      type: "entityUpdated",
      entity: { ...light("on"), entityId: "light.new", name: "New" },
    });
    expect(known.areas[0].entityIds).toEqual(["light.a", "light.new"]);

    const orphan = entitiesReducer(loaded(), {
      type: "entityUpdated",
      entity: { ...light("on"), entityId: "light.orphan", area: "attic" },
    });
    expect(orphan.areas[1].entityIds).toEqual(["light.orphan"]);
  });

  it("confirms a pending action when the event matches the optimistic state", () => {
    const started = entitiesReducer(loaded(), {
      type: "actionStarted",
      entityId: "light.a",
      requestId: 1,
      optimistic: light("on"),
      startedAt: T0,
    });
    const next = entitiesReducer(started, { type: "entityUpdated", entity: light("on", at) });
    expect(next.pending["light.a"]).toBeUndefined();
    expect(next.entities["light.a"].state).toBe("on");
  });

  it("keeps the optimistic value for an older event that disagrees", () => {
    const started = entitiesReducer(loaded(), {
      type: "actionStarted",
      entityId: "light.a",
      requestId: 1,
      optimistic: light("on"),
      startedAt: T0,
    });
    const next = entitiesReducer(started, { type: "entityUpdated", entity: light("off", "2026-01-01T09:59:00.000Z") });
    expect(next.pending["light.a"]).toBeDefined();
    expect(next.entities["light.a"].state).toBe("on");
  });

  it("lets a newer disagreeing event win over the pending action", () => {
    const started = entitiesReducer(loaded(), {
      type: "actionStarted",
      entityId: "light.a",
      requestId: 1,
      optimistic: light("on"),
      startedAt: T0,
    });
    const next = entitiesReducer(started, { type: "entityUpdated", entity: light("off", "2026-01-01T10:00:05.000Z") });
    expect(next.pending["light.a"]).toBeUndefined();
    expect(next.entities["light.a"].state).toBe("off");
  });

  it("reconcileEvent applies everything when nothing is pending", () => {
    expect(reconcileEvent(undefined, undefined, light("on"))).toBe("apply");
  });

  it("areasRefreshed keeps optimistic values of in-flight actions", () => {
    const started = entitiesReducer(loaded(), {
      type: "actionStarted",
      entityId: "light.a",
      requestId: 1,
      optimistic: light("on"),
      startedAt: T0,
    });
    const next = entitiesReducer(started, { type: "areasRefreshed", areas });
    expect(next.entities["light.a"].state).toBe("on");
    expect(next.pending["light.a"]).toBeDefined();
  });
});
