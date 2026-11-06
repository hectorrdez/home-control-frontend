import type { EntityFilter, HomeApi } from "../HomeApi";
import {
  ApiError,
  type Area,
  type ConnectionState,
  type Entity,
  type EntityAction,
  type HaStatus,
  type HistorySeries,
} from "../types";
import { createFixtureEntities, FIXTURE_AREAS } from "./fixtures";
import { createPrng, hashSeed } from "./prng";
import { type Scenario } from "./scenarios";

export interface MockApiOptions {
  scenario?: Scenario;
  seed?: number;
  actionDelayMs?: number; // default 150
  slowMs?: number; // default 2000
}

const HA_VERSION = "2026.4.1";
const HISTORY_REF_TIME = Date.parse("2026-11-06T12:00:00.000Z");
const UNASSIGNED = "unassigned";

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

  const entities = new Map<string, Entity>(
    scenario === "empty" ? [] : createFixtureEntities().map((e) => [e.entityId, e]),
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

  return {
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
      emit(updated);
      return clone(updated);
    },

    subscribe(onEntity: (e: Entity) => void, onConnection: (s: ConnectionState) => void) {
      listeners.add(onEntity);
      const timeouts: ReturnType<typeof setTimeout>[] = [];
      onConnection("open");
      if (scenario === "stream-drop") {
        timeouts.push(setTimeout(() => onConnection("reconnecting"), 3000));
        timeouts.push(setTimeout(() => onConnection("open"), 6000));
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
