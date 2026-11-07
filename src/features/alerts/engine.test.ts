import { describe, expect, it } from "vitest";
import type { AlertRule, AlertTrigger, Entity } from "@/api/types";
import type { PendingAction } from "@/state/entities";
import { DEDUPE_MS, entityChanges, evaluate, fires, takeFirings, type AlertEvent } from "./engine";

function entity(state: string, overrides: Partial<Entity> = {}): Entity {
  return {
    entityId: "sensor.temp",
    domain: "sensor",
    name: "Temp",
    state,
    attributes: { unit_of_measurement: "°C" },
    area: "kitchen",
    lastChanged: "2026-11-07T10:00:00.000Z",
    ...overrides,
  };
}

const NO_CONTEXT = { interacted: false };
const INTERACTED = { interacted: true };

function rule(id: string, trigger: AlertTrigger, level: AlertRule["level"] = "medium", extra: Partial<AlertRule> = {}): AlertRule {
  return { id, entityId: "sensor.temp", trigger, level, ...extra };
}

describe("fires: connects / disconnects (availability)", () => {
  const up = entity("21");
  const down = entity("unavailable");

  it("connects fires only when an unavailable entity becomes available", () => {
    expect(fires({ type: "connects" }, down, up, NO_CONTEXT)).toBe(true);
    expect(fires({ type: "connects" }, up, down, NO_CONTEXT)).toBe(false);
    expect(fires({ type: "connects" }, up, entity("22"), NO_CONTEXT)).toBe(false);
  });

  it("disconnects fires only when an available entity becomes unavailable", () => {
    expect(fires({ type: "disconnects" }, up, down, NO_CONTEXT)).toBe(true);
    expect(fires({ type: "disconnects" }, down, up, NO_CONTEXT)).toBe(false);
  });

  it("treats unknown as unavailable outside the unknown-state domains", () => {
    expect(fires({ type: "disconnects" }, up, entity("unknown"), NO_CONTEXT)).toBe(true);
    const cover = { domain: "cover", entityId: "cover.blind" };
    expect(fires({ type: "disconnects" }, entity("open", cover), entity("unknown", cover), NO_CONTEXT)).toBe(false);
  });
});

describe("fires: state_becomes", () => {
  it("fires when the state changes to the value", () => {
    const light = { domain: "light", entityId: "light.desk" };
    expect(fires({ type: "state_becomes", value: "on" }, entity("off", light), entity("on", light), NO_CONTEXT)).toBe(true);
  });

  it("does not fire when the state was already the value or moved away from it", () => {
    const light = { domain: "light", entityId: "light.desk" };
    expect(fires({ type: "state_becomes", value: "on" }, entity("on", light), entity("on", light), NO_CONTEXT)).toBe(false);
    expect(fires({ type: "state_becomes", value: "on" }, entity("on", light), entity("off", light), NO_CONTEXT)).toBe(false);
  });
});

describe("fires: above / below cross the threshold", () => {
  it("above fires once on the crossing, not on every sample above it", () => {
    const trigger: AlertTrigger = { type: "above", value: 25 };
    expect(fires(trigger, entity("24.9"), entity("25.1"), NO_CONTEXT)).toBe(true);
    expect(fires(trigger, entity("25.1"), entity("26"), NO_CONTEXT)).toBe(false);
    expect(fires(trigger, entity("26"), entity("27"), NO_CONTEXT)).toBe(false);
  });

  it("re-arms: going back under the threshold and crossing again fires again", () => {
    const trigger: AlertTrigger = { type: "above", value: 25 };
    expect(fires(trigger, entity("26"), entity("24"), NO_CONTEXT)).toBe(false);
    expect(fires(trigger, entity("24"), entity("26"), NO_CONTEXT)).toBe(true);
  });

  it("below fires once on the downward crossing and re-arms when it comes back", () => {
    const trigger: AlertTrigger = { type: "below", value: 10 };
    expect(fires(trigger, entity("10.5"), entity("9.5"), NO_CONTEXT)).toBe(true);
    expect(fires(trigger, entity("9.5"), entity("8"), NO_CONTEXT)).toBe(false);
    expect(fires(trigger, entity("8"), entity("11"), NO_CONTEXT)).toBe(false);
    expect(fires(trigger, entity("11"), entity("9"), NO_CONTEXT)).toBe(true);
  });

  it("ignores non-numeric states (unavailable, empty)", () => {
    expect(fires({ type: "above", value: 1 }, entity("unavailable"), entity("5"), NO_CONTEXT)).toBe(false);
    expect(fires({ type: "below", value: 1 }, entity("5"), entity(" "), NO_CONTEXT)).toBe(false);
  });
});

describe("fires: interacted", () => {
  it("fires only for a change the panel's own action caused", () => {
    expect(fires({ type: "interacted" }, entity("off"), entity("on"), INTERACTED)).toBe(true);
    expect(fires({ type: "interacted" }, entity("off"), entity("on"), NO_CONTEXT)).toBe(false);
  });
});

