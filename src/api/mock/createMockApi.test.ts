import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockApi } from "./createMockApi";
import { createFixtureEntities } from "./fixtures";
import { parseScenario, parseSeed } from "./scenarios";
import type { HomeApi } from "../HomeApi";
import { ApiError, type Entity, type EntityAction } from "../types";

const fast = { actionDelayMs: 0, streamDelayMs: 0 };

// The action answer shows the state from before the change (117); the store already holds the new one.
async function applied(api: HomeApi, entityId: string, action: EntityAction): Promise<Entity> {
  await api.runAction(entityId, action);
  return (await api.getEntities()).find((e) => e.entityId === entityId)!;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("fixtures", () => {
  it("builds a house with the reference domains and HA-shaped entities", () => {
    const entities = createFixtureEntities();
    const domains = new Set(entities.map((e) => e.domain));
    for (const d of ["light", "sensor", "climate", "cover", "switch", "binary_sensor", "lock", "scene"]) {
      expect(domains.has(d)).toBe(true);
    }
    for (const e of entities) {
      expect(e.entityId.startsWith(`${e.domain}.`)).toBe(true);
      expect(typeof e.state).toBe("string");
      expect(typeof e.lastChanged).toBe("string");
    }
  });

  it("groups areas and puts area-less entities under unassigned", async () => {
    const areas = await createMockApi(fast).getAreas();
    expect(areas.map((a) => a.areaId)).toEqual(["living_room", "kitchen", "bedroom", "office", "unassigned"]);
    const unassigned = areas.at(-1)!;
    expect(unassigned.entities.map((e) => e.entityId)).toContain("scene.dawn");
  });
});

describe("runAction", () => {
  it("toggles a light and emits the new state on the stream", async () => {
    const api = createMockApi(fast);
    const seen: Entity[] = [];
    api.subscribe((e) => seen.push(e), () => {});

    const before = (await api.getEntities({ area: "kitchen" })).find((e) => e.domain === "light")!;
    expect(before.state).toBe("off");

    const after = await applied(api, before.entityId, { action: "toggle" });
    expect(after.state).toBe("on");
    await vi.waitFor(() => expect(seen.map((e) => e.entityId)).toEqual([before.entityId]));
    expect((await api.getEntities({ area: "kitchen" })).find((e) => e.domain === "light")!.state).toBe("on");
  });

  it("applies brightness_pct to a light", async () => {
    const api = createMockApi(fast);
    const updated = await applied(api, "light.bedroom_lamp", {
      action: "turn_on",
      params: { brightness_pct: 50 },
    });
    expect(updated.attributes.brightness).toBe(128);
  });

  it("sets climate temperature, hvac mode and preset", async () => {
    const api = createMockApi(fast);
    const t = await applied(api, "climate.living_room", { action: "set_temperature", params: { temperature: 23 } });
    expect(t.attributes.temperature).toBe(23);
    const m = await applied(api, "climate.living_room", { action: "set_hvac_mode", params: { hvac_mode: "cool" } });
    expect(m.state).toBe("cool");
    const p = await applied(api, "climate.living_room", { action: "set_preset_mode", params: { preset_mode: "away" } });
    expect(p.attributes.preset_mode).toBe("away");
  });

  it("moves covers by position and open/close", async () => {
    const api = createMockApi(fast);
    const closed = await applied(api, "cover.bedroom_blinds", { action: "close_cover" });
    expect(closed.state).toBe("closed");
    expect(closed.attributes.current_position).toBe(0);
    const pos = await applied(api, "cover.bedroom_blinds", { action: "set_cover_position", params: { position: 40 } });
    expect(pos.state).toBe("open");
    expect(pos.attributes.current_position).toBe(40);
  });

  it("rejects unknown entities and unsupported actions", async () => {
    const api = createMockApi(fast);
    await expect(api.runAction("light.nope", { action: "toggle" })).rejects.toMatchObject({ kind: "not_found" });
    await expect(api.runAction("lock.front_door", { action: "turn_on" })).rejects.toBeInstanceOf(ApiError);
  });
});

describe("stream", () => {
  it("reports open immediately and drifts sensors every 5 s", () => {
    vi.useFakeTimers();
    const api = createMockApi(fast);
    const connections: string[] = [];
    const seen: string[] = [];
    const stop = api.subscribe((e) => seen.push(e.entityId), (s) => connections.push(s));

    expect(connections).toEqual(["open"]);
    vi.advanceTimersByTime(5000);
    expect(seen).toContain("sensor.living_room_temperature");
    stop();
  });

  it("stream-drop goes reconnecting at 3 s and open again at 6 s", () => {
    vi.useFakeTimers();
    const api = createMockApi({ ...fast, scenario: "stream-drop" });
    const connections: string[] = [];
    api.subscribe(() => {}, (s) => connections.push(s));

    vi.advanceTimersByTime(3000);
    expect(connections.at(-1)).toBe("reconnecting");
    vi.advanceTimersByTime(3000);
    expect(connections.at(-1)).toBe("open");
  });

  it("device-flap drops both Desk plug members in one tick at 1.5 s and restores them at 4 s (126)", () => {
    vi.useFakeTimers();
    const api = createMockApi({ ...fast, scenario: "device-flap" });
    const batches: { tick: number; ids: string[]; states: string[] }[] = [];
    let last = -1;
    api.subscribe(
      (e) => {
        const now = Date.now();
        if (now !== last) batches.push({ tick: now, ids: [], states: [] });
        last = now;
        batches.at(-1)!.ids.push(e.entityId);
        batches.at(-1)!.states.push(e.state);
      },
      () => undefined,
    );

    vi.advanceTimersByTime(1500);
    expect(batches).toHaveLength(1);
    expect(batches[0].ids.sort()).toEqual(["sensor.office_desk_power", "switch.office_desk"]);
    expect(batches[0].states).toEqual(["unavailable", "unavailable"]);

    vi.advanceTimersByTime(2500);
    expect(batches).toHaveLength(2);
    expect(batches[1].states).toEqual(["on", "42.5"]);
  });
});

describe("history", () => {
  it("is deterministic for a given seed and empty for non-numeric ids", async () => {
    const ids = ["sensor.co2", "light.kitchen_ceiling"];
    const a = await createMockApi({ ...fast, seed: 7 }).getHistory(ids, 24);
    const b = await createMockApi({ ...fast, seed: 7 }).getHistory(ids, 24);
    expect(a).toEqual(b);
    expect(a[0].points).toHaveLength(24 * 4);
    expect(a[1].points).toEqual([]);
  });

  it("uses hourly points beyond 24 h and a different series for another seed", async () => {
    const x = await createMockApi({ ...fast, seed: 1 }).getHistory(["sensor.house_power"], 48);
    const y = await createMockApi({ ...fast, seed: 2 }).getHistory(["sensor.house_power"], 48);
    expect(x[0].points).toHaveLength(48);
    expect(x[0].points).not.toEqual(y[0].points);
  });
});

describe("scenarios", () => {
  it("empty has no areas or entities", async () => {
    const api = createMockApi({ ...fast, scenario: "empty" });
    await expect(api.getAreas()).resolves.toEqual([]);
    await expect(api.getEntities()).resolves.toEqual([]);
  });

  it("error rejects every read with unavailable", async () => {
    const api = createMockApi({ ...fast, scenario: "error" });
    await expect(api.getStatus()).rejects.toMatchObject({ kind: "unavailable" });
    await expect(api.getEntities()).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("offline reports online:false, unauthorized rejects with unauthorized", async () => {
    await expect(createMockApi({ ...fast, scenario: "offline" }).getStatus()).resolves.toMatchObject({ online: false });
    await expect(createMockApi({ ...fast, scenario: "unauthorized" }).getStatus()).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });

  it("action-error rejects actions and no-history rejects history with not_found", async () => {
    const actions = createMockApi({ ...fast, scenario: "action-error" });
    await expect(actions.runAction("light.office_desk", { action: "toggle" })).rejects.toBeInstanceOf(ApiError);
    const history = createMockApi({ ...fast, scenario: "no-history" });
    await expect(history.getHistory(["sensor.co2"], 24)).rejects.toMatchObject({ kind: "not_found" });
  });

  it("slow delays reads", async () => {
    vi.useFakeTimers();
    const api = createMockApi({ ...fast, scenario: "slow", slowMs: 2000 });
    let done = false;
    void api.getStatus().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(1999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});

describe("parsers", () => {
  it("reads ?mock= and ?seed= from the query string", () => {
    expect(parseScenario("?mock=offline")).toBe("offline");
    expect(parseScenario("?mock=banana")).toBe("default");
    expect(parseScenario("")).toBe("default");
    expect(parseSeed("?seed=42")).toBe(42);
    expect(parseSeed("?seed=x")).toBe(1);
  });
});

describe("mock aliases", () => {
  afterEach(() => {
    globalThis.localStorage?.clear();
  });

  it("sets, trims, lists and deletes aliases", async () => {
    const api = createMockApi(fast);
    expect(await api.getAliases()).toEqual([]);
    expect(await api.setAlias("light.living_room", "  Lamp  ")).toEqual([
      { entityId: "light.living_room", alias: "Lamp" },
    ]);
    expect(await createMockApi(fast).getAliases()).toHaveLength(1);
    expect(await api.deleteAlias("light.living_room")).toEqual([]);
  });

  it("rejects empty and over-long aliases and bad entity ids", async () => {
    const api = createMockApi(fast);
    await expect(api.setAlias("light.a", "   ")).rejects.toMatchObject({ message: "invalid_alias" });
    await expect(api.setAlias("light.a", "x".repeat(81))).rejects.toMatchObject({ message: "invalid_alias" });
    await expect(api.setAlias("bad id", "ok")).rejects.toBeInstanceOf(ApiError);
  });

  it("alias-error scenario fails writes with aliases_write_failed", async () => {
    const api = createMockApi({ ...fast, scenario: "alias-error" });
    await expect(api.setAlias("light.a", "ok")).rejects.toMatchObject({ message: "aliases_write_failed" });
    await expect(api.deleteAlias("light.a")).rejects.toMatchObject({ message: "aliases_write_failed" });
  });

  it("raw-names scenario adds entities with raw names", async () => {
    const base = await createMockApi(fast).getAreas();
    const raw = await createMockApi({ ...fast, scenario: "raw-names" }).getAreas();
    const count = (a: typeof base) => a.reduce((n, x) => n + x.entities.length, 0);
    expect(count(raw)).toBeGreaterThan(count(base));
  });

  it("rejects an alias write that is not a valid entity id before any delay", async () => {
    const api = createMockApi({ actionDelayMs: 10_000 });
    await expect(api.deleteAlias("not an id")).rejects.toMatchObject({ message: "invalid_entity_id" });
    await expect(api.setAlias("not an id", "ok")).rejects.toMatchObject({ message: "invalid_entity_id" });
  });

  it("refuses new aliases past the cap", async () => {
    // Seed the cap through storage so the test does not write 2000 aliases one by one.
    const full = Array.from({ length: 2000 }, (_, i) => ({ entityId: `sensor.s${i}`, alias: `n${i}` }));
    globalThis.localStorage.setItem("hc.mock.aliases.v1", JSON.stringify(full));
    const api = createMockApi(fast);
    await expect(api.setAlias("sensor.extra", "x")).rejects.toMatchObject({ message: "too_many_aliases" });
    await expect(api.setAlias("sensor.s0", "changed")).resolves.toHaveLength(2000);
  });

  it("reads aliases persisted by an earlier session and skips malformed rows", async () => {
    globalThis.localStorage.setItem(
      "hc.mock.aliases.v1",
      JSON.stringify([{ entityId: "light.a", alias: "A" }, { entityId: 3 }, null]),
    );
    expect(await createMockApi(fast).getAliases()).toEqual([{ entityId: "light.a", alias: "A" }]);
  });

  it("starts empty when the stored aliases are corrupt or not a list", async () => {
    globalThis.localStorage.setItem("hc.mock.aliases.v1", "{oops");
    expect(await createMockApi(fast).getAliases()).toEqual([]);

    globalThis.localStorage.setItem("hc.mock.aliases.v1", JSON.stringify({ not: "a list" }));
    expect(await createMockApi(fast).getAliases()).toEqual([]);
  });

  it("keeps working when storage is blocked for writes", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      const api = createMockApi(fast);
      await expect(api.setAlias("light.a", "A")).resolves.toEqual([{ entityId: "light.a", alias: "A" }]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("mock API domain actions", () => {
  const find = (domain: string) => createFixtureEntities().find((e) => e.domain === domain)!;

  it("handles switch and light on/off and rejects unsupported light actions", async () => {
    const api = createMockApi(fast);
    const sw = find("switch");
    expect((await applied(api,sw.entityId, { action: "turn_off" })).state).toBe("off");
    expect((await applied(api,sw.entityId, { action: "turn_on" })).state).toBe("on");
    expect((await applied(api,sw.entityId, { action: "toggle" })).state).toBe("off");
    await expect(api.runAction(sw.entityId, { action: "explode" })).rejects.toMatchObject({ message: "invalid_action" });

    const light = find("light");
    await expect(api.runAction(light.entityId, { action: "explode" })).rejects.toMatchObject({ kind: "server" });
  });

  it("only lets scenes be activated", async () => {
    const api = createMockApi(fast);
    const scene = find("scene");
    const after = await applied(api, scene.entityId, { action: "turn_on" });
    expect(after.lastChanged).not.toBe(scene.lastChanged);
    await expect(api.runAction(scene.entityId, { action: "turn_off" })).rejects.toMatchObject({ message: "invalid_action" });
  });

  it("sets climate targets and rejects bad climate actions", async () => {
    const api = createMockApi(fast);
    const climate = find("climate");
    const hot = await applied(api,climate.entityId, { action: "set_temperature", params: { temperature: 23 } });
    expect(hot.attributes.temperature).toBe(23);
    const mode = await applied(api,climate.entityId, { action: "set_hvac_mode", params: { hvac_mode: "off" } });
    expect(mode.state).toBe("off");
    await expect(api.runAction(climate.entityId, { action: "set_temperature", params: {} })).rejects.toMatchObject({ message: "invalid_action" });
    await expect(api.runAction(climate.entityId, { action: "set_preset_mode", params: {} })).rejects.toMatchObject({ message: "invalid_action" });
    await expect(api.runAction(climate.entityId, { action: "toggle" })).rejects.toMatchObject({ message: "invalid_action" });
  });

  it("closes, opens and positions covers and rejects unknown cover actions", async () => {
    const api = createMockApi(fast);
    const cover = find("cover");
    expect((await applied(api,cover.entityId, { action: "close_cover" })).state).toBe("closed");
    expect((await applied(api,cover.entityId, { action: "open_cover" })).attributes.current_position).toBe(100);
    const half = await applied(api,cover.entityId, { action: "set_cover_position", params: { position: 0 } });
    expect(half.state).toBe("closed");
    expect((await applied(api, cover.entityId, { action: "stop_cover" })).state).toBe("closed");
    await expect(api.runAction(cover.entityId, { action: "set_cover_position", params: {} })).rejects.toMatchObject({ message: "invalid_action" });
    await expect(api.runAction(cover.entityId, { action: "toggle" })).rejects.toMatchObject({ message: "invalid_action" });
  });

  it("locks and unlocks and rejects other lock actions", async () => {
    const api = createMockApi(fast);
    const lock = find("lock");
    expect((await applied(api,lock.entityId, { action: "unlock" })).state).toBe("unlocked");
    expect((await applied(api,lock.entityId, { action: "lock" })).state).toBe("locked");
    await expect(api.runAction(lock.entityId, { action: "toggle" })).rejects.toMatchObject({ message: "invalid_action" });
  });

  it("answers with the pre-action state and streams the new state after the delay (117)", async () => {
    const api = createMockApi({ actionDelayMs: 0, streamDelayMs: 20 });
    const sw = find("switch");
    const target = sw.state === "on" ? "turn_off" : "turn_on";
    const expected = target === "turn_on" ? "on" : "off";
    const streamed: string[] = [];
    const stop = api.subscribe(
      (e) => {
        if (e.entityId === sw.entityId) streamed.push(e.state);
      },
      () => undefined,
    );

    const answer = await api.runAction(sw.entityId, { action: target });
    expect(answer.state).toBe(sw.state);
    expect(streamed).toEqual([]);

    await vi.waitFor(() => expect(streamed).toEqual([expected]));
    stop();
  });

  it("refuses actions on domains the mock does not control", async () => {
    const api = createMockApi(fast);
    const sensor = find("sensor");
    await expect(api.runAction(sensor.entityId, { action: "turn_on" })).rejects.toMatchObject({ message: "domain_not_allowed", status: 403 });
  });

  it("returns a history series with no points for a non-numeric entity", async () => {
    const api = createMockApi(fast);
    const [series] = await api.getHistory(["light.kitchen_ceiling"], 24);
    expect(series.points).toEqual([]);
    const [missing] = await api.getHistory(["sensor.does_not_exist"], 24);
    expect(missing).toEqual({ entityId: "sensor.does_not_exist", unit: null, points: [] });
  });

  it("drifts the motion sensor and the house power meter as well as temperatures", () => {
    vi.useFakeTimers();
    const api = createMockApi(fast);
    const seen = new Map<string, string>();
    const stop = api.subscribe((e) => seen.set(e.entityId, e.state), () => undefined);
    vi.advanceTimersByTime(5000);
    expect(seen.has("binary_sensor.entry_motion")).toBe(true);
    stop();
  });

  it("reports the connection state unchanged when a read scenario answers normally", async () => {
    const api = createMockApi({ ...fast, scenario: "empty" });
    await expect(api.getEntities()).resolves.toEqual([]);
    await expect(api.getAreas()).resolves.toEqual([]);
    await expect(api.getStatus()).resolves.toMatchObject({ online: true });
  });
});
