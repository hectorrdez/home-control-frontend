import { describe, expect, it, vi } from "vitest";
import { createLiveApi } from "./liveApi";

// Feature 127: request shapes and error mapping of the calibration + cover-percent calls.
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

describe("live calibration API (feature 127)", () => {
  it("GETs the calibration list", async () => {
    const rows = [{ entityId: "cover.a", openMs: 5000, closeMs: 4800, position: null, calibratedAt: "2026-11-07T10:00:00Z" }];
    const fetchImpl = fakeFetch(200, { data: rows });
    await expect(liveApi(fetchImpl).getCalibrations()).resolves.toEqual(rows);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/calibrations");
  });

  it("PUTs the two times for one entity and returns the full list", async () => {
    const fetchImpl = fakeFetch(200, { data: [] });
    await liveApi(fetchImpl).putCalibration("cover.salon_blind", { openMs: 5000, closeMs: 4800 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/calibrations/cover.salon_blind");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ openMs: 5000, closeMs: 4800 });
  });

  it("DELETEs a calibration", async () => {
    const fetchImpl = fakeFetch(200, { data: [] });
    await expect(liveApi(fetchImpl).deleteCalibration("cover.a")).resolves.toEqual([]);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });

  it("POSTs the percent to cover-percent and returns the entity", async () => {
    const entity = { entityId: "cover.a", domain: "cover", state: "open", attributes: { estimated_position: null } };
    const fetchImpl = fakeFetch(200, { data: [entity] });
    await expect(liveApi(fetchImpl).setCoverPercent("cover.a", 50)).resolves.toEqual(entity);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/entities/cover.a/cover-percent");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ percent: 50 });
  });

  it("maps a 409 not_calibrated to a server error carrying the code", async () => {
    const fetchImpl = fakeFetch(409, { error: { code: "not_calibrated" } });
    await expect(liveApi(fetchImpl).setCoverPercent("cover.a", 50)).rejects.toMatchObject({
      kind: "server",
      message: "not_calibrated",
      status: 409,
    });
  });

  it("rejects an empty cover-percent answer", async () => {
    await expect(liveApi(fakeFetch(200, { data: [] })).setCoverPercent("cover.a", 5)).rejects.toMatchObject({ kind: "server" });
  });
});
