import { describe, expect, it, vi } from "vitest";
import { createLiveApi } from "./liveApi";
import { getClientId } from "./clientIdentity";
import type { ServerEvent } from "./types";

class FakeSource {
  static instances: FakeSource[] = [];
  listeners: Record<string, (event: { data?: string }) => void> = {};
  onerror: (() => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSource.instances.push(this);
  }
  addEventListener(type: string, fn: (event: { data?: string }) => void) {
    this.listeners[type] = fn;
  }
  close() {}
}

describe("liveApi client identity headers (feature 132)", () => {
  it("sends X-Client-Id and X-Client-Name on every request", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const api = createLiveApi({ baseUrl: "http://panel.test", token: "t", fetchImpl: fetchImpl as unknown as typeof fetch });
    await api.getEntities();

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Client-Id"]).toBe(getClientId());
    expect(headers["X-Client-Name"]).toEqual(expect.any(String));
    expect(headers["X-Client-Name"].length).toBeLessThanOrEqual(40);
  });

  it("adds clientId to the stream URL", () => {
    FakeSource.instances = [];
    const api = createLiveApi({
      baseUrl: "http://panel.test",
      token: "tok",
      eventSourceFactory: (url) => new FakeSource(url) as unknown as EventSource,
    });
    const stop = api.subscribe(() => undefined, () => undefined);
    expect(FakeSource.instances[0].url).toBe(`http://panel.test/api/stream?token=tok&clientId=${getClientId()}`);
    stop();
  });
});

describe("liveApi server events (feature 132)", () => {
  it("delivers parsed frames to onServerEvent and keeps entity events separate", () => {
    FakeSource.instances = [];
    const api = createLiveApi({
      baseUrl: "http://panel.test",
      token: "tok",
      eventSourceFactory: (url) => new FakeSource(url) as unknown as EventSource,
    });
    const entities: string[] = [];
    const serverEvents: ServerEvent[] = [];
    const stop = api.subscribe(
      (e) => entities.push(e.entityId),
      () => undefined,
      (e) => serverEvents.push(e),
    );
    const source = FakeSource.instances[0];

    source.listeners.resource_changed({ data: JSON.stringify({ resource: "aliases", keys: ["light.a"], by: "other" }) });
    source.listeners.ha_link({ data: JSON.stringify({ connected: true, at: "t" }) });
    source.listeners.state_changed({ data: '{"entityId":"light.a","state":"on"}' });
    source.listeners.resource_changed({ data: "garbage" });

    expect(serverEvents).toEqual([
      { type: "resource_changed", resource: "aliases", keys: ["light.a"], by: "other" },
      { type: "ha_link", connected: true, at: "t" },
    ]);
    expect(entities).toEqual(["light.a"]);
    stop();
  });

  it("works without the third callback", () => {
    FakeSource.instances = [];
    const api = createLiveApi({
      baseUrl: "http://panel.test",
      token: "tok",
      eventSourceFactory: (url) => new FakeSource(url) as unknown as EventSource,
    });
    const stop = api.subscribe(() => undefined, () => undefined);
    expect(() => FakeSource.instances[0].listeners.ha_link({ data: '{"connected":false,"at":"t"}' })).not.toThrow();
    stop();
  });
});
