import { describe, expect, it, vi } from "vitest";
import { createLiveApi } from "./liveApi";

// Feature 128: request shapes of the alert-rules calls (backend 012 answers with data arrays).
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

const rule = { id: "r1", entityId: "light.office_desk", trigger: { type: "connects" }, level: "high" } as const;

describe("live alert rules API (feature 128)", () => {
  it("GETs the rule list", async () => {
    const fetchImpl = fakeFetch(200, { data: [rule] });
    await expect(liveApi(fetchImpl).listAlertRules()).resolves.toEqual([rule]);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/alert-rules");
  });

  it("POSTs a new rule and returns the stored one from the data array", async () => {
    const fetchImpl = fakeFetch(200, { data: [rule] });
    const input = { entityId: "light.office_desk", trigger: { type: "connects" as const }, level: "high" as const };
    await expect(liveApi(fetchImpl).createAlertRule(input)).resolves.toEqual(rule);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/alert-rules");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it("PUTs the rule by id and returns the stored rule", async () => {
    const fetchImpl = fakeFetch(200, { data: [{ ...rule, level: "low" }] });
    const input = { entityId: "light.office_desk", trigger: { type: "connects" as const }, level: "low" as const };
    await expect(liveApi(fetchImpl).updateAlertRule("r1", input)).resolves.toMatchObject({ level: "low" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/alert-rules/r1");
    expect(init.method).toBe("PUT");
  });

  it("DELETEs a rule by id", async () => {
    const fetchImpl = fakeFetch(200, { data: [] });
    await expect(liveApi(fetchImpl).deleteAlertRule("r1")).resolves.toBeUndefined();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/alert-rules/r1");
    expect(init.method).toBe("DELETE");
  });

  it("surfaces duplicate_rule as the error message", async () => {
    const fetchImpl = fakeFetch(409, { error: { code: "duplicate_rule", message: "x" } });
    await expect(
      liveApi(fetchImpl).createAlertRule({ entityId: "light.a", trigger: { type: "connects" }, level: "low" }),
    ).rejects.toMatchObject({ message: "duplicate_rule", status: 409 });
  });

  it("maps a missing endpoint (404) to not_found so the editor shows ALERTS UNAVAILABLE", async () => {
    const fetchImpl = fakeFetch(404, { error: { code: "not_found" } });
    await expect(liveApi(fetchImpl).listAlertRules()).rejects.toMatchObject({ kind: "not_found" });
  });
});
