import { describe, expect, it } from "vitest";
import type { Area, Entity } from "@/api/types";
import { createFixtureEntities, FIXTURE_AREAS } from "@/api/mock/fixtures";
import { entitiesReducer, initialEntitiesState, UNASSIGNED, type EntitiesState } from "./entities";
import {
  deckSections,
  domainGroupOf,
  formatPower,
  groupCounts,
  houseLoad,
  isInteractive,
  isUnavailable,
  plugPowerSensorIds,
  summarize,
} from "./selectors";

const synthetic = (domain: string, state = "on"): Entity => ({
  entityId: domain === "" ? ".thing" : `${domain}.thing`,
  domain,
  name: "Thing",
  state,
  attributes: {},
  area: "kitchen",
  lastChanged: "2026-11-06T08:00:00.000Z",
});

// Same grouping the live API returns: one group per area (fixture order), unassigned last.
function areasFrom(entities: Entity[]): Area[] {
  const areas: Area[] = FIXTURE_AREAS.map((a) => ({
    areaId: a.areaId,
    name: a.name,
    entities: entities.filter((e) => e.area === a.areaId),
  })).filter((a) => a.entities.length > 0);
  const unassigned = entities.filter((e) => e.area === null);
  if (unassigned.length) areas.push({ areaId: UNASSIGNED, name: "Unassigned", entities: unassigned });
  return areas;
}

function loaded(entities: Entity[]): EntitiesState {
  return entitiesReducer(initialEntitiesState, { type: "loaded", areas: areasFrom(entities) });
}

const house = () => createFixtureEntities();

describe("entities reducer", () => {
  it("starts loading and becomes ready with every entity keyed by id", () => {
    const state = loaded(house());
    expect(initialEntitiesState.status).toBe("loading");
    expect(state.status).toBe("ready");
    expect(state.entities["light.kitchen_ceiling"]?.name).toBe("Kitchen ceiling");
    expect(state.areas.map((a) => a.areaId)).toEqual(["living_room", "kitchen", "bedroom", "office", UNASSIGNED]);
  });

  it("moves to error on failure and back to loading on load", () => {
    const failed = entitiesReducer(initialEntitiesState, { type: "failed" });
    expect(failed.status).toBe("error");
    expect(entitiesReducer(failed, { type: "load" }).status).toBe("loading");
  });
});

describe("domain groups", () => {
  it("maps lights, climate, security, plugs and leaves other domains out of pills", () => {
    const entities = house();
    const plugs = plugPowerSensorIds(entities);
    const group = (id: string) => domainGroupOf(entities.find((e) => e.entityId === id)!, plugs);

    expect(group("light.kitchen_ceiling")).toBe("lights");
    expect(group("climate.living_room")).toBe("climate");
    expect(group("sensor.kitchen_temperature")).toBe("climate");
    expect(group("lock.front_door")).toBe("security");
    expect(group("binary_sensor.entry_motion")).toBe("security");
    expect(group("switch.office_desk")).toBe("plugs");
    expect(group("sensor.office_desk_power")).toBe("plugs");
    expect(group("sensor.co2")).toBe("other");
    expect(group("scene.dawn")).toBe("other");
  });

  it("counts only available interactive entities per pill and ALL", () => {
    const counts = groupCounts(loaded(house()));
    expect(counts).toEqual({ all: 9, lights: 4, climate: 1, security: 1, plugs: 1 });
  });

  it("only links a power sensor to a switch in the same area by name", () => {
    const entities = house();
    const unrelated: Entity = { ...entities.find((e) => e.entityId === "sensor.solar_power")! };
    const linked = plugPowerSensorIds([...entities, unrelated]);
    expect([...linked]).toEqual(["sensor.office_desk_power"]);
  });
});

describe("isInteractive", () => {
  it.each(["light", "switch", "fan", "climate", "cover", "lock", "scene", "script"])("is true for %s", (domain) => {
    expect(isInteractive(synthetic(domain))).toBe(true);
  });

  it.each(["sensor", "binary_sensor", "alarm_control_panel", "input_boolean", "button", "weather", ""])(
    "is false for %s",
    (domain) => {
      expect(isInteractive(synthetic(domain))).toBe(false);
    },
  );

  it("selects exactly the 9 interactive fixture entities", () => {
    const ids = createFixtureEntities()
      .filter(isInteractive)
      .map((e) => e.entityId)
      .sort();
    expect(ids).toEqual([
      "climate.living_room",
      "cover.bedroom_blinds",
      "light.bedroom_lamp",
      "light.kitchen_ceiling",
      "light.living_room_ceiling",
      "light.office_desk",
      "lock.front_door",
      "scene.dawn",
      "switch.office_desk",
    ]);
  });

  it("keeps an unavailable light in the deck (grey tile, feature 155) and in the counts", () => {
    const light: Entity = { ...synthetic("light"), entityId: "light.gone", state: "unavailable" };
    expect(isInteractive(light)).toBe(true);
    const state = loaded([...house(), light]);
    const shown = deckSections(state, null, "all").flatMap((s) => s.entities.map((e) => e.entityId));
    expect(shown).toContain("light.gone");
    expect(groupCounts(state).lights).toBe(5);
  });
});

