import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import { availableTriggers, buildTrigger, messageOf, triggerLabel, unitOf, type TriggerOption } from "./rules";

const entity = (domain: string, state = "on", attributes: Record<string, unknown> = {}): Entity => ({
  entityId: `${domain}.x`,
  domain,
  name: "X",
  state,
  attributes,
  area: null,
  lastChanged: "2026-11-07T10:00:00.000Z",
});

const option = (kind: TriggerOption["kind"], extra: Partial<TriggerOption> = {}): TriggerOption => ({
  kind,
  label: kind,
  valueKind: "none",
  ...extra,
});

describe("availableTriggers (feature 128)", () => {
  it("offers connects, disconnects and interacted for any entity", () => {
    expect(availableTriggers(entity("button")).map((o) => o.kind)).toEqual(["connects", "disconnects", "interacted"]);
  });

  it("adds BECOMES with the real states for state entities", () => {
    const lock = availableTriggers(entity("lock"));
    expect(lock.find((o) => o.kind === "state_becomes")).toMatchObject({ valueKind: "choice", choices: ["locked", "unlocked"] });
    const cover = availableTriggers(entity("cover"));
    expect(cover.find((o) => o.kind === "state_becomes")?.choices).toEqual(["open", "closed", "opening", "closing"]);
  });

  it("adds ABOVE and BELOW with the unit for sensors only", () => {
    const sensor = availableTriggers(entity("sensor", "21.5", { unit_of_measurement: "°C" }));
    expect(sensor.filter((o) => o.valueKind === "number")).toEqual([
      expect.objectContaining({ kind: "above", unit: "°C" }),
      expect.objectContaining({ kind: "below", unit: "°C" }),
    ]);
    const bare = availableTriggers(entity("sensor", "3"));
    expect(bare.find((o) => o.kind === "above")?.unit).toBeUndefined();
    expect(availableTriggers(entity("button")).some((o) => o.kind === "above")).toBe(false);
  });

  it("reads the unit only when it is a string", () => {
    expect(unitOf(entity("sensor", "1", { unit_of_measurement: "W" }))).toBe("W");
    expect(unitOf(entity("sensor", "1", { unit_of_measurement: 5 }))).toBeUndefined();
  });
});

describe("buildTrigger", () => {
  it("builds the fixed triggers without a value", () => {
    expect(buildTrigger(option("connects"), "")).toEqual({ type: "connects" });
    expect(buildTrigger(option("interacted"), "ignored")).toEqual({ type: "interacted" });
  });

  it("requires a state choice and a length within 40 characters", () => {
    expect(buildTrigger(option("state_becomes", { valueKind: "choice" }), "")).toBeNull();
    expect(buildTrigger(option("state_becomes", { valueKind: "choice" }), "x".repeat(41))).toBeNull();
    expect(buildTrigger(option("state_becomes", { valueKind: "choice" }), "on")).toEqual({ type: "state_becomes", value: "on" });
  });

  it("parses numbers for above and below and rejects blank or non-finite input", () => {
    expect(buildTrigger(option("above", { valueKind: "number" }), "")).toBeNull();
    expect(buildTrigger(option("above", { valueKind: "number" }), "   ")).toBeNull();
    expect(buildTrigger(option("below", { valueKind: "number" }), "abc")).toBeNull();
    expect(buildTrigger(option("below", { valueKind: "number" }), "-4.5")).toEqual({ type: "below", value: -4.5 });
  });
});

describe("triggerLabel and messageOf", () => {
  it("labels every trigger for the rule rows", () => {
    expect(triggerLabel({ type: "connects" })).toBe("CONNECTS");
    expect(triggerLabel({ type: "disconnects" })).toBe("DISCONNECTS");
    expect(triggerLabel({ type: "interacted" })).toBe("USER INTERACTS");
    expect(triggerLabel({ type: "state_becomes", value: "on" })).toBe("BECOMES ON");
    expect(triggerLabel({ type: "above", value: 25 }, "°C")).toBe("ABOVE 25 °C");
    expect(triggerLabel({ type: "below", value: 3 })).toBe("BELOW 3");
  });

  it("treats a blank message as no message", () => {
    expect(messageOf("   ")).toBeUndefined();
    expect(messageOf("  Door open  ")).toBe("Door open");
  });
});
