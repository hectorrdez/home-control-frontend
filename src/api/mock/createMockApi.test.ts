import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockApi } from "./createMockApi";
import { createFixtureEntities } from "./fixtures";
import { parseScenario, parseSeed } from "./scenarios";
import { ApiError, type Entity } from "../types";

const fast = { actionDelayMs: 0 };

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

    const after = await api.runAction(before.entityId, { action: "toggle" });
    expect(after.state).toBe("on");
    expect(seen.map((e) => e.entityId)).toEqual([before.entityId]);
    expect((await api.getEntities({ area: "kitchen" })).find((e) => e.domain === "light")!.state).toBe("on");
  });

  it("applies brightness_pct to a light", async () => {
    const api = createMockApi(fast);
    const updated = await api.runAction("light.bedroom_lamp", {
      action: "turn_on",
      params: { brightness_pct: 50 },
    });
    expect(updated.attributes.brightness).toBe(128);
  });

  it("sets climate temperature, hvac mode and preset", async () => {
    const api = createMockApi(fast);
    const t = await api.runAction("climate.living_room", { action: "set_temperature", params: { temperature: 23 } });
    expect(t.attributes.temperature).toBe(23);
    const m = await api.runAction("climate.living_room", { action: "set_hvac_mode", params: { hvac_mode: "cool" } });
    expect(m.state).toBe("cool");
    const p = await api.runAction("climate.living_room", { action: "set_preset_mode", params: { preset_mode: "away" } });
    expect(p.attributes.preset_mode).toBe("away");
  });

  it("moves covers by position and open/close", async () => {
    const api = createMockApi(fast);
    const closed = await api.runAction("cover.bedroom_blinds", { action: "close_cover" });
    expect(closed.state).toBe("closed");
    expect(closed.attributes.current_position).toBe(0);
    const pos = await api.runAction("cover.bedroom_blinds", { action: "set_cover_position", params: { position: 40 } });
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
});
