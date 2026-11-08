import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../types";
import { createMockApi } from "./createMockApi";

beforeEach(() => localStorage.clear());

describe("mock event log (140)", () => {
  it("records device actions newest first, with the client name", async () => {
    const api = createMockApi({ actionDelayMs: 0, streamDelayMs: 0 });
    await api.runAction("light.office_desk", { action: "turn_on" });
    const [latest] = await api.listEvents({ types: ["action"] });
    expect(latest).toMatchObject({ type: "action", entityId: "light.office_desk", payload: { action: "turn_on", ok: true } });
    expect(latest?.clientName).toBeTruthy();
  });

  it("keeps the log across instances (reload) and filters by type and limit", async () => {
    const first = createMockApi({ actionDelayMs: 0, streamDelayMs: 0 });
    await first.runAction("light.office_desk", { action: "turn_off" });
    const second = createMockApi({ actionDelayMs: 0, streamDelayMs: 0 });
    expect(await second.listEvents({ types: ["action"], limit: 1 })).toHaveLength(1);
    expect(await second.listEvents({ types: ["action"], limit: 1 })).toMatchObject([{ payload: { action: "turn_off" } }]);
  });

  it("validates the query like the backend (invalid_query) and rejects with not_found in no-events", async () => {
    const api = createMockApi({ actionDelayMs: 0, streamDelayMs: 0 });
    await expect(api.listEvents({ limit: 0 })).rejects.toMatchObject({ kind: "server", message: "invalid_query" });
    await expect(api.listEvents({ from: "2026-11-09", to: "2026-11-08" })).rejects.toBeInstanceOf(ApiError);
    await expect(api.listEvents({ types: ["Bad-Type"] })).rejects.toBeInstanceOf(ApiError);
    const none = createMockApi({ scenario: "no-events" });
    await expect(none.listEvents()).rejects.toMatchObject({ kind: "not_found", status: 404 });
  });
});
