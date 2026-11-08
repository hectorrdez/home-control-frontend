import { describe, expect, it, vi } from "vitest";
import { createMockApi } from "./createMockApi";
import { ApiError, SettingConflictError, type ServerEvent } from "../types";

// Feature 133: the mock follows backend 017 (versions, conflicts, size and key rules, events).
const KEY = "telemetry.widgets";

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("mock settings API (feature 133)", () => {
  it("creates at version 1 and bumps on a real change", async () => {
    const api = createMockApi();
    expect(await api.getSetting(KEY)).toBeNull();
    expect((await api.putSetting(KEY, [1])).version).toBe(1);
    expect((await api.putSetting(KEY, [2])).version).toBe(2);
    expect(await api.getSettings()).toEqual([expect.objectContaining({ key: KEY, version: 2, value: [2] })]);
  });

  it("keeps the version when the JSON value is the same", async () => {
    const api = createMockApi();
    await api.putSetting(KEY, { a: 1 });
    expect((await api.putSetting(KEY, { a: 1 })).version).toBe(1);
  });

  it("accepts a write whose baseVersion matches and rejects a stale one with the current setting", async () => {
    const api = createMockApi();
    await api.putSetting(KEY, [1]);
    await api.putSetting(KEY, [2], 1);
    const conflict = await rejectionOf(api.putSetting(KEY, [3], 1));
    expect(conflict).toBeInstanceOf(SettingConflictError);
    expect(conflict).toMatchObject({ status: 409, current: { version: 2, value: [2] } });
  });

  it("reports a conflict with current null when baseVersion is sent for a missing key", async () => {
    const api = createMockApi();
    const conflict = await rejectionOf(api.putSetting(KEY, [1], 1));
    expect(conflict).toMatchObject({ current: null });
  });

  it("rejects values over 65536 bytes with setting_too_large", async () => {
    const api = createMockApi();
    const error = await rejectionOf(api.putSetting(KEY, "x".repeat(65537)));
    expect(error).toMatchObject({ kind: "server", status: 413 });
  });

  it("rejects keys that break the backend rule", async () => {
    const api = createMockApi();
    expect(await rejectionOf(api.putSetting("Bad Key", 1))).toMatchObject({ status: 400 });
    expect(await rejectionOf(api.putSetting("single", 1))).toMatchObject({ status: 400 });
    expect(await rejectionOf(api.getSetting("a".repeat(81)))).toBeInstanceOf(ApiError);
  });

  it("emits resource_changed on a real change only, and on delete when something was removed", async () => {
    const api = createMockApi();
    const events: ServerEvent[] = [];
    const unsubscribe = api.subscribe(
      () => {},
      () => {},
      (e) => events.push(e),
    );
    await api.putSetting(KEY, [1]);
    await api.putSetting(KEY, [1]);
    await api.deleteSetting(KEY);
    await api.deleteSetting(KEY);
    unsubscribe();
    const settingEvents = events.filter((e) => e.type === "resource_changed" && e.resource === "settings");
    expect(settingEvents).toHaveLength(2);
    expect(settingEvents[0]).toMatchObject({ keys: [KEY] });
  });

  it("rejects list and get with not_found in the no-settings scenario", async () => {
    const api = createMockApi({ scenario: "no-settings" });
    expect(await rejectionOf(api.getSettings())).toMatchObject({ kind: "not_found" });
    expect(await rejectionOf(api.getSetting(KEY))).toMatchObject({ kind: "not_found" });
  });

  it("writes the hidden-widget layout from another device in the remote-settings scenario", async () => {
    vi.useFakeTimers();
    try {
      const api = createMockApi({ scenario: "remote-settings" });
      const events: ServerEvent[] = [];
      const unsubscribe = api.subscribe(
        () => {},
        () => {},
        (e) => events.push(e),
      );
      await vi.advanceTimersByTimeAsync(1000);
      unsubscribe();
      expect(events).toContainEqual({ type: "resource_changed", resource: "settings", keys: [KEY], by: "other-device" });
      const stored = await api.getSetting(KEY);
      const widgets = stored?.value as Array<{ visible: boolean }>;
      expect(widgets.length).toBeGreaterThan(0);
      expect(widgets[0].visible).toBe(false);
      expect(widgets.slice(1).every((w) => w.visible)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
