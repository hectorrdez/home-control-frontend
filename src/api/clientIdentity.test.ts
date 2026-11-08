import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClientId, getClientName, nameFromUserAgent, resetClientIdentityForTests } from "./clientIdentity";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  localStorage.clear();
  resetClientIdentityForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  resetClientIdentityForTests();
});

describe("getClientId", () => {
  it("creates a UUID once, persists it as hc.client.v1 and reuses it", () => {
    const id = getClientId();
    expect(id).toMatch(UUID);
    expect(JSON.parse(localStorage.getItem("hc.client.v1") ?? "null")).toEqual({ v: 1, id });

    resetClientIdentityForTests();
    expect(getClientId()).toBe(id);
  });

  it("replaces a corrupt stored value with a new id", () => {
    localStorage.setItem("hc.client.v1", "{not json");
    const id = getClientId();
    expect(id).toMatch(UUID);
    expect(JSON.parse(localStorage.getItem("hc.client.v1") ?? "null")).toEqual({ v: 1, id });
  });

  it("ignores a stored value with the wrong version or a non-string id", () => {
    localStorage.setItem("hc.client.v1", JSON.stringify({ v: 2, id: "abc" }));
    expect(getClientId()).toMatch(UUID);
    resetClientIdentityForTests();
    localStorage.setItem("hc.client.v1", JSON.stringify({ v: 1, id: 42 }));
    expect(getClientId()).toMatch(UUID);
  });

  it("keeps one stable in-memory id for the session when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const first = getClientId();
    expect(first).toMatch(UUID);
    expect(getClientId()).toBe(first);
  });
});

describe("nameFromUserAgent", () => {
  it("names the Electron shell", () => {
    expect(
      nameFromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) home-control/1.0 Electron/38.2.0 Chrome/140.0 Safari/537.36",
      ),
    ).toBe("Electron");
  });

  it("names browser and OS from sample user agents", () => {
    expect(
      nameFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"),
    ).toBe("Chrome Windows");
    expect(nameFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0")).toBe(
      "Firefox macOS",
    );
    expect(
      nameFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari iOS");
  });

  it("falls back to Browser and never exceeds 40 characters", () => {
    expect(nameFromUserAgent("curl/8.0")).toBe("Browser");
    expect(nameFromUserAgent(`Mozilla/5.0 (X11; Linux x86_64) Chrome/125.0 ${"x".repeat(200)}`).length).toBeLessThanOrEqual(40);
  });

  it("reads navigator.userAgent through getClientName", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/128.0" });
    expect(getClientName()).toBe("Firefox Linux");
  });
});
