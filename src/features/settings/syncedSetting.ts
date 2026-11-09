import type { HomeApi } from "@/api/HomeApi";
import { isOwnChange, subscribeServerEvents, subscribeStreamState } from "@/api/serverEvents";
import { ApiError, SettingConflictError, type ConnectionState, type ServerEvent, type Setting } from "@/api/types";

// Feature 134: one generic store per shared setting (backend 017). Synchronous get/set for the UI; the server is the
// source of truth; localStorage `hc.setting.<key>` is only an offline cache; legacy keys are imported once and kept.

export type SyncedStatus = "local" | "synced" | "pending" | "offline" | "unavailable";

export interface SyncedSettingOptions<T> {
  key: string;
  legacyKey?: string;
  parse: (raw: unknown) => T | null;
  debounceMs?: number;
}

export interface SyncedSetting<T> {
  get(): T | null;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
  status(): SyncedStatus;
  start(api: HomeApi): Promise<void>;
  stop(): void;
  // Drops the in-memory copy so the next get() re-reads the localStorage cache (tests and sign-out-like resets).
  forget(): void;
}

interface CachedRecord {
  v: 1;
  value: unknown;
  version: number | null;
  pending: boolean;
}

interface Memory<T> {
  value: T;
  version: number | null;
  pending: boolean;
}

const RETRY_MS = 30_000;
const REFETCH_MS = 200;
const CACHE_PREFIX = "hc.setting.";
const MIGRATED_PREFIX = "hc.migrated.";

// Feature 134: stores register here; SyncedSettingsProvider starts them once the api is ready.
const registry = new Set<SyncedSetting<unknown>>();

export function registerSyncedSetting(store: SyncedSetting<unknown>): void {
  registry.add(store);
}

export function registeredSyncedSettings(): SyncedSetting<unknown>[] {
  return [...registry];
}

// Storage can throw (private mode, blocked site data): every access is guarded and the store keeps working in memory.
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // memory only
  }
}

function removeRaw(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // memory only
  }
}

