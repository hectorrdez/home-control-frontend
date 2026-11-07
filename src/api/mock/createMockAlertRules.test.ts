import { describe, expect, it } from "vitest";
import { createMockApi } from "./createMockApi";
import { ApiError, type AlertRuleInput } from "../types";

// Feature 128: the mock follows backend 012 (validation, duplicates, replace by id, delete is idempotent).
const LIGHT = "light.office_desk";
const connects: AlertRuleInput = { entityId: LIGHT, trigger: { type: "connects" }, level: "high" };

async function rejectionOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("expected a rejection");
}

describe("mock alert rules (feature 128)", () => {
  it("starts empty and lists stored rules sorted by entity", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    await expect(api.listAlertRules()).resolves.toEqual([]);
    await api.createAlertRule({ entityId: "switch.b", trigger: { type: "interacted" }, level: "low" });
    await api.createAlertRule(connects);
    const list = await api.listAlertRules();
    expect(list.map((r) => r.entityId)).toEqual([LIGHT, "switch.b"]);
  });

  it("creates a rule with a server id and keeps the message only when given", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    const stored = await api.createAlertRule({ ...connects, message: "Desk lamp on" });
    expect(stored).toMatchObject({ entityId: LIGHT, level: "high", message: "Desk lamp on" });
    expect(stored.id).toMatch(/^rule-\d+$/);
    const plain = await api.createAlertRule({ entityId: "switch.b", trigger: { type: "connects" }, level: "off" });
    expect(plain).not.toHaveProperty("message");
  });

  it("rejects duplicates (same entity and trigger) with duplicate_rule", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    await api.createAlertRule(connects);
    const error = await rejectionOf(api.createAlertRule({ ...connects, level: "low" }));
    expect(error.message).toBe("duplicate_rule");
    expect(error.status).toBe(409);
  });

  it("treats a value trigger with another value as a different trigger", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    await api.createAlertRule({ entityId: "sensor.t", trigger: { type: "above", value: 20 }, level: "low" });
    await expect(api.createAlertRule({ entityId: "sensor.t", trigger: { type: "above", value: 25 }, level: "low" })).resolves.toBeTruthy();
    await expect(api.createAlertRule({ entityId: "sensor.t", trigger: { type: "above", value: 20 }, level: "high" })).rejects.toMatchObject({
      message: "duplicate_rule",
    });
  });

  it("rejects invalid entity ids and invalid rules", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    expect((await rejectionOf(api.createAlertRule({ ...connects, entityId: "Bad Id" }))).message).toBe("invalid_entity_id");
    expect((await rejectionOf(api.createAlertRule({ ...connects, level: "urgent" as never }))).message).toBe("invalid_rule");
    const nanValue = { ...connects, trigger: { type: "above" as const, value: Number.NaN } };
    expect((await rejectionOf(api.createAlertRule(nanValue))).message).toBe("invalid_rule");
    const emptyState = { ...connects, trigger: { type: "state_becomes" as const, value: "" } };
    expect((await rejectionOf(api.createAlertRule(emptyState))).message).toBe("invalid_rule");
    const unknownType = { ...connects, trigger: { type: "explodes" } as never };
    expect((await rejectionOf(api.createAlertRule(unknownType))).message).toBe("invalid_rule");
    expect((await rejectionOf(api.createAlertRule({ ...connects, message: "x".repeat(121) }))).message).toBe("invalid_rule");
    expect((await rejectionOf(api.createAlertRule({ ...connects, message: 5 as never }))).message).toBe("invalid_rule");
  });

  it("replaces a rule by id", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    const stored = await api.createAlertRule(connects);
    const updated = await api.updateAlertRule(stored.id, { ...connects, level: "low" });
    expect(updated).toMatchObject({ id: stored.id, level: "low" });
    expect((await api.listAlertRules())[0].level).toBe("low");
  });

  it("answers rule_not_found for an unknown id on replace", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    await expect(rejectionOf(api.updateAlertRule("nope", connects))).resolves.toMatchObject({ message: "rule_not_found", status: 404 });
  });

  it("deletes a rule and is idempotent", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    const stored = await api.createAlertRule(connects);
    await api.deleteAlertRule(stored.id);
    await expect(api.listAlertRules()).resolves.toEqual([]);
    await expect(api.deleteAlertRule(stored.id)).resolves.toBeUndefined();
  });

  it("fails reads in the error scenario", async () => {
    const api = createMockApi({ scenario: "error", actionDelayMs: 0 });
    await expect(api.listAlertRules()).rejects.toMatchObject({ kind: "unavailable" });
  });
});
