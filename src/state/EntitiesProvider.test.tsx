import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import type { Area, ConnectionState, Entity } from "@/api/types";
import { SETTLE_TIMEOUT_MS } from "./entities";
import { EntitiesProvider, useEntities } from "./EntitiesProvider";

const light = (id: string, state = "off"): Entity => ({
  entityId: id,
  domain: "light",
  name: id,
  state,
  attributes: {},
  area: "kitchen",
  lastChanged: "2026-11-06T10:00:00.000Z",
});

const areas: Area[] = [{ areaId: "kitchen", name: "Kitchen", entities: [light("light.k")] }];

interface Harness {
  api: HomeApi;
  emitEntity: (e: Entity) => void;
  emitConnection: (s: ConnectionState) => void;
  getAreas: ReturnType<typeof vi.fn>;
  runAction: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
}

function harness(overrides: { getAreas?: () => Promise<Area[]>; runAction?: HomeApi["runAction"] } = {}): Harness {
  let onEntity: (e: Entity) => void = () => undefined;
  let onConnection: (s: ConnectionState) => void = () => undefined;
  const getAreas = vi.fn(overrides.getAreas ?? (async () => areas));
  const runAction = vi.fn(overrides.runAction ?? (async (id: string) => light(id, "on")));
  const unsubscribe = vi.fn();
  const api = {
    getStatus: vi.fn(),
    getAreas,
    getEntities: vi.fn(),
    runAction,
    getHistory: vi.fn(),
    listEvents: vi.fn(async () => []),
    subscribe: vi.fn((e: (x: Entity) => void, c: (s: ConnectionState) => void) => {
      onEntity = e;
      onConnection = c;
      return unsubscribe;
    }),
  } as unknown as HomeApi;
  return {
    api,
    emitEntity: (e) => act(() => onEntity(e)),
    emitConnection: (s) => act(() => onConnection(s)),
    getAreas,
    runAction,
    unsubscribe,
  };
}

const wrapper = (api: HomeApi) => ({ children }: { children: ReactNode }) =>
  <ApiProvider api={api}>
    <EntitiesProvider>{children}</EntitiesProvider>
  </ApiProvider>;

describe("EntitiesProvider", () => {
  it("throws when useEntities is used outside the provider", () => {
    expect(() => renderHook(() => useEntities())).toThrow("useEntities must be used inside EntitiesProvider");
  });

  it("loads the areas on mount and becomes ready", async () => {
    const h = harness();
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });

    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(h.getAreas).toHaveBeenCalledTimes(1);
    expect(result.current.state.entities["light.k"]).toBeDefined();
    expect(result.current.connection).toBe("open");
    expect(result.current.selectedArea).toBeNull();
    expect(result.current.selectedGroup).toBe("all");
  });

  it("reports an error status when the areas cannot be loaded", async () => {
    const h = harness({ getAreas: () => Promise.reject(new Error("down")) });
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });

    await waitFor(() => expect(result.current.state.status).toBe("error"));
  });

  it("reload fetches the areas again and the selection setters update the view state", async () => {
    const h = harness();
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    act(() => result.current.reload());
    await waitFor(() => expect(h.getAreas).toHaveBeenCalledTimes(2));

    act(() => {
      result.current.setSelectedArea("kitchen");
      result.current.setSelectedGroup("security");
    });
    expect(result.current.selectedArea).toBe("kitchen");
    expect(result.current.selectedGroup).toBe("security");
  });

  it("merges stream entity updates into the store", async () => {
    const h = harness();
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    h.emitEntity(light("light.new", "on"));
    expect(result.current.state.entities["light.new"]?.state).toBe("on");
  });

  it("tracks the connection and refreshes the areas once after a reconnect", async () => {
    const h = harness();
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    h.emitConnection("reconnecting");
    expect(result.current.connection).toBe("reconnecting");
    expect(h.getAreas).toHaveBeenCalledTimes(1);

    h.emitConnection("open");
    await waitFor(() => expect(h.getAreas).toHaveBeenCalledTimes(2));
    expect(result.current.connection).toBe("open");
  });

  it("re-fetches the areas when the tab is shown again after more than 60 s hidden (126)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const h = harness();
      const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
      await waitFor(() => expect(result.current.state.status).toBe("ready"));

      const setVisibility = (value: "hidden" | "visible") =>
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });

      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      vi.setSystemTime(Date.now() + 30_000);
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      expect(h.getAreas).toHaveBeenCalledTimes(1);

      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      vi.setSystemTime(Date.now() + 61_000);
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      await waitFor(() => expect(h.getAreas).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    }
  });

  it("keeps the last state when the post-reconnect area refresh fails", async () => {
    let fail = false;
    const h = harness({
      getAreas: async () => {
        if (fail) throw new Error("still down");
        return areas;
      },
    });
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    fail = true;
    h.emitConnection("reconnecting");
    h.emitConnection("open");
    await waitFor(() => expect(h.getAreas).toHaveBeenCalledTimes(2));
    expect(result.current.state.status).toBe("ready");
    expect(result.current.state.entities["light.k"]).toBeDefined();
  });

  it("confirms an intent with the server entity and resolves true", async () => {
    const h = harness();
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.sendIntent(light("light.k"), { kind: "power", on: true });
    });
    expect(ok).toBe(true);
    expect(h.runAction).toHaveBeenCalledWith("light.k", { action: "turn_on" });
    expect(result.current.state.entities["light.k"].state).toBe("on");
    expect(result.current.state.pending["light.k"]).toBeUndefined();
  });

  it("rolls back and resolves false when the action fails", async () => {
    const h = harness({ runAction: () => Promise.reject(new Error("nope")) });
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.sendIntent(light("light.k"), { kind: "power", on: true });
    });
    expect(ok).toBe(false);
    expect(result.current.state.entities["light.k"].state).toBe("off");
  });
});

