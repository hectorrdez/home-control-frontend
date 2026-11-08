import { describe, expect, it } from "vitest";
import type { CoverCalibration, Entity, Preset } from "@/api/types";
import { ApiError } from "@/api/types";
import { canUsePresets, initialPresetPercent, presetErrorText, presetNameValid, sortPresets } from "./presets";

function cover(attributes: Record<string, unknown> = {}, domain = "cover"): Entity {
  return { entityId: "cover.salon_blind", domain, name: "Salon blind", state: "closed", attributes, area: null, lastChanged: "2026-11-08T10:00:00Z" };
}

const calibration: CoverCalibration = { entityId: "cover.salon_blind", openMs: 4000, closeMs: 4000, position: 0, calibratedAt: "2026-11-08T10:00:00Z" };

function preset(id: string, name: string, percent: number): Preset {
  return { id, entityId: "cover.salon_blind", name, percent, createdAt: "2026-11-08T10:00:00Z" };
}

describe("canUsePresets", () => {
  it.each([
    ["calibrated cover", cover({}), calibration, true],
    ["cover with a numeric position", cover({ current_position: 40 }), undefined, true],
    ["uncalibrated cover without position", cover({}), undefined, false],
    ["position not numeric", cover({ current_position: "40" }), undefined, false],
    ["non-cover calibrated", cover({}, "light"), calibration, false],
    ["non-cover with position", cover({ current_position: 40 }, "light"), undefined, false],
  ])("%s -> %s", (_label, entity, cal, expected) => {
    expect(canUsePresets(entity, cal)).toBe(expected);
  });
});

describe("sortPresets", () => {
  it("sorts by percent, then name", () => {
    const sorted = sortPresets([preset("a", "Zed", 50), preset("b", "Bed", 50), preset("c", "Top", 0)]);
    expect(sorted.map((p) => p.name)).toEqual(["Top", "Bed", "Zed"]);
  });
});

describe("initialPresetPercent", () => {
  it("uses the estimate when calibrated, the reported position otherwise, else 50", () => {
    expect(initialPresetPercent(cover({ estimated_position: 30 }), calibration)).toBe(30);
    expect(initialPresetPercent(cover({ estimated_position: null }), calibration)).toBe(50);
    expect(initialPresetPercent(cover({ current_position: 70 }), undefined)).toBe(70);
    expect(initialPresetPercent(cover({}), undefined)).toBe(50);
  });
});

describe("presetNameValid", () => {
  it("accepts 1..30 characters after trimming", () => {
    expect(presetNameValid("  ")).toBe(false);
    expect(presetNameValid("HALF")).toBe(true);
    expect(presetNameValid("a".repeat(30))).toBe(true);
    expect(presetNameValid("a".repeat(31))).toBe(false);
  });
});

describe("presetErrorText", () => {
  it("maps the backend 021 codes to the card messages", () => {
    expect(presetErrorText(new ApiError("server", "duplicate_preset", 409), "X")).toBe("NAME ALREADY USED");
    expect(presetErrorText(new ApiError("server", "too_many_presets", 400), "X")).toBe("MAX 10 POSITIONS");
    expect(presetErrorText(new ApiError("server", "position_unknown", 409), "X")).toBe("POSITION UNKNOWN: move to an end first");
    expect(presetErrorText(new ApiError("server", "preset_not_applicable", 409), "X")).toBe("CALIBRATE THIS COVER FIRST");
  });

  it("falls back for any other failure", () => {
    expect(presetErrorText(new Error("network"), "COULD NOT SAVE POSITION")).toBe("COULD NOT SAVE POSITION");
  });
});
