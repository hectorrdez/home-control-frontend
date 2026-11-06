import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import { applyIntent, intentAction } from "./actions";
import { entitiesReducer, initialEntitiesState, type EntitiesState } from "./entities";

const entity = (partial: Partial<Entity> & Pick<Entity, "entityId" | "domain">): Entity => ({
  name: partial.entityId,
  state: "off",
  attributes: {},
  area: "kitchen",
  lastChanged: "2026-11-06T10:00:00.000Z",
  ...partial,
});

describe("intentAction (control -> HomeApi action)", () => {
  it("maps power, brightness, climate, cover, lock and activate to the backend action names", () => {
    expect(intentAction({ kind: "power", on: true })).toEqual({ action: "turn_on" });
    expect(intentAction({ kind: "power", on: false })).toEqual({ action: "turn_off" });
    expect(intentAction({ kind: "brightness", pct: 40 })).toEqual({ action: "turn_on", params: { brightness_pct: 40 } });
    expect(intentAction({ kind: "temperature", temperature: 21.5 })).toEqual({
      action: "set_temperature",
      params: { temperature: 21.5 },
    });
    expect(intentAction({ kind: "hvac_mode", mode: "cool" })).toEqual({
      action: "set_hvac_mode",
      params: { hvac_mode: "cool" },
    });
    expect(intentAction({ kind: "preset", preset: "away" })).toEqual({
      action: "set_preset_mode",
      params: { preset_mode: "away" },
    });
    expect(intentAction({ kind: "cover_position", position: 30 })).toEqual({
      action: "set_cover_position",
      params: { position: 30 },
    });
    expect(intentAction({ kind: "cover_open" })).toEqual({ action: "open_cover" });
    expect(intentAction({ kind: "cover_close" })).toEqual({ action: "close_cover" });
    expect(intentAction({ kind: "lock", locked: true })).toEqual({ action: "lock" });
    expect(intentAction({ kind: "lock", locked: false })).toEqual({ action: "unlock" });
    expect(intentAction({ kind: "activate" })).toEqual({ action: "turn_on" });
  });
});

describe("applyIntent (expected state shown before the server answers)", () => {
  it("turns a light on and sets its brightness from the percentage", () => {
    const light = entity({ entityId: "light.a", domain: "light", state: "off", attributes: { brightness: 0 } });
    const next = applyIntent(light, { kind: "brightness", pct: 50 });
    expect(next.state).toBe("on");
    expect(next.attributes.brightness).toBe(128);
    expect(light.state).toBe("off"); // input is not mutated
  });

  it("moves the climate target and the cover position", () => {
    const climate = entity({ entityId: "climate.a", domain: "climate", state: "heat", attributes: { temperature: 21 } });
    expect(applyIntent(climate, { kind: "temperature", temperature: 21.5 }).attributes.temperature).toBe(21.5);

    const cover = entity({ entityId: "cover.a", domain: "cover", state: "open", attributes: { current_position: 100 } });
    const shut = applyIntent(cover, { kind: "cover_close" });
    expect(shut.state).toBe("closed");
    expect(shut.attributes.current_position).toBe(0);
  });
});

describe("optimistic reducer (apply / confirm / rollback / supersede)", () => {
  const light = entity({ entityId: "light.a", domain: "light", state: "off", attributes: { brightness: 0 } });
  const loaded: EntitiesState = {
    ...initialEntitiesState,
    status: "ready",
    entities: { [light.entityId]: light },
  };
  const optimistic = { ...light, state: "on" };

  it("applies the optimistic value and marks the entity pending", () => {
    const next = entitiesReducer(loaded, {
      type: "actionStarted",
      entityId: "light.a",
      requestId: 1,
      optimistic,
      startedAt: 0,
    });
    expect(next.entities["light.a"].state).toBe("on");
    expect(next.pending["light.a"].requestId).toBe(1);
    expect(next.pending["light.a"].baseline.state).toBe("off");
  });

  it("confirms with the returned entity and clears pending", () => {
    const started = entitiesReducer(loaded, { type: "actionStarted", entityId: "light.a", requestId: 1, optimistic, startedAt: 0 });
    const confirmed = { ...light, state: "on", lastChanged: "2026-11-06T10:01:00.000Z" };
    const next = entitiesReducer(started, { type: "actionConfirmed", entityId: "light.a", requestId: 1, entity: confirmed });
    expect(next.entities["light.a"]).toEqual(confirmed);
    expect(next.pending["light.a"]).toBeUndefined();
  });

  it("rolls back to the baseline on failure and clears pending", () => {
    const started = entitiesReducer(loaded, { type: "actionStarted", entityId: "light.a", requestId: 1, optimistic, startedAt: 0 });
    const next = entitiesReducer(started, { type: "actionFailed", entityId: "light.a", requestId: 1 });
    expect(next.entities["light.a"].state).toBe("off");
    expect(next.pending["light.a"]).toBeUndefined();
  });

  it("a newer action supersedes the older: the stale confirm is ignored, rollback keeps the original baseline", () => {
    const first = entitiesReducer(loaded, { type: "actionStarted", entityId: "light.a", requestId: 1, optimistic, startedAt: 0 });
    const second = entitiesReducer(first, {
      type: "actionStarted",
      entityId: "light.a",
      requestId: 2,
      optimistic: { ...light, state: "off" },
      startedAt: 0,
    });
    expect(second.pending["light.a"].baseline.state).toBe("off");

    const staleConfirm = entitiesReducer(second, {
      type: "actionConfirmed",
      entityId: "light.a",
      requestId: 1,
      entity: { ...light, state: "on" },
    });
    expect(staleConfirm.pending["light.a"].requestId).toBe(2);
    expect(staleConfirm.entities["light.a"].state).toBe("off");

    const rolledBack = entitiesReducer(second, { type: "actionFailed", entityId: "light.a", requestId: 2 });
    expect(rolledBack.entities["light.a"].state).toBe("off");
    expect(rolledBack.pending["light.a"]).toBeUndefined();
  });

  it("entityUpdated replaces a known entity and adds unknown ones to their area (105)", () => {
    const updated = { ...light, state: "on" };
    expect(entitiesReducer(loaded, { type: "entityUpdated", entity: updated }).entities["light.a"].state).toBe("on");
    const unknown = entitiesReducer(loaded, {
      type: "entityUpdated",
      entity: entity({ entityId: "light.zz", domain: "light" }),
    });
    expect(unknown.entities["light.zz"].state).toBe("off");
  });
});