describe("summary", () => {
  it("counts zones (no unassigned), live actuators and unavailable entities", () => {
    const summary = summarize(loaded(house()));
    expect(summary.zones).toBe(4);
    // light x4, switch, climate, cover, lock
    expect(summary.actuators).toBe(8);
    expect(summary.unavailable).toBe(0);
  });

  it("treats unknown as unavailable except for cover, scene and script, which may legitimately report it", () => {
    const withState = (domain: string, state: string) => isUnavailable(synthetic(domain, state));
    expect(withState("light", "unknown")).toBe(true);
    expect(withState("sensor", "unknown")).toBe(true);
    expect(withState("cover", "unknown")).toBe(false);
    expect(withState("scene", "unknown")).toBe(false);
    expect(withState("script", "unknown")).toBe(false);
    expect(withState("cover", "unavailable")).toBe(true);
    expect(withState("scene", "unavailable")).toBe(true);
  });

  it("counts unavailable and unknown states", () => {
    const entities = house().map((e) => (e.entityId === "light.kitchen_ceiling" ? { ...e, state: "unavailable" } : e));
    expect(summarize(loaded(entities)).unavailable).toBe(1);
  });

  it("uses the house-named power sensor for the load, formatted in kW", () => {
    expect(houseLoad(house())).toEqual({ watts: 1240 });
    expect(formatPower(1240)).toBe("1.24 kW");
    expect(formatPower(420.4)).toBe("420 W");
  });

  it("sums power sensors when none is named house or total, and reports null when there are none", () => {
    const power = (id: string, state: string, name: string): Entity => ({
      entityId: id,
      domain: "sensor",
      name,
      state,
      attributes: { device_class: "power", unit_of_measurement: "W" },
      area: null,
      lastChanged: "2026-11-06T08:00:00.000Z",
    });
    expect(houseLoad([power("sensor.a", "100", "Oven"), power("sensor.b", "250", "Heater")])).toEqual({ watts: 350 });
    expect(houseLoad([])).toBeNull();
  });
});

describe("deck sections", () => {
  it("filters by room and by group, ordering entities by group then name", () => {
    const state = loaded(house());
    const sections = deckSections(state, "living_room", "all");
    expect(sections.map((s) => s.area.areaId)).toEqual(["living_room"]);
    expect(sections[0].entities.map((e) => e.entityId)).toEqual(["light.living_room_ceiling", "climate.living_room"]);
  });

  it("shows an unavailable device in its room", () => {
    const light: Entity = { ...synthetic("light"), entityId: "light.gone", state: "unavailable", area: "office" };
    const state = loaded([...house(), light]);
    const sections = deckSections(state, "office", "all");
    expect(sections[0].entities.map((e) => e.entityId)).toContain("light.gone");
  });

  it("hides read-only entities from every section", () => {
    const shown = deckSections(loaded(house()), null, "all").flatMap((s) => s.entities.map((e) => e.entityId));
    expect(shown.some((id) => id.startsWith("sensor.") || id.startsWith("binary_sensor."))).toBe(false);
  });

  it("keeps a selected room even when it has no interactive entity in the filter", () => {
    const sections = deckSections(loaded(house()), "living_room", "security");
    expect(sections.map((s) => s.area.areaId)).toEqual(["living_room"]);
    expect(sections[0].entities).toEqual([]);
  });

  it("lists an interactive entity with no area under UNASSIGNED", () => {
    const loose: Entity = { ...synthetic("light"), entityId: "light.loose", name: "Loose", area: null };
    const sections = deckSections(loaded([...house(), loose]), null, "all");
    const unassigned = sections.find((s) => s.area.areaId === UNASSIGNED);
    // The fixture's lock and scene are unassigned too; the loose light must be among them.
    expect(unassigned?.entities.map((e) => e.entityId)).toContain("light.loose");
  });

  it("orders the office room as lights then plugs", () => {
    const sections = deckSections(loaded(house()), "office", "all");
    expect(sections[0].entities.map((e) => e.entityId)).toEqual(["light.office_desk", "switch.office_desk"]);
  });

  it("returns only matching entities for a domain group across rooms", () => {
    const sections = deckSections(loaded(house()), null, "lights");
    const ids = sections.flatMap((s) => s.entities.map((e) => e.entityId));
    expect(ids).toHaveLength(4);
    expect(ids.every((id) => id.startsWith("light."))).toBe(true);
  });
});

describe("unavailable entities", () => {
  it("stay in the deck as grey tiles and count with the devices shown", () => {
    const entities = createFixtureEntities().map((e) => (e.entityId === "light.kitchen_ceiling" ? { ...e, state: "unavailable" } : e));
    const state = loaded(entities);
    const shown = deckSections(state, null, "all").flatMap((sec) => sec.entities.map((e) => e.entityId));
    expect(shown).toContain("light.kitchen_ceiling");
    expect(groupCounts(state).all).toBe(9);
  });
});
