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

  it("reads areas from /api/areas and maps the null unassigned group to unassigned", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        data: [
          { areaId: "living", name: "Living", entities: [] },
          { areaId: null, name: "Unassigned", entities: [] },
        ],
      }),
    );

    const areas = await clientWith(fetchImpl).getAreas();

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("http://panel.test/api/areas");
    expect(areas.map((a) => [a.areaId, a.name])).toEqual([
      ["living", "Living"],
      ["unassigned", "Unassigned"],
    ]);
  });
});

describe("liveApi realtime subscribe (105)", () => {
  class FakeSource {
    static instances: FakeSource[] = [];
    listeners: Record<string, (event: { data?: string }) => void> = {};
    onerror: (() => void) | null = null;
    closed = false;
    url: string;
    constructor(url: string) {
      this.url = url;
      FakeSource.instances.push(this);
    }
    addEventListener(type: string, fn: (event: { data?: string }) => void) {
      this.listeners[type] = fn;
    }
    close() {
      this.closed = true;
    }
  }

  it("connects with ?token=, reports open on ready, merges events and reconnects after an error", () => {
    vi.useFakeTimers();
    FakeSource.instances = [];
    const api = createLiveApi({
      baseUrl: "http://panel.test",
      token: "tok",
      eventSourceFactory: (url) => new FakeSource(url) as unknown as EventSource,
    });
    const events: string[] = [];
    const states: string[] = [];
    const stop = api.subscribe(
      (e) => events.push(e.entityId),
      (s) => states.push(s),
    );

    expect(FakeSource.instances[0].url).toBe("http://panel.test/api/stream?token=tok");
    FakeSource.instances[0].listeners.ready({});
    FakeSource.instances[0].listeners.state_changed({ data: '{"entityId":"light.a","state":"on"}' });
    FakeSource.instances[0].onerror?.();
    expect(FakeSource.instances[0].closed).toBe(true);
    vi.advanceTimersByTime(1300);
    expect(FakeSource.instances).toHaveLength(2);
    FakeSource.instances[1].listeners.ready({});

    expect(events).toEqual(["light.a"]);
    expect(states).toEqual(["open", "reconnecting", "open"]);

    stop();
    expect(FakeSource.instances[1].closed).toBe(true);
    vi.useRealTimers();
  });
});

describe("liveApi history (feature 112, backend GET /api/history)", () => {
  it("requests comma-separated ids and hours with the bearer token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { data: [] }));

    await clientWith(fetchImpl).getHistory(["sensor.a", "sensor.b"], 24);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://panel.test/api/history?entityIds=sensor.a%2Csensor.b&hours=24");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
  });

  it("parses string values to numbers, drops non-numeric points and keeps request order", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        data: [
          { entityId: "sensor.b", points: [{ t: "2026-11-06T08:00:00Z", v: "21.5" }] },
          {
            entityId: "sensor.a",
            points: [
              { t: "2026-11-06T08:00:00Z", v: "1240" },
              { t: "2026-11-06T09:00:00Z", v: "unknown" },
            ],
          },
        ],
      }),
    );

    const series = await clientWith(fetchImpl).getHistory(["sensor.b", "sensor.a"], 6);

    expect(series.map((s) => s.entityId)).toEqual(["sensor.b", "sensor.a"]);
    expect(series[0].points).toEqual([{ t: "2026-11-06T08:00:00Z", v: 21.5 }]);
    expect(series[1].points).toEqual([{ t: "2026-11-06T08:00:00Z", v: 1240 }]);
  });

  it("maps 404 to not_found so the panel shows HISTORY NOT AVAILABLE", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { error: "not_found" }));

    const err = await clientWith(fetchImpl).getHistory(["sensor.a"], 24).catch((e: unknown) => e);

    expect((err as ApiError).kind).toBe("not_found");
    expect((err as ApiError).status).toBe(404);
  });

  it("alias calls hit /api/aliases with encoded ids, PUT body and DELETE", async () => {
    const list = [{ entityId: "light.a b", alias: "Lamp" }];
    const fetchImpl = vi.fn(async () => jsonResponse(200, { data: list }));
    const api = clientWith(fetchImpl);

    await expect(api.getAliases()).resolves.toEqual(list);
    await expect(api.setAlias("light.a b", "Lamp")).resolves.toEqual(list);
    await expect(api.deleteAlias("light.a b")).resolves.toEqual(list);

    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe("http://panel.test/api/aliases");
    expect(calls[1][0]).toBe("http://panel.test/api/aliases/light.a%20b");
    expect(calls[1][1].method).toBe("PUT");
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ alias: "Lamp" });
    expect(calls[2][1].method).toBe("DELETE");
  });

  it("getAliases maps 404 to not_found", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { error: "not_found" }));
    const err = await clientWith(fetchImpl).getAliases().catch((e: unknown) => e);
    expect((err as ApiError).kind).toBe("not_found");
  });
});
