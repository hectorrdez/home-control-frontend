import { describe, expect, it, vi } from "vitest";
import { createLiveApi } from "./liveApi";
import { ApiError } from "./types";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function clientWith(fetchImpl: unknown) {
  return createLiveApi({ baseUrl: "http://panel.test", token: "secret-token", fetchImpl: fetchImpl as typeof fetch });
}

describe("liveApi request handling", () => {
  it("sends the bearer token and calls the status endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { data: [{ online: true, message: "ok", version: "2026.1" }] }),
    );

    await clientWith(fetchImpl).getStatus();

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://panel.test/api/ha/status");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
  });

  it("unwraps the data envelope for status", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { data: [{ online: true, message: "ok", version: "2026.1" }] }),
    );

    await expect(clientWith(fetchImpl).getStatus()).resolves.toEqual({
      online: true,
      message: "ok",
      version: "2026.1",
    });
  });

  it("maps 401 to unauthorized", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: "unauthorized" }));

    const err = await clientWith(fetchImpl).getStatus().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe("unauthorized");
    expect((err as ApiError).status).toBe(401);
  });

  it("maps ha_unauthorized (502) to unauthorized", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(502, { error: { code: "ha_unauthorized" } }));

    const err = await clientWith(fetchImpl).getStatus().catch((e: unknown) => e);

    expect((err as ApiError).kind).toBe("unauthorized");
  });

  it("maps 404 to not_found", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { error: "entity_not_found" }));

    const err = await clientWith(fetchImpl).runAction("light.x", { action: "toggle" }).catch((e: unknown) => e);

    expect((err as ApiError).kind).toBe("not_found");
  });

  it("maps 503 to unavailable", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, { error: { code: "ha_unreachable" } }));

    const err = await clientWith(fetchImpl).getStatus().catch((e: unknown) => e);

    expect((err as ApiError).kind).toBe("unavailable");
    expect((err as ApiError).message).toBe("ha_unreachable");
  });

  it("maps other failures to server", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, {}));

    const err = await clientWith(fetchImpl).getStatus().catch((e: unknown) => e);

    expect((err as ApiError).kind).toBe("server");
  });

  it("maps a thrown fetch to network", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const err = await clientWith(fetchImpl).getStatus().catch((e: unknown) => e);

    expect((err as ApiError).kind).toBe("network");
  });

  it("builds the entity query from the filter", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { data: [] }));

    await clientWith(fetchImpl).getEntities({ domain: "light", area: "living" });

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("http://panel.test/api/entities?domain=light&area=living");
  });

  it("groups entities by area and puts entities without an area under unassigned", async () => {
    const entity = (entityId: string, area: string | null, areaName?: string) => ({
      entityId,
      domain: "light",
      name: entityId,
      state: "on",
      attributes: {},
      area,
      areaName,
      lastChanged: "2026-11-06T10:00:00Z",
    });
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        data: [entity("light.a", "living", "Living"), entity("light.b", null), entity("light.c", "living", "Living")],
      }),
    );

    const areas = await clientWith(fetchImpl).getAreas();

    expect(areas.map((a) => [a.areaId, a.name, a.entities.length])).toEqual([
      ["living", "Living", 2],
      ["unassigned", "Unassigned", 1],
    ]);
  });
});
