import type { CoverCalibration, Entity, Preset } from "@/api/types";
import { ApiError } from "@/api/types";

// Feature 142: saved cover positions (backend 021). Pure helpers: no I/O, no React.
export const PRESET_MAX_PER_COVER = 10;
export const PRESET_NAME_MAX = 30;
const FALLBACK_PERCENT = 50;

// A cover can save positions when it can reach a known percent: calibrated (backend 010) or reporting its own position.
export function canUsePresets(entity: Entity, calibration: CoverCalibration | undefined): boolean {
  if (entity.domain !== "cover") return false;
  return calibration !== undefined || typeof entity.attributes.current_position === "number";
}

// Sorted by percent, then name (the order of the list and of the 143 MODES menu).
export function sortPresets(list: Preset[]): Preset[] {
  return [...list].sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name));
}

// Prefill for the SAVE POSITION slider: the estimate when calibrated, else the reported position, else 50.
export function initialPresetPercent(entity: Entity, calibration: CoverCalibration | undefined): number {
  const estimated = entity.attributes.estimated_position;
  if (calibration && typeof estimated === "number") return estimated;
  const reported = entity.attributes.current_position;
  if (typeof reported === "number") return reported;
  return FALLBACK_PERCENT;
}

export function presetNameValid(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= PRESET_NAME_MAX;
}

// Inline error text for the 142 messages (ApiError.message carries the backend code).
export function presetErrorText(error: unknown, fallback: string): string {
  const code = error instanceof ApiError || error instanceof Error ? error.message : "";
  switch (code) {
    case "duplicate_preset":
      return "NAME ALREADY USED";
    case "too_many_presets":
      return `MAX ${PRESET_MAX_PER_COVER} POSITIONS`;
    case "position_unknown":
      return "POSITION UNKNOWN: move to an end first";
    case "preset_not_applicable":
      return "CALIBRATE THIS COVER FIRST";
    default:
      return fallback;
  }
}
