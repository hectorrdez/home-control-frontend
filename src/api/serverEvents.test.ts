import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClientId, resetClientIdentityForTests } from "./clientIdentity";
import { isOwnChange, publishServerEvent, subscribeServerEvents } from "./serverEvents";
import type { ServerEvent } from "./types";

const change: ServerEvent = { type: "resource_changed", resource: "aliases", keys: [], by: "x" };

describe("server event fan-out (feature 132)", () => {
  it("delivers published events to every subscriber until unsubscribed", () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = subscribeServerEvents(a);
    subscribeServerEvents(b);

    publishServerEvent(change);
    expect(a).toHaveBeenCalledWith(change);
    expect(b).toHaveBeenCalledWith(change);

    stopA();
    publishServerEvent(change);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });
});

describe("isOwnChange", () => {
  beforeEach(() => {
    localStorage.clear();
    resetClientIdentityForTests();
  });
  afterEach(() => {
    localStorage.clear();
    resetClientIdentityForTests();
  });

  it("is true only for writes made by this panel", () => {
    const mine = getClientId();
    expect(isOwnChange({ by: mine })).toBe(true);
    expect(isOwnChange({ by: "other-device" })).toBe(false);
    expect(isOwnChange({ by: null })).toBe(false);
  });
});
