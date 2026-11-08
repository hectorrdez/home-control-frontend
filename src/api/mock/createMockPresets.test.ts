import { describe, expect, it } from "vitest";
import { createMockApi } from "./createMockApi";
import { ApiError } from "../types";

// Feature 142: the mock follows backend 021 (validation, caps, duplicates, apply rules).
const COVER = "cover.salon_blind";

async function rejectionOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("expected a rejection");
}

describe("mock presets (feature 142)", () => {
  it("creates, lists sorted by entity, renames and deletes", async () => {
    const api = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const half = await api.createPreset({ entityId: COVER, name: "HALF", percent: 50 });
    const top = await api.createPreset({ entityId: COVER, name: "Top", percent: 10 });
    expect((await api.getPresets(COVER)).map((p) => p.name)).toEqual(["Top", "HALF"]);

    const renamed = await api.updatePreset(half.id, { name: "Middle", percent: 40 });
    expect(renamed).toMatchObject({ id: half.id, name: "Middle", percent: 40 });

    await api.deletePreset(top.id);
    await api.deletePreset(top.id); // idempotent
    expect((await api.getPresets()).map((p) => p.name)).toEqual(["Middle"]);
  });

  it("rejects bad names, percents and duplicate names (case-insensitive)", async () => {
    const api = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    expect((await rejectionOf(api.createPreset({ entityId: COVER, name: "   ", percent: 50 }))).message).toBe("invalid_preset");
    expect((await rejectionOf(api.createPreset({ entityId: COVER, name: "x".repeat(31), percent: 50 }))).message).toBe("invalid_preset");
    expect((await rejectionOf(api.createPreset({ entityId: COVER, name: "ok", percent: 50.5 }))).message).toBe("invalid_preset");
    await api.createPreset({ entityId: COVER, name: "HALF", percent: 50 });
    expect((await rejectionOf(api.createPreset({ entityId: COVER, name: "half", percent: 20 }))).message).toBe("duplicate_preset");
  });

  it("allows at most 10 presets per cover", async () => {
    const api = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    for (let i = 0; i < 10; i += 1) await api.createPreset({ entityId: COVER, name: `P${i}`, percent: i * 10 });
    expect((await rejectionOf(api.createPreset({ entityId: COVER, name: "P10", percent: 100 }))).message).toBe("too_many_presets");
  });

  it("rejects presets on non-cover entities", async () => {
    const api = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const error = await rejectionOf(api.createPreset({ entityId: "light.office_desk", name: "x", percent: 1 }));
    expect(error.message).toBe("domain_not_allowed");
  });

  it("apply drives a calibrated cover to the preset percent", async () => {
    const api = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const half = await api.createPreset({ entityId: COVER, name: "HALF", percent: 50 });
    const moving = await api.applyPreset(half.id);
    expect(moving.attributes.estimated_position).toBeNull();
    // Let the move finish with real timers: the cover is calibrated at 4 s per leg, 50 % takes 2 s.
    await new Promise((resolve) => setTimeout(resolve, 2300));
    const latest = (await api.getEntities()).find((e) => e.entityId === COVER);
    expect(latest?.attributes.estimated_position).toBe(50);
  }, 10_000);

  it("apply of an unknown preset is preset_not_found", async () => {
    const api = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    expect((await rejectionOf(api.applyPreset("missing"))).message).toBe("preset_not_found");
  });

  it("apply on an uncalibrated cover without position is preset_not_applicable", async () => {
    const api = createMockApi({ scenario: "cover-calibration", actionDelayMs: 0 });
    // The backend stores a preset for any cover; only apply checks that the cover can reach it.
    const preset = await api.createPreset({ entityId: COVER, name: "HALF", percent: 50 });
    expect((await rejectionOf(api.applyPreset(preset.id))).message).toBe("preset_not_applicable");
  });
});
