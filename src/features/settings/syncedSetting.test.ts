import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeApi } from "@/api/HomeApi";
import { getClientId } from "@/api/clientIdentity";
import { publishServerEvent, publishStreamState } from "@/api/serverEvents";
import { ApiError, SettingConflictError, type Setting } from "@/api/types";
import { createSyncedSetting, type SyncedSetting } from "./syncedSetting";
import { useSyncedSetting } from "./useSyncedSetting";

// Feature 134: fake HomeApi (settings calls only), fake localStorage, fake timers.
const KEY = "a.b";
const LEGACY = "legacy.b";
const parseNumbers = (raw: unknown): number[] | null =>
  Array.isArray(raw) && raw.every((n) => typeof n === "number") ? (raw as number[]) : null;

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

function setting(value: unknown, version: number): Setting {
  return { key: KEY, value, version, updatedAt: "2026-11-08T10:00:00Z", updatedBy: null };
}

function fakeApi(over: { getSetting?: unknown; putSetting?: unknown } = {}) {
  let version = 0;
  const api = {
    getSetting: vi.fn(async (_key: string) => null as Setting | null),
    putSetting: vi.fn(async (_key: string, value: unknown, _base?: number) => setting(value, ++version)),
    deleteSetting: vi.fn(async () => undefined),
  };
  return Object.assign(api, over) as typeof api;
}

type FakeApi = ReturnType<typeof fakeApi>;
const asApi = (api: FakeApi) => api as unknown as HomeApi;

let storage: ReturnType<typeof fakeStorage>;
let stores: SyncedSetting<number[]>[] = [];

function makeStore(extra: { legacyKey?: string } = {}) {
  const store = createSyncedSetting<number[]>({ key: KEY, parse: parseNumbers, debounceMs: 500, ...extra });
  stores.push(store);
  return store;
}