describe("settling after a stale answer (117)", () => {
  it("keeps the optimistic value until the matching stream event, which ends the settling", async () => {
    // The answer still shows the old state (Home Assistant answers before it applies the change).
    const h = harness({ runAction: async (id: string) => light(id, "off") });
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    let sent!: Promise<boolean>;
    act(() => {
      sent = result.current.sendIntent(light("light.k"), { kind: "power", on: true });
    });
    await act(async () => {
      await sent;
    });
    expect(result.current.state.entities["light.k"].state).toBe("on");
    expect(result.current.state.pending["light.k"]).toMatchObject({ settling: true });

    h.emitEntity({ ...light("light.k", "on"), lastChanged: "2026-11-06T10:00:05.000Z" });
    expect(result.current.state.pending["light.k"]).toBeUndefined();
    expect(result.current.state.entities["light.k"].state).toBe("on");
  });

  it("drops the settling after the timeout and takes the server state from a refresh", async () => {
    vi.useFakeTimers();
    try {
      const h = harness({ runAction: async (id: string) => light(id, "off") });
      const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.state.status).toBe("ready");

      await act(async () => {
        void result.current.sendIntent(light("light.k"), { kind: "power", on: true });
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.state.pending["light.k"]).toMatchObject({ settling: true });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SETTLE_TIMEOUT_MS);
      });
      expect(result.current.state.pending["light.k"]).toBeUndefined();
      expect(result.current.state.entities["light.k"].state).toBe("off");
      expect(h.getAreas).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Feature 164: refreshAreas is coalesced (one request in flight, at most one follow-up, shared promise).
describe("refreshAreas coalescing (164)", () => {
  // getAreas: the mount load answers at once; calls listed in `deferred` wait until released.
  function coalescingHarness(deferred: number[], afterDeferred: Area[] = areas) {
    const releases: Array<() => void> = [];
    let call = 0;
    const getAreas = vi.fn(() => {
      const index = call++;
      if (index === 0) return Promise.resolve(areas);
      if (deferred.includes(index)) {
        return new Promise<Area[]>((resolve) => releases.push(() => resolve(afterDeferred)));
      }
      return Promise.resolve(afterDeferred);
    });
    const h = harness({ getAreas: getAreas as unknown as () => Promise<Area[]> });
    return { h, getAreas, release: (i: number) => releases[i]() };
  }

  it("two calls in the same tick make one request plus one follow-up, never zero", async () => {
    const { h, getAreas } = coalescingHarness([]);
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    act(() => {
      void result.current.refreshAreas();
      void result.current.refreshAreas();
    });
    await waitFor(() => expect(getAreas).toHaveBeenCalledTimes(3));
    await new Promise((r) => setTimeout(r, 20));
    expect(getAreas).toHaveBeenCalledTimes(3);
  });

  it("concurrent callers share the same in-flight promise", async () => {
    const { h, getAreas, release } = coalescingHarness([1]);
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.refreshAreas();
      second = result.current.refreshAreas();
    });
    expect(second).toBe(first);
    expect(getAreas).toHaveBeenCalledTimes(2);
    await act(async () => release(0));
    await act(async () => {
      await first;
    });
  });

  it("a call made during an in-flight refresh is not lost: the latest state is fetched", async () => {
    const latest: Area[] = [{ areaId: "kitchen", name: "Kitchen", entities: [light("light.new", "on")] }];
    const { h, getAreas, release } = coalescingHarness([1], latest);
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    act(() => {
      void result.current.refreshAreas(); // in flight (deferred)
    });
    act(() => {
      void result.current.refreshAreas(); // during flight: marks one follow-up
    });
    await act(async () => release(0)); // in-flight answer arrives (stale for the second caller)
    await waitFor(() => expect(getAreas).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.state.entities["light.new"]).toBeDefined());
  });

  it("an SSE-reconnect refresh right after a visibility refresh still runs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { h, getAreas, release } = coalescingHarness([1]);
      const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
      await waitFor(() => expect(result.current.state.status).toBe("ready"));

      const setVisibility = (value: "hidden" | "visible") =>
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      vi.setSystemTime(Date.now() + 61_000);
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange")); // refresh 1, in flight (deferred)
      expect(getAreas).toHaveBeenCalledTimes(2);

      h.emitConnection("reconnecting");
      h.emitConnection("open"); // reconnect refresh: coalesced into one follow-up, must not be dropped
      await act(async () => release(0));
      await waitFor(() => expect(getAreas).toHaveBeenCalledTimes(3));
    } finally {
      vi.useRealTimers();
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    }
  });

  it("keeps the optimistic value of a pending action when the refresh answers the old state", async () => {
    const h = harness({ runAction: () => new Promise<Entity>(() => undefined) });
    const { result } = renderHook(() => useEntities(), { wrapper: wrapper(h.api) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    act(() => {
      void result.current.sendIntent(light("light.k"), { kind: "power", on: true });
    });
    expect(result.current.state.entities["light.k"].state).toBe("on");

    await act(async () => {
      await result.current.refreshAreas();
    });
    expect(h.getAreas).toHaveBeenCalledTimes(2);
    expect(result.current.state.entities["light.k"].state).toBe("on");
  });
});