describe("evaluate", () => {
  const before = entity("24");
  const after = entity("26", { lastChanged: "2026-11-07T10:05:00.000Z" });

  it("returns the firing with the rule message, or the trigger label with the unit", () => {
    const events = evaluate([rule("a", { type: "above", value: 25 }, "high")], before, after, NO_CONTEXT);
    expect(events).toEqual([
      {
        rule: rule("a", { type: "above", value: 25 }, "high"),
        entityId: "sensor.temp",
        level: "high",
        text: "ABOVE 25 °C",
        at: "2026-11-07T10:05:00.000Z",
      },
    ]);
  });

  it("uses the custom message when the rule has one", () => {
    const events = evaluate([rule("a", { type: "above", value: 25 }, "low", { message: "Too warm" })], before, after, NO_CONTEXT);
    expect(events.map((event: AlertEvent) => event.text)).toEqual(["Too warm"]);
  });

  it("never fires level off, rules of other entities, or triggers that do not fire", () => {
    const rules = [
      rule("off", { type: "above", value: 25 }, "off"),
      { ...rule("other", { type: "above", value: 25 }), entityId: "sensor.other" },
      rule("quiet", { type: "below", value: 25 }),
    ];
    expect(evaluate(rules, before, after, NO_CONTEXT)).toEqual([]);
  });

  it("labels connects and interacted rules without a unit", () => {
    const down = entity("unavailable");
    const events = evaluate([rule("c", { type: "connects" }, "medium")], down, entity("20"), NO_CONTEXT);
    expect(events[0].text).toBe("CONNECTS");
    const interacted = evaluate([rule("i", { type: "interacted" }, "low")], entity("1"), entity("2"), INTERACTED);
    expect(interacted[0].text).toBe("USER INTERACTS");
  });
});

describe("entityChanges", () => {
  const pendingFor = (baseline: Entity): PendingAction => ({ requestId: 1, baseline, startedAt: 0, settling: false });

  it("reports changed entities, flagging those the panel's action was pending for", () => {
    const prev = { "sensor.a": entity("1", { entityId: "sensor.a" }), "sensor.b": entity("1", { entityId: "sensor.b" }) };
    const next = {
      "sensor.a": entity("2", { entityId: "sensor.a", lastChanged: "2026-11-07T10:01:00.000Z" }),
      "sensor.b": prev["sensor.b"],
    };
    const changes = entityChanges(prev, {}, next, {});
    expect(changes.map((c) => [c.after.entityId, c.interacted])).toEqual([["sensor.a", false]]);

    const pending = { "sensor.a": pendingFor(prev["sensor.a"]) };
    const confirmed = entityChanges(prev, pending, next, {});
    expect(confirmed[0].interacted).toBe(true);
  });

  it("skips new entities, values still pending and the rollback of a failed action", () => {
    const base = entity("off", { entityId: "light.a", domain: "light" });
    const optimistic = { ...base, state: "on", lastChanged: "2026-11-07T10:01:00.000Z" };
    const pending = { "light.a": pendingFor(base) };

    expect(entityChanges({}, {}, { "light.a": optimistic }, {})).toEqual([]);
    expect(entityChanges({ "light.a": base }, {}, { "light.a": optimistic }, pending)).toEqual([]);
    const rolledBack = { ...base, lastChanged: "2026-11-07T10:02:00.000Z" };
    expect(entityChanges({ "light.a": optimistic }, pending, { "light.a": rolledBack }, {})).toEqual([]);
  });

  it("reports a change of attributes and ignores identical copies", () => {
    const base = entity("on", { entityId: "light.a", domain: "light", attributes: { brightness: 1 } });
    const brighter = { ...base, attributes: { brightness: 2 } };
    expect(entityChanges({ "light.a": base }, {}, { "light.a": brighter }, {})).toHaveLength(1);
    expect(entityChanges({ "light.a": base }, {}, { "light.a": { ...base } }, {})).toEqual([]);
  });
});

describe("takeFirings", () => {
  const event = (id: string): AlertEvent => ({ rule: rule(id, { type: "connects" }), entityId: "sensor.temp", level: "medium", text: "", at: "" });

  it("keeps a rule's firing and drops repeats within the dedupe window", () => {
    const fired = new Map<string, number>();
    expect(takeFirings([event("a")], fired, 1000)).toHaveLength(1);
    expect(takeFirings([event("a")], fired, 1000 + DEDUPE_MS - 1)).toHaveLength(0);
    expect(takeFirings([event("a")], fired, 1000 + DEDUPE_MS)).toHaveLength(1);
  });

  it("dedupes per rule, not across rules", () => {
    const fired = new Map<string, number>();
    expect(takeFirings([event("a"), event("b")], fired, 0)).toHaveLength(2);
  });
});
