import { describe, expect, it } from "vitest";
import { createMockApi } from "./createMockApi";
import { ApiError } from "../types";

// Feature 164: mock reloadIntegrations (first call adds one device; error / slow / unavailable-reload scenarios).
describe("mock reloadIntegrations", () => {
  it("adds one device on the first reload and none on the next", async () => {
    const api = createMockApi({ scenario: "default", actionDelayMs: 0, streamDelayMs: 0 });
    const before = (await api.getEntities()).length;

    const first = await api.reloadIntegrations();
    expect(first.entries.every((e) => e.ok)).toBe(true);
    expect(first.entities).toEqual({ before, after: before + 1 });
    expect((await api.getEntities()).some((e) => e.entityId === "light.smart_life_bulb")).toBe(true);

    const second = await api.reloadIntegrations();
    expect(second.entities).toEqual({ before: before + 1, after: before + 1 });
  });

  it("is visible in the areas refetch after the first reload", async () => {
    const api = createMockApi({ scenario: "default", actionDelayMs: 0, streamDelayMs: 0 });
    await api.reloadIntegrations();
    const areas = await api.getAreas();
    const office = areas.find((a) => a.areaId === "office");
    expect(office?.entities.some((e) => e.entityId === "light.smart_life_bulb")).toBe(true);
  });

  it("rejects with 502 under the error scenario", async () => {
    const api = createMockApi({ scenario: "error" });
    const err = await api.reloadIntegrations().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(502);
  });

  it("rejects with 404 under the unavailable-reload scenario", async () => {
    const api = createMockApi({ scenario: "unavailable-reload" });
    const err = await api.reloadIntegrations().catch((e: unknown) => e);
    expect((err as ApiError).kind).toBe("not_found");
    expect((err as ApiError).status).toBe(404);
  });

  it("answers after the normal delay, and after the slow delay in the slow scenario", async () => {
    const normal = createMockApi({ scenario: "default", slowMs: 400 });
    const t0 = Date.now();
    await normal.reloadIntegrations();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(700);

    const slow = createMockApi({ scenario: "slow", slowMs: 1000 });
    const t1 = Date.now();
    await slow.reloadIntegrations();
    expect(Date.now() - t1).toBeGreaterThanOrEqual(950);
  }, 10_000);
});