beforeEach(() => {
  vi.useFakeTimers();
  storage = fakeStorage();
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  for (const store of stores) store.stop();
  stores = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("synced setting store (feature 134)", () => {
  it("reads the cache synchronously before start and ignores an invalid cache", () => {
    storage.setItem(`hc.setting.${KEY}`, JSON.stringify({ v: 1, value: [1, 2], version: 3, pending: false }));
    expect(makeStore().get()).toEqual([1, 2]);

    storage.setItem(`hc.setting.${KEY}`, JSON.stringify({ v: 1, value: "bad", version: 3, pending: false }));
    expect(makeStore().get()).toBeNull();
  });

  it("set updates get and notifies at once, and sends one debounced PUT for rapid sets", async () => {
    const api = fakeApi();
    const store = makeStore();
    await store.start(asApi(api));
    const listener = vi.fn();
    store.subscribe(listener);

    store.set([1]);
    store.set([2]);
    store.set([3]);
    expect(store.get()).toEqual([3]);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(api.putSetting).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(api.putSetting).toHaveBeenCalledTimes(1);
    expect(api.putSetting).toHaveBeenCalledWith(KEY, [3], undefined);
    expect(store.status()).toBe("synced");
  });

  it("does not PUT when the value equals the current one", async () => {
    const api = fakeApi();
    const store = makeStore();
    await store.start(asApi(api));
    store.set([1]);
    await vi.advanceTimersByTimeAsync(500);
    store.set([1]);
    await vi.advanceTimersByTimeAsync(500);
    expect(api.putSetting).toHaveBeenCalledTimes(1);
  });

  it("applies the server value and version when a write conflicts", async () => {
    const api = fakeApi({
      putSetting: vi.fn(async () => {
        throw new SettingConflictError(setting([9], 5));
      }),
    });
    const store = makeStore();
    await store.start(asApi(api));
    store.set([1]);
    await vi.advanceTimersByTimeAsync(500);
    expect(store.get()).toEqual([9]);
    expect(store.status()).toBe("synced");
    expect(JSON.parse(storage.getItem(`hc.setting.${KEY}`) ?? "{}")).toMatchObject({ value: [9], version: 5, pending: false });
  });

  it("keeps an offline write pending and retries after 30 s", async () => {
    const api = fakeApi();
    api.putSetting.mockRejectedValueOnce(new ApiError("network", "fetch failed"));
    const store = makeStore();
    await store.start(asApi(api));
    store.set([4]);
    await vi.advanceTimersByTimeAsync(500);
    expect(store.status()).toBe("offline");
    expect(JSON.parse(storage.getItem(`hc.setting.${KEY}`) ?? "{}")).toMatchObject({ value: [4], pending: true });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.putSetting).toHaveBeenCalledTimes(2);
    expect(store.status()).toBe("synced");
  });

  it("retries a pending write on the next stream ready after a drop", async () => {
    const api = fakeApi();
    api.putSetting.mockRejectedValueOnce(new ApiError("unavailable", "unavailable", 503));
    const store = makeStore();
    await store.start(asApi(api));
    store.set([4]);
    await vi.advanceTimersByTimeAsync(500);
    expect(store.status()).toBe("offline");

    publishStreamState("reconnecting");
    publishStreamState("open");
    await vi.advanceTimersByTimeAsync(0);
    expect(store.status()).toBe("synced");
    expect(api.putSetting).toHaveBeenCalledTimes(2);
  });

  it("adopts the server value and version on start", async () => {
    const api = fakeApi({ getSetting: vi.fn(async () => setting([7], 4)) });
    const store = makeStore();
    await store.start(asApi(api));
    expect(store.get()).toEqual([7]);
    expect(api.putSetting).not.toHaveBeenCalled();
    expect(JSON.parse(storage.getItem(`hc.setting.${KEY}`) ?? "{}")).toMatchObject({ value: [7], version: 4 });
  });

  it("pushes a pending cached value with its cached version on start", async () => {
    storage.setItem(`hc.setting.${KEY}`, JSON.stringify({ v: 1, value: [5], version: 2, pending: true }));
    const api = fakeApi({ getSetting: vi.fn(async () => setting([7], 2)) });
    const store = makeStore();
    await store.start(asApi(api));
    expect(api.putSetting).toHaveBeenCalledWith(KEY, [5], 2);
    expect(store.get()).toEqual([5]);
    expect(store.status()).toBe("synced");
  });

  it("imports the legacy key once when the server is empty, and keeps the legacy key", async () => {
    storage.setItem(LEGACY, JSON.stringify([4]));
    const api = fakeApi();
    const store = makeStore({ legacyKey: LEGACY });
    await store.start(asApi(api));
    expect(api.putSetting).toHaveBeenCalledTimes(1);
    expect(api.putSetting).toHaveBeenCalledWith(KEY, [4]);
    expect(storage.getItem(LEGACY)).toBe(JSON.stringify([4]));
    expect(storage.getItem(`hc.migrated.${KEY}`)).toBe("1");

    stores.forEach((s) => s.stop());
    api.getSetting.mockResolvedValue(setting([4], 1));
    const again = makeStore({ legacyKey: LEGACY });
    await again.start(asApi(api));
    expect(api.putSetting).toHaveBeenCalledTimes(1);
    expect(again.get()).toEqual([4]);
  });

  it("ignores an invalid legacy value", async () => {
    storage.setItem(LEGACY, JSON.stringify("nope"));
    const api = fakeApi();
    await makeStore({ legacyKey: LEGACY }).start(asApi(api));
    expect(api.putSetting).not.toHaveBeenCalled();
  });

  it("becomes unavailable on a backend without settings, works locally and makes no more calls", async () => {
    const api = fakeApi({ getSetting: vi.fn(async () => Promise.reject(new ApiError("not_found", "not_found", 404))) });
    const store = makeStore();
    await store.start(asApi(api));
    expect(store.status()).toBe("unavailable");

    store.set([1]);
    expect(store.get()).toEqual([1]);
    publishStreamState("reconnecting");
    publishStreamState("open");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.putSetting).not.toHaveBeenCalled();
    expect(api.getSetting).toHaveBeenCalledTimes(1);
  });

  it("refetches the key on a remote change and notifies, but ignores other keys and own changes", async () => {
    const api = fakeApi({ getSetting: vi.fn(async () => setting([1], 1)) });
    const store = makeStore();
    await store.start(asApi(api));
    const listener = vi.fn();
    store.subscribe(listener);

    api.getSetting.mockResolvedValue(setting([2], 2));
    publishServerEvent({ type: "resource_changed", resource: "settings", keys: [KEY], by: "other-device" });
    await vi.advanceTimersByTimeAsync(200);
    expect(store.get()).toEqual([2]);
    expect(listener).toHaveBeenCalled();

    const calls = api.getSetting.mock.calls.length;
    publishServerEvent({ type: "resource_changed", resource: "settings", keys: ["x.y"], by: "other-device" });
    publishServerEvent({ type: "resource_changed", resource: "settings", keys: [KEY], by: getClientId() });
    publishServerEvent({ type: "resource_changed", resource: "aliases", keys: [KEY], by: "other-device" });
    await vi.advanceTimersByTimeAsync(200);
    expect(api.getSetting.mock.calls.length).toBe(calls);
  });

  it("keeps working in memory when storage throws everywhere", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    const api = fakeApi();
    const store = makeStore();
    await store.start(asApi(api));
    store.set([8]);
    expect(store.get()).toEqual([8]);
    await vi.advanceTimersByTimeAsync(500);
    expect(api.putSetting).toHaveBeenCalledWith(KEY, [8], undefined);
  });
});

describe("useSyncedSetting (feature 134)", () => {
  it("re-renders when the value changes remotely", async () => {
    const api = fakeApi({ getSetting: vi.fn(async () => setting([1], 1)) });
    const store = makeStore();
    await store.start(asApi(api));
    const { result } = renderHook(() => useSyncedSetting(store));
    expect(result.current[0]).toEqual([1]);

    api.getSetting.mockResolvedValue(setting([3], 2));
    await act(async () => {
      publishServerEvent({ type: "resource_changed", resource: "settings", keys: [KEY], by: "other-device" });
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(result.current[0]).toEqual([3]);
  });
});
