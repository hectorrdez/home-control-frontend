import type { EntityFilter, HomeApi } from "../HomeApi";
import {
  ApiError,
  type Alias,
  type Area,
  type ConnectionState,
  type Entity,
  type EntityAction,
  type HaStatus,
  type HistorySeries,
} from "../types";
import { createFixtureEntities, createManyDeviceEntities, createRawNameEntities, FIXTURE_AREAS } from "./fixtures";
import { createPrng, hashSeed } from "./prng";
import { type Scenario } from "./scenarios";

export interface MockApiOptions {
  scenario?: Scenario;
  seed?: number;
  actionDelayMs?: number; // default 150
  slowMs?: number; // default 2000
  streamDelayMs?: number; // default 300 (slow scenario: 1500); the new state follows the action answer on the stream
}

const HA_VERSION = "2026.4.1";
const HISTORY_REF_TIME = Date.parse("2026-11-06T12:00:00.000Z");
const UNASSIGNED = "unassigned";
// Feature 126 "device-flap" scenario: the Desk plug device (switch + power sensor) drops and recovers.
const DEVICE_FLAP_IDS = ["switch.office_desk", "sensor.office_desk_power"];
const DEVICE_FLAP_DOWN_MS = 1500;
const DEVICE_FLAP_UP_MS = 4000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function createMockApi(options: MockApiOptions = {}): HomeApi {
  const scenario: Scenario = options.scenario ?? "default";
  const seed = options.seed ?? 1;
  const actionDelayMs = options.actionDelayMs ?? 150;
  const slowMs = options.slowMs ?? 2000;
  const streamDelayMs = options.streamDelayMs ?? (scenario === "slow" ? 1500 : 300);

  const entities = new Map<string, Entity>(
    scenario === "empty" ? [] : [
          ...createFixtureEntities(),
          ...(scenario === "raw-names" ? createRawNameEntities() : []),
          ...(scenario === "many-devices" ? createManyDeviceEntities() : []),
        ].map((e) => [e.entityId, e]),
  );
  const listeners = new Set<(e: Entity) => void>();
  const rng = createPrng(hashSeed(`stream:${seed}`));

  // Reads share the scenario switch: error rejects, slow delays, everything else is normal.
  async function read<T>(produce: () => T | Promise<T>): Promise<T> {
    if (scenario === "error") throw new ApiError("unavailable", "Mock scenario: error");
    if (scenario === "slow") await delay(slowMs);
    return produce();
  }

  function sorted(list: Entity[]): Entity[] {
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }

  function emit(entity: Entity) {
    for (const listener of listeners) listener(clone(entity));
  }

  function setEntityState(entityId: string, state: string) {
    const current = entities.get(entityId);
    if (!current) return;
    const next = { ...clone(current), state, lastChanged: new Date().toISOString() };
    entities.set(entityId, next);
    emit(next);
  }

  function applyAction(current: Entity, action: EntityAction): Entity {
    const params = action.params ?? {};
    const next = clone(current);
    const attrs = next.attributes;
    const isOn = next.state === "on";
    const fail = () => {
      throw new ApiError("server", "invalid_action", 400);
    };

    switch (next.domain) {
      case "light":
      case "switch":
      case "scene": {
        if (next.domain === "scene") {
          // Scenes have no on/off state: activating one only stamps lastChanged.
          if (action.action !== "turn_on") fail();
          break;
        }
        if (action.action === "toggle") next.state = isOn ? "off" : "on";
        else if (action.action === "turn_on") next.state = "on";
        else if (action.action === "turn_off") next.state = "off";
        else fail();
        if (next.domain === "light" && action.action === "turn_on" && typeof params.brightness_pct === "number") {
          attrs.brightness = Math.round((params.brightness_pct / 100) * 255);
        }
        break;
      }
      case "climate": {
        if (action.action === "set_temperature" && typeof params.temperature === "number") {
          attrs.temperature = params.temperature;
        } else if (action.action === "set_hvac_mode" && typeof params.hvac_mode === "string") {
          next.state = params.hvac_mode;
        } else if (action.action === "set_preset_mode" && typeof params.preset_mode === "string") {
          attrs.preset_mode = params.preset_mode;
        } else fail();
        break;
      }
      case "cover": {
        if (action.action === "open_cover") {
          next.state = "open";
          attrs.current_position = 100;
        } else if (action.action === "close_cover") {
          next.state = "closed";
          attrs.current_position = 0;
        } else if (action.action === "set_cover_position" && typeof params.position === "number") {
          attrs.current_position = params.position;
          next.state = params.position > 0 ? "open" : "closed";
        } else if (action.action === "stop_cover") {
          // Stop leaves the cover where it is; the mock cover reports a position, so nothing changes.
        } else fail();
        break;
      }
      case "lock": {
        // Feature 104: lock/unlock for the front door (mock only).
        if (action.action === "lock") next.state = "locked";
        else if (action.action === "unlock") next.state = "unlocked";
        else fail();
        break;
      }
      default:
        throw new ApiError("server", "domain_not_allowed", 403);
    }

    next.lastChanged = new Date().toISOString();
    return next;
  }

  function drift(current: Entity): Entity {
    if (current.state === "unavailable") return current; // a device without a link does not report values
    const next = clone(current);
    if (next.domain === "sensor" && next.attributes.device_class === "temperature") {
      const v = asNumber(next.state) ?? 0;
      next.state = (v + (rng() - 0.5) * 0.4).toFixed(1);
    } else if (next.domain === "sensor" && next.attributes.device_class === "power") {
      const v = asNumber(next.state) ?? 0;
      next.state = Math.max(0, Math.round(v + (rng() - 0.5) * 30)).toString();
    } else if (next.entityId === "binary_sensor.entry_motion") {
      next.state = rng() < 0.5 ? "on" : "off";
    } else {
      return current;
    }
    next.lastChanged = new Date().toISOString();
    return next;
  }

  function historyFor(entityId: string, hours: number): HistorySeries {
    const current = entities.get(entityId);
    const base = current ? asNumber(current.state) : null;
    const unit = current ? ((current.attributes.unit_of_measurement as string | undefined) ?? null) : null;
    if (base === null) return { entityId, unit, points: [] };

    const stepMin = hours <= 24 ? 15 : 60;
    const count = hours <= 24 ? hours * 4 : hours;
    const prng = createPrng(hashSeed(`history:${seed}:${entityId}`));
    const points = Array.from({ length: count }, (_, i) => {
      const t = new Date(HISTORY_REF_TIME - (count - 1 - i) * stepMin * 60_000).toISOString();
      const wave = Math.sin(i / 6) * (Math.abs(base) * 0.03 + 0.2);
      const noise = (prng() - 0.5) * (Math.abs(base) * 0.02 + 0.1);
      return { t, v: Math.round((base + wave + noise) * 100) / 100 };
    });
    return { entityId, unit, points };
  }

  // Feature 115: aliases persist in localStorage (per browser) and follow the backend 008 validation.
  const ALIAS_KEY = "hc.mock.aliases.v1";
  const ALIAS_CAP = 2000;
  const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;
  const aliases = new Map<string, string>(loadAliases());

  function loadAliases(): [string, string][] {
    try {
      const raw = globalThis.localStorage?.getItem(ALIAS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (row): row is Alias => typeof row?.entityId === "string" && typeof row?.alias === "string",
      ).map((row) => [row.entityId, row.alias]);
    } catch {
      return []; // corrupt or blocked storage: start empty
    }
  }

  function saveAliases(): void {
    try {
      globalThis.localStorage?.setItem(
        ALIAS_KEY,
        JSON.stringify([...aliases].map(([entityId, alias]) => ({ entityId, alias }))),
      );
    } catch {
      // storage unavailable: aliases live for this page only
    }
  }

  function aliasList(): Alias[] {
    return [...aliases].map(([entityId, alias]) => ({ entityId, alias }));
  }

  function aliasWriteGuard(): void {
    if (scenario === "alias-error") throw new ApiError("server", "aliases_write_failed", 500);
  }

  return {
    async getAliases(): Promise<Alias[]> {
      if (scenario === "error") throw new ApiError("unavailable", "Mock scenario: error");
      if (scenario === "empty") return [];
      return aliasList();
    },

    async setAlias(entityId: string, alias: string): Promise<Alias[]> {
      if (!ENTITY_ID.test(entityId)) throw new ApiError("server", "invalid_entity_id", 400);
      const trimmed = alias.trim();
      if (trimmed.length < 1 || trimmed.length > 80) throw new ApiError("server", "invalid_alias", 400);
      if (!aliases.has(entityId) && aliases.size >= ALIAS_CAP) {
        throw new ApiError("server", "too_many_aliases", 400);
      }
      await delay(actionDelayMs);
      aliasWriteGuard();
      aliases.set(entityId, trimmed);
      saveAliases();
      return aliasList();
    },

    async deleteAlias(entityId: string): Promise<Alias[]> {
      if (!ENTITY_ID.test(entityId)) throw new ApiError("server", "invalid_entity_id", 400);
      await delay(actionDelayMs);
      aliasWriteGuard();
      aliases.delete(entityId);
      saveAliases();
      return aliasList();
    },

    async getStatus(): Promise<HaStatus> {
      if (scenario === "unauthorized") throw new ApiError("unauthorized", "Mock scenario: unauthorized", 401);
      if (scenario === "error") throw new ApiError("unavailable", "Mock scenario: error");
      if (scenario === "slow") await delay(slowMs);
      if (scenario === "offline") return { online: false, message: "Home Assistant offline", version: null };
      return { online: true, message: "Connected", version: HA_VERSION };
    },

    async getAreas(): Promise<Area[]> {
      return read(() => {
        const all = sorted([...entities.values()]);
        const areas: Area[] = [];
        for (const fixture of FIXTURE_AREAS) {
          const members = all.filter((e) => e.area === fixture.areaId);
          if (members.length) areas.push({ areaId: fixture.areaId, name: fixture.name, entities: clone(members) });
        }
        const unassigned = all.filter((e) => e.area === null);
        if (unassigned.length) areas.push({ areaId: UNASSIGNED, name: "Unassigned", entities: clone(unassigned) });
        return areas;
      });
    },

    async getEntities(filter?: EntityFilter): Promise<Entity[]> {
      return read(() =>
        clone(
          sorted([...entities.values()]).filter(
            (e) =>
              (!filter?.domain || e.domain === filter.domain) &&
              (!filter?.area || e.area === filter.area),
          ),
        ),
      );
    },

    async runAction(entityId: string, action: EntityAction): Promise<Entity> {
      if (scenario === "action-error") throw new ApiError("server", "Mock scenario: action-error", 500);
      const current = entities.get(entityId);
      if (!current) throw new ApiError("not_found", "entity_not_found", 404);
      await delay(actionDelayMs);
      const updated = applyAction(current, action);
      entities.set(entityId, updated);
      // Like Home Assistant (117): the answer still shows the state before the change; the new state
      // reaches the stream a little later, so the optimistic value has to bridge the gap.
      setTimeout(() => {
        const latest = entities.get(entityId);
        if (latest) emit(latest);
      }, streamDelayMs);
      return clone(current);
    },

    subscribe(onEntity: (e: Entity) => void, onConnection: (s: ConnectionState) => void) {
      listeners.add(onEntity);
      const timeouts: ReturnType<typeof setTimeout>[] = [];
      onConnection("open");
      if (scenario === "stream-drop") {
        timeouts.push(setTimeout(() => onConnection("reconnecting"), 3000));
        timeouts.push(setTimeout(() => onConnection("open"), 6000));
      }

      // Feature 126 "device-flap": both members of the Desk plug device lose their link, then recover. Emitted in
      // one tick, like a device dropping off the network, so the feed dedupes them into one event.
      if (scenario === "device-flap") {
        let saved: string[] = [];
        timeouts.push(setTimeout(() => {
          saved = DEVICE_FLAP_IDS.map((id) => entities.get(id)?.state ?? "on");
          for (const id of DEVICE_FLAP_IDS) setEntityState(id, "unavailable");
        }, DEVICE_FLAP_DOWN_MS));
        timeouts.push(setTimeout(() => {
          DEVICE_FLAP_IDS.forEach((id, i) => setEntityState(id, saved[i] ?? "on"));
        }, DEVICE_FLAP_UP_MS));
      }

      const interval = setInterval(() => {
        for (const current of [...entities.values()]) {
          const updated = drift(current);
          if (updated === current) continue;
          entities.set(updated.entityId, updated);
          emit(updated);
        }
      }, 5000);

      return () => {
        listeners.delete(onEntity);
        clearInterval(interval);
        for (const timer of timeouts) clearTimeout(timer);
      };
    },

    async getHistory(entityIds: string[], hours: number): Promise<HistorySeries[]> {
      if (scenario === "no-history") throw new ApiError("not_found", "history_not_found", 404);
      return read(() => entityIds.map((id) => historyFor(id, hours)));
    },
  };
}
