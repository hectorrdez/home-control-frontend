import { describe, expect, it } from "vitest";
import type { ServerAlert } from "@/api/types";
import { isSilentAtLoad, sinceLabel, SILENT_AFTER_MS } from "./serverAlerts";

const alert = (firedAt: string): ServerAlert => ({
  id: "a1",
  ruleId: "r1",
  entityId: "lock.front_door",
  level: "high",
  text: "Front door unlocked",
  firedAt,
  ackedAt: null,
  ackedBy: null,
  clientId: null,
});

describe("server alerts helpers (feature 139)", () => {
  const now = Date.parse("2026-11-08T12:00:00.000Z");

  it("treats alerts older than 60 s at load as silent", () => {
    expect(isSilentAtLoad(alert(new Date(now - SILENT_AFTER_MS - 1000).toISOString()), now)).toBe(true);
    expect(isSilentAtLoad(alert(new Date(now - 5000).toISOString()), now)).toBe(false);
  });

  it("formats the fire time as hh:mm", () => {
    const date = new Date(2026, 10, 8, 7, 5);
    expect(sinceLabel(date.toISOString())).toBe("07:05");
  });
});
