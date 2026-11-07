import { afterEach, describe, expect, it, vi } from "vitest";
import type { Entity } from "../types";
import { createMockApi } from "./createMockApi";

// Feature 129: the "alerts" scenario seeds three rules and changes their entities at 1.5 s, 4 s and 6 s.
afterEach(() => vi.useRealTimers());

describe("mock alerts scenario (feature 129)", () => {
  it("seeds the rules only in that scenario", async () => {
    expect(await createMockApi({ scenario: "alerts" }).listAlertRules()).toHaveLength(3);
    expect(await createMockApi().listAlertRules()).toEqual([]);
  });

  it("emits the timed changes on the stream", () => {
    vi.useFakeTimers();
    const api = createMockApi({ scenario: "alerts" });
    const seen: Array<[string, string]> = [];
    api.subscribe((entity: Entity) => seen.push([entity.entityId, entity.state]), () => undefined);
    vi.advanceTimersByTime(7000);
    // The stream also carries the mock's own drift; only the three timed changes are checked.
    const timed = seen.filter(([id]) => ["sensor.office_desk_power", "lock.front_door", "light.office_desk"].includes(id));
    expect(timed).toEqual([
      ["sensor.office_desk_power", "unavailable"],
      ["lock.front_door", "unlocked"],
      ["light.office_desk", "off"],
    ]);
  });
});
