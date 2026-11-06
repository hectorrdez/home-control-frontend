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

describe("settling after a stale action answer (117)", () => {
  const off = light("off");
  const on = light("on", "2026-01-01T10:00:01.000Z");
  const startOn = () =>
    entitiesReducer(loaded(), {
      type: "actionStarted",
      entityId: "light.a",
      requestId: 1,
      optimistic: on,
      startedAt: T0,
    });

  it("keeps the optimistic value and marks the entity settling when the answer still shows the old state", () => {
    const next = entitiesReducer(startOn(), {
      type: "actionConfirmed",
      entityId: "light.a",
      requestId: 1,
      entity: off,
    });
    expect(next.entities["light.a"].state).toBe("on");
    expect(next.pending["light.a"]).toMatchObject({ requestId: 1, settling: true });
  });

  it("clears the settling when the stream event with the expected state arrives", () => {
    const settling = entitiesReducer(startOn(), { type: "actionConfirmed", entityId: "light.a", requestId: 1, entity: off });
    const next = entitiesReducer(settling, { type: "entityUpdated", entity: on });
    expect(next.pending["light.a"]).toBeUndefined();
    expect(next.entities["light.a"].state).toBe("on");
  });

  it("ignores an older stream event that disagrees while settling", () => {
    const settling = entitiesReducer(startOn(), { type: "actionConfirmed", entityId: "light.a", requestId: 1, entity: off });
    const next = entitiesReducer(settling, {
      type: "entityUpdated",
      entity: light("off", "2026-01-01T09:59:00.000Z"),
    });
    expect(next.pending["light.a"]).toMatchObject({ settling: true });
    expect(next.entities["light.a"].state).toBe("on");
  });

  it("lets a newer disagreeing stream event win while settling", () => {
    const settling = entitiesReducer(startOn(), { type: "actionConfirmed", entityId: "light.a", requestId: 1, entity: off });
    const next = entitiesReducer(settling, { type: "entityUpdated", entity: light("off", "2026-01-01T10:00:09.000Z") });
    expect(next.pending["light.a"]).toBeUndefined();
    expect(next.entities["light.a"].state).toBe("off");
  });

  it("drops the settling marker on timeout but keeps the value until the refresh", () => {
    const settling = entitiesReducer(startOn(), { type: "actionConfirmed", entityId: "light.a", requestId: 1, entity: off });
    const timedOut = entitiesReducer(settling, { type: "settleTimedOut", entityId: "light.a", requestId: 1 });
    expect(timedOut.pending["light.a"]).toBeUndefined();
    expect(timedOut.entities["light.a"].state).toBe("on");
  });

  it("does not settle-time-out a request that was superseded or is not settling", () => {
    const settling = entitiesReducer(startOn(), { type: "actionConfirmed", entityId: "light.a", requestId: 1, entity: off });
    expect(entitiesReducer(settling, { type: "settleTimedOut", entityId: "light.a", requestId: 9 })).toBe(settling);

    const inFlight = startOn();
    expect(entitiesReducer(inFlight, { type: "settleTimedOut", entityId: "light.a", requestId: 1 })).toBe(inFlight);
    expect(entitiesReducer(inFlight, { type: "settleTimedOut", entityId: "light.nope", requestId: 1 })).toBe(inFlight);
  });

  it("a newer action supersedes a settling one: its confirm is not stale, the old timeout is ignored", () => {
    const settling = entitiesReducer(startOn(), { type: "actionConfirmed", entityId: "light.a", requestId: 1, entity: off });
    const newer = entitiesReducer(settling, {
      type: "actionStarted",
      entityId: "light.a",
      requestId: 2,
      optimistic: off,
      startedAt: T0 + 1000,
    });
    expect(newer.pending["light.a"]).toMatchObject({ requestId: 2, settling: false });
    expect(entitiesReducer(newer, { type: "settleTimedOut", entityId: "light.a", requestId: 1 })).toBe(newer);
    // The newer answer matches its optimistic state, so it confirms and clears the pending action.
    const confirmed = entitiesReducer(newer, { type: "actionConfirmed", entityId: "light.a", requestId: 2, entity: off });
    expect(confirmed.pending["light.a"]).toBeUndefined();
  });

  it("applies a confirm straight away when the answer already shows the expected state and attributes", () => {
    const bright = {
      ...light("off"),
      attributes: { brightness: 0 },
    };
    const started = entitiesReducer(
      { ...loaded(), entities: { "light.a": bright } },
      {
        type: "actionStarted",
        entityId: "light.a",
        requestId: 1,
        optimistic: { ...bright, state: "on", attributes: { brightness: 128 } },
        startedAt: T0,
      },
    );
    const answered = { ...bright, state: "on", attributes: { brightness: 128 } };
    const next = entitiesReducer(started, { type: "actionConfirmed", entityId: "light.a", requestId: 1, entity: answered });
    expect(next.pending["light.a"]).toBeUndefined();
  });

  it("treats a brightness answer that still shows the old brightness as stale", () => {
    const bright = { ...light("off"), attributes: { brightness: 0 } };
    const optimistic = { ...bright, state: "on", attributes: { brightness: 128 } };
    const started = entitiesReducer(
      { ...loaded(), entities: { "light.a": bright } },
      { type: "actionStarted", entityId: "light.a", requestId: 1, optimistic, startedAt: T0 },
    );
    // baseline is the entity before the action: brightness 0; the answer still reports brightness 0 with state on.
    const next = entitiesReducer(started, {
      type: "actionConfirmed",
      entityId: "light.a",
      requestId: 1,
      entity: { ...bright, state: "on" },
    });
    expect(next.pending["light.a"]).toMatchObject({ settling: true });
    expect(next.entities["light.a"].attributes.brightness).toBe(128);
  });
});

describe("superseded action events (117)", () => {
  it("ignores a same-state event that carries the older brightness of a superseded action", () => {
    const base = { ...light("off"), attributes: { brightness: 120 } };
    const started = entitiesReducer(
      { ...loaded(), entities: { "light.a": base } },
      {
        type: "actionStarted",
        entityId: "light.a",
        requestId: 1,
        optimistic: { ...base, state: "on", attributes: { brightness: 122 } },
        startedAt: T0,
      },
    );
    const newer = entitiesReducer(started, {
      type: "actionStarted",
      entityId: "light.a",
      requestId: 2,
      optimistic: { ...base, state: "on", attributes: { brightness: 125 } },
      startedAt: T0 + 10,
    });
    const olderEvent = { ...base, state: "on", attributes: { brightness: 122 }, lastChanged: "2026-01-01T10:00:01.000Z" };
    const kept = entitiesReducer(newer, { type: "entityUpdated", entity: olderEvent });
    expect(kept.pending["light.a"]).toMatchObject({ requestId: 2 });
    expect(kept.entities["light.a"].attributes.brightness).toBe(125);

    const matching = { ...base, state: "on", attributes: { brightness: 125 }, lastChanged: "2026-01-01T10:00:02.000Z" };
    const done = entitiesReducer(kept, { type: "entityUpdated", entity: matching });
    expect(done.pending["light.a"]).toBeUndefined();
    expect(done.entities["light.a"].attributes.brightness).toBe(125);
  });
});
