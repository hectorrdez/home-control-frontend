import type { EntityFilter, HomeApi } from "../HomeApi";
import {
  ApiError,
  type Alias,
  type AlertRule,
  type AlertRuleInput,
  type AlertTrigger,
  type Area,
  type CalibrationInput,
  type ConnectionState,
  type CoverCalibration,
  type Entity,
  type EntityAction,
  type HaStatus,
  type HistorySeries,
} from "../types";
import {
  createFixtureEntities,
  createManyDeviceEntities,
  createRawNameEntities,
  createUncalibratedCoverEntities,
  FIXTURE_AREAS,
} from "./fixtures";
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
          ...(scenario === "cover-calibration" ? createUncalibratedCoverEntities() : []),
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
          setPosition(attrs, 100);
        } else if (action.action === "close_cover") {
          next.state = "closed";
          setPosition(attrs, 0);
        } else if (action.action === "set_cover_position" && typeof params.position === "number") {
          setPosition(attrs, params.position);
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

  // Covers without a position sensor have no current_position attribute; only covers that report one get it.
  function setPosition(attrs: Record<string, unknown>, position: number): void {
    if ("current_position" in attrs) attrs.current_position = position;
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

  // Feature 127: cover calibrations (backend 010) and timed percent moves (backend 011). Mock only, in memory.
  const CALIBRATION_CAP = 200;
  const CALIBRATION_MIN_MS = 500;
  const CALIBRATION_MAX_MS = 300_000;
  const FULL_LEG_MARGIN = 1.1; // a full leg runs 10 % longer than the measured time, like the backend
  const calibrations = new Map<string, CoverCalibration>();
  const moves = new Map<string, { timer: ReturnType<typeof setTimeout>; startedAt: number; durationMs: number; from: number | null; target: number; full: boolean }>();

  function calibrationList(): CoverCalibration[] {
    return [...calibrations.values()].sort((a, b) => a.entityId.localeCompare(b.entityId)).map((c) => ({ ...c }));
  }

  function coverOf(entityId: string): Entity {
    const current = entities.get(entityId);
    if (!current) throw new ApiError("not_found", "entity_not_found", 404);
    if (current.domain !== "cover") throw new ApiError("server", "domain_not_allowed", 403);
    return current;
  }

  // Publishes the position estimate as the stream does (null while a move runs or when unknown).
  function publishPosition(entityId: string, position: number | null): void {
    const current = entities.get(entityId);
    if (!current) return;
    const next = clone(current);
    next.attributes.estimated_position = position;
    if (position !== null) next.state = position > 0 ? "open" : "closed";
    next.lastChanged = new Date().toISOString();
    entities.set(entityId, next);
    emit(next);
  }

  // A running move ends early: the elapsed estimate is kept (a full leg has none, so the position stays unknown).
  function cancelMove(entityId: string): void {
    const move = moves.get(entityId);
    const cal = calibrations.get(entityId);
    if (!move) return;
    clearTimeout(move.timer);
    moves.delete(entityId);
    if (!cal) return;
    const ratio = Math.min(1, (Date.now() - move.startedAt) / move.durationMs);
    const estimate = move.full || move.from === null ? null : Math.round(move.from + (move.target - move.from) * ratio);
    cal.position = estimate;
    publishPosition(entityId, estimate);
  }

  function startMove(entityId: string, cal: CoverCalibration, percent: number): void {
    const full = percent === 0 || percent === 100;
    const known = cal.position;
    const opening = full ? percent === 100 : percent > (known ?? 0);
    const leg = opening ? cal.openMs : cal.closeMs;
    const durationMs = full ? leg * FULL_LEG_MARGIN : (Math.abs(percent - (known ?? 0)) / 100) * leg;
    const timer = setTimeout(() => {
      moves.delete(entityId);
      cal.position = percent;
      publishPosition(entityId, percent);
    }, durationMs);
    moves.set(entityId, { timer, startedAt: Date.now(), durationMs, from: full ? null : known, target: percent, full });
    cal.position = null;
    publishPosition(entityId, null);
  }

  function calibrationInRange(ms: unknown): boolean {
    return Number.isInteger(ms) && (ms as number) >= CALIBRATION_MIN_MS && (ms as number) <= CALIBRATION_MAX_MS;
  }

  // Feature 128: notification rules (backend 012). Mock only, in memory; validation and duplicates follow the backend.
  const ALERT_CAP = 500;
  const ALERT_LEVELS: readonly string[] = ["off", "low", "medium", "high"];
  const alertRules = new Map<string, AlertRule>();
  let alertSeq = 0;

  function validTrigger({ type, value }: { type?: unknown; value?: unknown }): boolean {
    if (type === "connects" || type === "disconnects" || type === "interacted") return true;
    if (type === "state_becomes") return typeof value === "string" && value.length >= 1 && value.length <= 40;
    if (type === "above" || type === "below") return typeof value === "number" && Number.isFinite(value);
    return false;
  }

  function validMessage(message: unknown): boolean {
    return message === undefined || (typeof message === "string" && message.length >= 1 && message.length <= 120);
  }

  // A rule clashes with another one of the same entity and trigger type+value (the id being replaced is ignored).
  function checkAlertInput(rule: AlertRuleInput, exceptId?: string): void {
    if (!ENTITY_ID.test(rule.entityId)) throw new ApiError("server", "invalid_entity_id", 400);
    if (!ALERT_LEVELS.includes(rule.level) || !validTrigger(rule.trigger) || !validMessage(rule.message)) {
      throw new ApiError("server", "invalid_rule", 400);
    }
    const key = triggerKey(rule.trigger);
    const clash = [...alertRules.values()].some(
      (other) => other.id !== exceptId && other.entityId === rule.entityId && triggerKey(other.trigger) === key,
    );
    if (clash) throw new ApiError("server", "duplicate_rule", 409);
  }

  function triggerKey(trigger: AlertTrigger): string {
    return "value" in trigger ? `${trigger.type}:${trigger.value}` : trigger.type;
  }

  function storedRule(id: string, rule: AlertRuleInput): AlertRule {
    return { id, entityId: rule.entityId, trigger: { ...rule.trigger }, level: rule.level, ...(rule.message === undefined ? {} : { message: rule.message }) };
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

    async getCalibrations(): Promise<CoverCalibration[]> {
      return read(() => calibrationList());
    },

    async putCalibration(entityId: string, input: CalibrationInput): Promise<CoverCalibration[]> {
      if (!ENTITY_ID.test(entityId)) throw new ApiError("server", "invalid_entity_id", 400);
      coverOf(entityId);
      if (!calibrationInRange(input.openMs) || !calibrationInRange(input.closeMs)) {
        throw new ApiError("server", "invalid_calibration", 400);
      }
      if (!calibrations.has(entityId) && calibrations.size >= CALIBRATION_CAP) {
        throw new ApiError("server", "too_many_calibrations", 400);
      }
      await delay(actionDelayMs);
      cancelMove(entityId);
      calibrations.set(entityId, {
        entityId,
        openMs: input.openMs,
        closeMs: input.closeMs,
        position: null,
        calibratedAt: new Date().toISOString(),
      });
      return calibrationList();
    },

    async deleteCalibration(entityId: string): Promise<CoverCalibration[]> {
      if (!ENTITY_ID.test(entityId)) throw new ApiError("server", "invalid_entity_id", 400);
      await delay(actionDelayMs);
      cancelMove(entityId);
      calibrations.delete(entityId);
      return calibrationList();
    },

    async setCoverPercent(entityId: string, percent: number): Promise<Entity> {
      if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new ApiError("server", "invalid_params", 400);
      coverOf(entityId);
      const cal = calibrations.get(entityId);
      if (!cal) throw new ApiError("server", "not_calibrated", 409);
      // A new request cancels a running move (its estimate is kept) before the position rules are checked.
      cancelMove(entityId);
      const full = percent === 0 || percent === 100;
      if (!full && cal.position === null) throw new ApiError("server", "position_unknown", 409);
      startMove(entityId, cal, percent);
      return clone(entities.get(entityId) as Entity);
    },

    async listAlertRules(): Promise<AlertRule[]> {
      return read(() =>
        [...alertRules.values()]
          .sort((a, b) => a.entityId.localeCompare(b.entityId) || a.id.localeCompare(b.id))
          .map((rule) => clone(rule)),
      );
    },

    async createAlertRule(rule: AlertRuleInput): Promise<AlertRule> {
      checkAlertInput(rule);
      if (alertRules.size >= ALERT_CAP) throw new ApiError("server", "too_many_rules", 400);
      await delay(actionDelayMs);
      const stored = storedRule(`rule-${++alertSeq}`, rule);
      alertRules.set(stored.id, stored);
      return clone(stored);
    },

    async updateAlertRule(id: string, rule: AlertRuleInput): Promise<AlertRule> {
      if (!alertRules.has(id)) throw new ApiError("not_found", "rule_not_found", 404);
      checkAlertInput(rule, id);
      await delay(actionDelayMs);
      const stored = storedRule(id, rule);
      alertRules.set(id, stored);
      return clone(stored);
    },

    async deleteAlertRule(id: string): Promise<void> {
      await delay(actionDelayMs);
      alertRules.delete(id);
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
      if (action.action === "stop_cover") cancelMove(entityId);
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
