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
  plugPowerSensorIds,
  summarize,
} from "./selectors";

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

  it("counts entities per pill and ALL over the whole house", () => {
    const counts = groupCounts(loaded(house()));
    expect(counts).toEqual({ all: house().length, lights: 4, climate: 9, security: 2, plugs: 2 });
  });

  it("only links a power sensor to a switch in the same area by name", () => {
    const entities = house();
    const unrelated: Entity = { ...entities.find((e) => e.entityId === "sensor.solar_power")! };
    const linked = plugPowerSensorIds([...entities, unrelated]);
    expect([...linked]).toEqual(["sensor.office_desk_power"]);
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
    expect(sections[0].entities.map((e) => e.entityId)).toEqual([
      "light.living_room_ceiling",
      "sensor.living_room_humidity",
      "sensor.living_room_temperature",
      "climate.living_room",
    ]);
  });

  it("returns only matching entities for a domain group across rooms", () => {
    const sections = deckSections(loaded(house()), null, "lights");
    const ids = sections.flatMap((s) => s.entities.map((e) => e.entityId));
    expect(ids).toHaveLength(4);
    expect(ids.every((id) => id.startsWith("light."))).toBe(true);
  });
});
