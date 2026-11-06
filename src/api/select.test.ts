import { describe, expect, it } from "vitest";
import { createDevApi } from "./select";
import { resolveMode } from "./mode";

describe("resolveMode", () => {
  it("defaults to mock in dev and live in production when unset", () => {
    expect(resolveMode({ PROD: false })).toBe("mock");
    expect(resolveMode({ PROD: true })).toBe("live");
  });

  it("honours an explicit VITE_API_MODE over the build type", () => {
    expect(resolveMode({ VITE_API_MODE: "live", PROD: false })).toBe("live");
    expect(resolveMode({ VITE_API_MODE: "mock", PROD: true })).toBe("mock");
    expect(resolveMode({ VITE_API_MODE: " LIVE ", PROD: false })).toBe("live");
  });

  it("ignores unknown values and falls back to the build default", () => {
    expect(resolveMode({ VITE_API_MODE: "banana", PROD: true })).toBe("live");
  });
});

describe("createDevApi", () => {
  it("returns the mock in mock mode, without touching the network", async () => {
    const api = createDevApi({ VITE_API_MODE: "mock", PROD: false }, "");
    await expect(api.getStatus()).resolves.toMatchObject({ online: true });
  });

  it("returns a live client in live mode that calls the configured base URL", async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ data: [{ online: false, message: "down", version: null }] }), {
        status: 200,
      });
    }) as typeof fetch;

    try {
      const api = createDevApi(
        { VITE_API_MODE: "live", VITE_API_URL: "http://backend.test", VITE_API_TOKEN: "t", PROD: false },
        "",
      );
      await expect(api.getStatus()).resolves.toMatchObject({ online: false });
      expect(calls).toEqual(["http://backend.test/api/ha/status"]);
    } finally {
      globalThis.fetch = original;
    }
  });
});
