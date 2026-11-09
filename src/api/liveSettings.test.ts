import { describe, expect, it, vi } from "vitest";
import { createLiveApi } from "./liveApi";
import { ApiError, SettingConflictError, type Setting } from "./types";

// Feature 133: request shapes of the settings calls (backend 017 answers with data arrays).
function fakeFetch(status: number, body: unknown) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
}

const liveApi = (fetchImpl: ReturnType<typeof fakeFetch>) =>
  createLiveApi({
    baseUrl: "",
    token: "t",
    fetchImpl,
    eventSourceFactory: () => {
      throw new Error("no stream in this test");
    },
  });

const setting: Setting = { key: "telemetry.widgets", value: [1], version: 2, updatedAt: "2026-11-08T10:00:00Z", updatedBy: null };

describe("live settings API (feature 133)", () => {
  it("GETs the settings list", async () => {
    const fetchImpl = fakeFetch(200, { data: [setting] });
    await expect(liveApi(fetchImpl).getSettings()).resolves.toEqual([setting]);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/settings");
  });

  it("GETs one setting by key and returns it", async () => {
    const fetchImpl = fakeFetch(200, { data: [setting] });
    await expect(liveApi(fetchImpl).getSetting("telemetry.widgets")).resolves.toEqual(setting);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/settings/telemetry.widgets");
  });

  it("maps a missing key (404 setting_not_found) to null, not an error", async () => {
    const fetchImpl = fakeFetch(404, { error: "setting_not_found" });
    await expect(liveApi(fetchImpl).getSetting("telemetry.widgets")).resolves.toBeNull();
  });

  it("keeps other 404s as not_found so callers can treat the backend as unavailable", async () => {
    const fetchImpl = fakeFetch(404, { error: "not_found" });
    await expect(liveApi(fetchImpl).getSetting("telemetry.widgets")).rejects.toMatchObject({ kind: "not_found" });
  });

  it("PUTs the value without baseVersion when none is given", async () => {
    const fetchImpl = fakeFetch(200, { data: [setting] });
    await expect(liveApi(fetchImpl).putSetting("telemetry.widgets", [1])).resolves.toEqual(setting);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/settings/telemetry.widgets");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ value: [1] });
  });

  it("PUTs baseVersion when given", async () => {
    const fetchImpl = fakeFetch(200, { data: [setting] });
    await liveApi(fetchImpl).putSetting("telemetry.widgets", [1], 2);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ value: [1], baseVersion: 2 });
  });

  it("maps 409 version_conflict to SettingConflictError carrying the current setting", async () => {
    const fetchImpl = fakeFetch(409, { error: "version_conflict", data: [setting] });
    const error = await liveApi(fetchImpl).putSetting("telemetry.widgets", [1], 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SettingConflictError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "server", status: 409, current: { version: 2 } });
  });

  it("maps a 409 with no current key to SettingConflictError with current null", async () => {
    const fetchImpl = fakeFetch(409, { error: "version_conflict", data: [] });
    const error = await liveApi(fetchImpl).putSetting("telemetry.widgets", [1], 1).catch((e: unknown) => e);
    expect(error).toMatchObject({ current: null });
  });

  it("DELETEs the key", async () => {
    const fetchImpl = fakeFetch(200, { data: [] });
    await expect(liveApi(fetchImpl).deleteSetting("telemetry.widgets")).resolves.toBeUndefined();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/settings/telemetry.widgets");
    expect(init.method).toBe("DELETE");
  });

  it("maps a missing settings list (404) to kind not_found", async () => {
    const fetchImpl = fakeFetch(404, { error: "not_found" });
    await expect(liveApi(fetchImpl).getSettings()).rejects.toMatchObject({ kind: "not_found" });
  });
});
