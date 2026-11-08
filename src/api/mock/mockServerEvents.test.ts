import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockApi } from "./createMockApi";
import { getClientId } from "../clientIdentity";
import type { ServerEvent } from "../types";

const fast = { actionDelayMs: 0, streamDelayMs: 0 };

afterEach(() => {
  vi.useRealTimers();
});

describe("mock server events (feature 132)", () => {
  it("emits resource_changed with this panel's id for its own alias writes", async () => {
    const api = createMockApi({ ...fast, scenario: "default" });
    const seen: ServerEvent[] = [];
    const stop = api.subscribe(() => undefined, () => undefined, (e) => seen.push(e));

    const entity = (await api.getEntities())[0];
    await api.setAlias(entity.entityId, "Kitchen light");

    expect(seen.filter((e) => e.type !== "event")).toEqual([{ type: "resource_changed", resource: "aliases", keys: [entity.entityId], by: getClientId() }]);
    stop();
  });

  it("subscribe without the third argument still works", () => {
    const api = createMockApi({ ...fast, scenario: "default" });
    expect(() => api.subscribe(() => undefined, () => undefined)()).not.toThrow();
  });

  it("remote-change: another device changes the first alias one second after subscribe", async () => {
    vi.useFakeTimers();
    const api = createMockApi({ ...fast, scenario: "remote-change" });
    const seen: ServerEvent[] = [];
    const stop = api.subscribe(() => undefined, () => undefined, (e) => seen.push(e));

    vi.advanceTimersByTime(999);
    expect(seen.filter((e) => e.type !== "event")).toEqual([]);
    vi.advanceTimersByTime(1);

    const first = (await api.getEntities()).map((e) => e.entityId).sort((a, b) => a.localeCompare(b))[0];
    expect(seen.filter((e) => e.type !== "event")).toEqual([{ type: "resource_changed", resource: "aliases", keys: [first], by: "other-device" }]);
    expect((await api.getAliases()).find((a) => a.entityId === first)?.alias).toBe("Remote alias");
    stop();
  });
});