function readCache(key: string): CachedRecord | null {
  const raw = readRaw(CACHE_PREFIX + key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedRecord> | null;
    if (!parsed || parsed.v !== 1 || !("value" in parsed)) return null;
    return {
      v: 1,
      value: parsed.value,
      version: typeof parsed.version === "number" ? parsed.version : null,
      pending: parsed.pending === true,
    };
  } catch {
    return null;
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true; // a thrown transport error (fetch failure)
  return error.kind === "network" || error.kind === "unavailable" || (error.kind === "server" && (error.status ?? 0) >= 500);
}

export function createSyncedSetting<T>({ key, legacyKey, parse, debounceMs = 500 }: SyncedSettingOptions<T>): SyncedSetting<T> {
  let loaded = false;
  let memory: Memory<T> | null = null;
  let api: HomeApi | undefined;
  // Bumped by stop(): async work started before it is ignored when it finishes.
  let generation = 0;
  let unavailable = false;
  let offline = false;
  let inFlight = false;
  let flushAgain = false;
  let streamDown = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let refetchTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribers: Array<() => void> = [];
  const listeners = new Set<() => void>();

  const cacheKey = CACHE_PREFIX + key;
  const migratedKey = MIGRATED_PREFIX + key;

  function ensureLoaded(): void {
    if (loaded) return;
    loaded = true;
    const cached = readCache(key);
    if (!cached) return;
    const value = parse(cached.value);
    if (value !== null) memory = { value, version: cached.version, pending: cached.pending };
  }

  function persist(): void {
    if (!memory) {
      removeRaw(cacheKey);
      return;
    }
    const record: CachedRecord = { v: 1, value: memory.value, version: memory.version, pending: memory.pending };
    writeRaw(cacheKey, JSON.stringify(record));
  }

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  function replace(next: Memory<T> | null): void {
    memory = next;
    persist();
    notify();
  }

  function clearTimers(): void {
    clearTimeout(debounceTimer);
    clearTimeout(retryTimer);
    clearTimeout(refetchTimer);
    debounceTimer = undefined;
    retryTimer = undefined;
    refetchTimer = undefined;
  }

  function markUnavailable(): void {
    unavailable = true;
    offline = false;
    clearTimers();
    if (memory?.pending) memory = { ...memory, pending: false };
    persist();
    notify();
  }

  // Server value wins: adopt it when it parses, otherwise the key counts as absent.
  function adoptServer(server: Setting | null): void {
    const value = server ? parse(server.value) : null;
    if (server && value !== null) replace({ value, version: server.version, pending: false });
    else if (memory !== null) replace(null);
  }

  function scheduleFlush(delay: number): void {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void flush(), delay);
  }

  async function flush(): Promise<void> {
    clearTimers();
    const client = api;
    if (!client || unavailable || !memory?.pending) return;
    if (inFlight) {
      flushAgain = true;
      return;
    }
    const run = generation;
    const sent = memory;
    inFlight = true;
    try {
      const stored = await client.putSetting(key, sent.value, sent.version ?? undefined);
      if (run !== generation) return;
      offline = false;
      if (memory === sent) replace({ value: sent.value, version: stored.version, pending: false });
      else if (memory) {
        // A newer local edit arrived during the request: it stays pending and goes out with the new version.
        memory = { ...memory, version: stored.version };
        persist();
      }
    } catch (error) {
      if (run !== generation) return;
      onWriteFailure(error, sent);
    } finally {
      inFlight = false;
      if (flushAgain && run === generation) {
        flushAgain = false;
        scheduleFlush(0);
      }
    }
  }

  function onWriteFailure(error: unknown, sent: Memory<T>): void {
    if (error instanceof SettingConflictError) {
      offline = false;
      const current = error.current;
      const value = current ? parse(current.value) : null;
      if (current && value !== null) replace({ value, version: current.version, pending: false });
      else if (current === null) {
        // The key was deleted on the server: last write wins with our value.
        replace({ value: sent.value, version: null, pending: true });
        scheduleFlush(0);
      } else replace(null);
      return;
    }
    if (error instanceof ApiError && error.kind === "not_found") {
      markUnavailable();
      return;
    }
    if (isRetryable(error)) {
      offline = true;
      persist();
      notify();
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void flush(), RETRY_MS);
      return;
    }
    // Rejected by the server (e.g. too large, bad key): stop retrying, keep the value locally.
    if (memory) replace({ ...memory, pending: false });
  }

  function legacyValue(): T | null {
    if (!legacyKey) return null;
    const raw = readRaw(legacyKey);
    if (!raw) return null;
    try {
      return parse(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }

  // Reconciles with the server: adopt its value, push pending offline edits, or import the local value once.
  async function sync(): Promise<void> {
    const client = api;
    if (!client || unavailable) return;
    const run = generation;
    try {
      const server = await client.getSetting(key);
      if (run !== generation) return;
      offline = false;
      if (server) {
        if (memory?.pending) await flush();
        else adoptServer(server);
        return;
      }
      if (!memory?.pending && readRaw(migratedKey) === "1") return;
      const snapshot = memory;
      const value = snapshot ? snapshot.value : legacyValue();
      if (value === null) return;
      const stored = await client.putSetting(key, value);
      if (run !== generation) return;
      writeRaw(migratedKey, "1");
      if (memory === snapshot) replace({ value, version: stored.version, pending: false });
      else if (memory) {
        memory = { ...memory, version: stored.version };
        persist();
      }
    } catch (error) {
      if (run !== generation) return;
      if (error instanceof ApiError && error.kind === "not_found") {
        markUnavailable();
        return;
      }
      offline = true;
      notify();
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void sync(), RETRY_MS);
    }
  }

  // Remote change for this key (another client wrote it): refetch unless a local edit is still waiting to go out.
  async function refetch(): Promise<void> {
    const client = api;
    if (!client || unavailable || memory?.pending) return;
    const run = generation;
    try {
      const server = await client.getSetting(key);
      if (run !== generation || memory?.pending) return;
      adoptServer(server);
    } catch {
      // keep the current value; the next change or reconnect retries
    }
  }

  function onServerEvent(event: ServerEvent): void {
    if (event.type !== "resource_changed" || event.resource !== "settings") return;
    if (event.keys.length > 0 && !event.keys.includes(key)) return;
    if (isOwnChange(event)) return;
    clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => void refetch(), REFETCH_MS);
  }

  // A stream that was down and is open again: re-sync once (and push anything pending).
  function onStreamState(state: ConnectionState): void {
    if (state === "reconnecting") {
      streamDown = true;
      return;
    }
    if (state === "open" && streamDown) {
      streamDown = false;
      if (api && !unavailable) void sync();
    }
  }

  function stop(): void {
    generation++;
    clearTimers();
    for (const off of unsubscribers) off();
    unsubscribers = [];
    api = undefined;
    inFlight = false;
    flushAgain = false;
    streamDown = false;
  }

  async function start(next: HomeApi): Promise<void> {
    ensureLoaded();
    stop();
    api = next;
    unavailable = false;
    offline = false;
    unsubscribers = [subscribeServerEvents(onServerEvent), subscribeStreamState(onStreamState)];
    await sync();
  }

  function forget(): void {
    loaded = false;
    memory = null;
  }

  return {
    get(): T | null {
      ensureLoaded();
      return memory ? memory.value : null;
    },

    set(value: T): void {
      ensureLoaded();
      if (memory && sameJson(memory.value, value)) return;
      memory = { value, version: memory?.version ?? null, pending: !unavailable };
      persist();
      notify();
      if (!unavailable) scheduleFlush(debounceMs);
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    status(): SyncedStatus {
      if (unavailable) return "unavailable";
      if (offline) return "offline";
      if (memory?.pending) return "pending";
      if (memory && memory.version !== null) return "synced";
      return "local";
    },

    start,
    stop,
    forget,
  };
}
