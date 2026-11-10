import { describe, expect, it } from "vitest";
import type { Area, Entity } from "@/api/types";
import { createFixtureEntities, FIXTURE_AREAS } from "@/api/mock/fixtures";
import { entitiesReducer, initialEntitiesState, UNASSIGNED, type EntitiesState } from "@/state/entities";
import { isInteractive } from "@/state/selectors";
import {
  ALL_VISIBLE,
  deviceRowKeyIn,
  hideAllListed,
  panelRoomCounts,
  panelTypeCounts,
  panelTypeLabel,
  setRoomShown,
  setTypeShown,
  switchedOffCount,
  visibleDeckSections,
  PANEL_TYPES,
  EMPTY_DEVICE_FILTERS,
  buildDeviceRows,
  deviceFacets,
  deviceSlug,
  filterDeviceRows,
  isFiltered,
  resolveDeviceKey,
  type DeviceFilters,
  type DeviceRow,
} from "./deviceFilters";

// The mock house (26 entities) groups into 20 devices: 9 interactive rows, 11 read-only rows (feature 123).
function stateOf(entities: Entity[]): EntitiesState {
  const areas: Area[] = FIXTURE_AREAS.map((a) => ({
    areaId: a.areaId,
    name: a.name,
    entities: entities.filter((e) => e.area === a.areaId),
  }));
  areas.push({ areaId: UNASSIGNED, name: "Unassigned", entities: entities.filter((e) => e.area === null) });
  return entitiesReducer(initialEntitiesState, { type: "loaded", areas });
}

const plainLabel = (entity: Entity) => (entity.entityId === "sensor.entry_motion_battery" ? "Batería" : entity.name);

function rows(entities: Entity[] = createFixtureEntities()): DeviceRow[] {
  return buildDeviceRows(stateOf(entities), plainLabel);
}

function entity(overrides: Partial<Entity> & Pick<Entity, "entityId">): Entity {
  return {
    domain: overrides.entityId.split(".")[0],
    name: overrides.entityId,
    state: "on",
    attributes: {},
    area: "kitchen",
    lastChanged: "2026-11-06T08:00:00.000Z",
    deviceName: null,
    ...overrides,
  };
}

const filter = (patch: Partial<DeviceFilters>) => filterDeviceRows(rows(), { ...EMPTY_DEVICE_FILTERS, ...patch });
const ids = (list: DeviceRow[]) => list.map((r) => r.key);
const byKey = (list: DeviceRow[], key: string) => list.find((r) => r.key === key)!;

describe("deviceSlug", () => {
  it("strips accents, lowercases and joins symbol runs with underscores", () => {
    expect(deviceSlug("Cocina Baño")).toBe("cocina_bano");
    expect(deviceSlug("RT-AC65P")).toBe("rt_ac65p");
    expect(deviceSlug("ENCERRADO EN EL PATIO")).toBe("encerrado_en_el_patio");
    expect(deviceSlug("Desk  plug!!")).toBe("desk_plug");
  });

  it("returns an empty slug for names without letters or digits", () => {
    expect(deviceSlug("---")).toBe("");
    expect(deviceSlug("   ")).toBe("");
  });
});

describe("buildDeviceRows", () => {
  it("groups the mock house into 20 device rows, areas in state order with Unassigned last", () => {
    const all = rows();
    expect(all).toHaveLength(20);
    const areaSequence = [...new Set(all.map((r) => r.areaId))];
    expect(areaSequence).toEqual(["living_room", "kitchen", "bedroom", "office", UNASSIGNED]);
    expect(all.find((r) => r.areaId === UNASSIGNED)?.areaName).toBe("Unassigned");
  });

  it("marks interactive rows: 9 interactive, 11 read-only", () => {
    expect(rows().filter((r) => r.interactive)).toHaveLength(9);
    expect(rows().filter((r) => !r.interactive)).toHaveLength(11);
  });

  it("groups a switch and its power sensor into one device row with the switch as primary", () => {
    const desk = byKey(rows(), "office~desk_plug");
    expect(desk.entities.map((e) => e.entityId)).toEqual(["switch.office_desk", "sensor.office_desk_power"]);
    expect(desk.primary.entityId).toBe("switch.office_desk");
    expect(desk.label).toBe("Desk plug");
    expect(desk.domains).toEqual(["switch", "sensor"]);
    expect(desk.interactive).toBe(true);
  });

  it("keeps a standalone entity keyed by its entity id", () => {
    const front = byKey(rows(), "lock.front_door");
    expect(front.entities).toHaveLength(1);
    expect(front.label).toBe("Front door");
  });

  it("uses the device name as label with whitespace collapsed and ALL CAPS fixed", () => {
    const raw = rows(createFixtureEntities().concat([
      entity({ entityId: "binary_sensor.patio_door", domain: "binary_sensor", area: null, deviceName: "ENCERRADO EN EL PATIO" }),
      entity({ entityId: "sensor.patio_temperature", area: null, deviceName: "ENCERRADO EN EL PATIO", attributes: { device_class: "temperature" } }),
    ]));
    const patio = byKey(raw, "unassigned~encerrado_en_el_patio");
    expect(patio.label).toBe("Encerrado en el patio");
    expect(patio.primary.entityId).toBe("binary_sensor.patio_door");
  });

  it("makes two devices with the same name in different areas two rows", () => {
    const twins = rows([
      entity({ entityId: "sensor.a_temp", area: "kitchen", deviceName: "Hub", attributes: { device_class: "temperature" } }),
      entity({ entityId: "sensor.b_temp", area: "office", deviceName: "Hub", attributes: { device_class: "temperature" } }),
    ]);
    expect(twins.map((r) => r.key)).toEqual(["kitchen~hub", "office~hub"]);
  });

  it("treats a missing, null, blank or letterless deviceName as standalone, keyed by entity id", () => {
    const standalone = rows([
      entity({ entityId: "light.a", area: "kitchen", deviceName: null }),
      entity({ entityId: "light.b", area: "kitchen", deviceName: "  " }),
      entity({ entityId: "light.c", area: "kitchen", deviceName: "---" }),
      entity({ entityId: "light.d", area: "kitchen" }),
    ]);
    expect(standalone.map((r) => r.key)).toEqual(["light.a", "light.b", "light.c", "light.d"]);
  });

  it("device keys never contain a dot", () => {
    for (const r of rows()) {
      if (r.entities.length > 1) expect(r.key.includes(".")).toBe(false);
    }
  });

  it("orders members: interactive first, then binary_sensor, sensors (temperature, other, battery), other domains, then entity id", () => {
    const group = rows([
      entity({ entityId: "sensor.hub_battery", deviceName: "Hub", attributes: { device_class: "battery" } }),
      entity({ entityId: "sensor.hub_humidity", deviceName: "Hub", attributes: { device_class: "humidity" } }),
      entity({ entityId: "sensor.hub_temperature", deviceName: "Hub", attributes: { device_class: "temperature" } }),
      entity({ entityId: "binary_sensor.hub_door", deviceName: "Hub", attributes: {} }),
      entity({ entityId: "switch.hub_relay", deviceName: "Hub", attributes: {} }),
    ]);
    expect(group).toHaveLength(1);
    expect(group[0].entities.map((e) => e.entityId)).toEqual([
      "switch.hub_relay",
      "binary_sensor.hub_door",
      "sensor.hub_temperature",
      "sensor.hub_humidity",
      "sensor.hub_battery",
    ]);
  });

  it("skips entities that are neither controls nor sensors (tts, event, zone, person, ...)", () => {
    const listed = rows([
      entity({ entityId: "tts.google_translate_en_com", attributes: {} }),
      entity({ entityId: "event.hub_press", attributes: {} }),
      entity({ entityId: "zone.home", attributes: {} }),
      entity({ entityId: "person.hector", attributes: {} }),
      entity({ entityId: "sun.sun", attributes: {} }),
      entity({ entityId: "media_player.kitchen_speaker", attributes: {} }),
      entity({ entityId: "light.kitchen", attributes: {} }),
    ]);
    expect(listed.map((r) => r.key)).toEqual(["light.kitchen", "media_player.kitchen_speaker"]);
    expect(deviceFacets(listed).domains.map((d) => d.id).sort()).toEqual(["light", "media_player"]);
  });

  it("breaks ties by entity id", () => {
    const group = rows([
      entity({ entityId: "sensor.z_other", deviceName: "Hub", attributes: {} }),
      entity({ entityId: "sensor.a_other", deviceName: "Hub", attributes: {} }),
    ]);
    expect(group[0].entities.map((e) => e.entityId)).toEqual(["sensor.a_other", "sensor.z_other"]);
  });

  it("ignores availability in the member order", () => {
    const group = rows([
      entity({ entityId: "switch.hub", deviceName: "Hub", state: "unavailable" }),
      entity({ entityId: "sensor.hub_power", deviceName: "Hub", state: "42", attributes: { device_class: "power" } }),
    ]);
    expect(group[0].primary.entityId).toBe("switch.hub");
    expect(group[0].primary.state).toBe("unavailable");
  });
});

describe("filterDeviceRows", () => {
  it("empty filters keep all rows in their order", () => {
    const all = rows();
    expect(ids(filterDeviceRows(all, EMPTY_DEVICE_FILTERS))).toEqual(ids(all));
    expect(isFiltered(EMPTY_DEVICE_FILTERS)).toBe(false);
  });

  it("matches the query on the row label, area name, device name, and any member's name or entity id", () => {
    expect(ids(filter({ query: "front door" }))).toEqual(["lock.front_door"]);
    expect(ids(filter({ query: "office_desk_power" }))).toEqual(["office~desk_plug"]);
    expect(ids(filter({ query: "desk outlet power" }))).toEqual(["office~desk_plug"]);
    expect(ids(filter({ query: "entry pir" }))).toEqual(["unassigned~entry_pir"]);
    expect(ids(filter({ query: "CEILING" }))).toEqual(
      expect.arrayContaining(["light.living_room_ceiling", "light.kitchen_ceiling"]),
    );
    expect(filter({ query: "master suite" })).toHaveLength(3);
    expect(ids(filter({ query: "battery" }))).toEqual(["unassigned~entry_pir"]);
    expect(filter({ query: "  " })).toHaveLength(20);
  });

  it("a match shows the whole device row", () => {
    const matched = byKey(filter({ query: "office_desk_power" }), "office~desk_plug");
    expect(matched.entities).toHaveLength(2);
  });

  it("filters by kind on device rows", () => {
    expect(filter({ kind: "interactive" })).toHaveLength(9);
    expect(filter({ kind: "readonly" })).toHaveLength(11);
  });

  it("matches a type when any member has that domain", () => {
    const sensorRows = ids(filter({ domains: ["sensor"] }));
    expect(sensorRows).toEqual(expect.arrayContaining(["office~desk_plug", "unassigned~entry_pir", "kitchen~kitchen_sensor"]));
    expect(ids(filter({ domains: ["switch"] }))).toEqual(["office~desk_plug"]);
  });

  it("combines groups with AND and values inside a group with OR", () => {
    expect(filter({ areas: ["kitchen"], domains: ["light"] })).toHaveLength(1);
    expect(filter({ domains: ["light", "lock"] })).toHaveLength(5);
    expect(filter({ areas: ["kitchen", "office"] })).toHaveLength(5);
  });

  it("reports a filter as active only when a group or the query is set", () => {
    expect(isFiltered({ ...EMPTY_DEVICE_FILTERS, query: "x" })).toBe(true);
    expect(isFiltered({ ...EMPTY_DEVICE_FILTERS, kind: "readonly" })).toBe(true);
    expect(isFiltered({ ...EMPTY_DEVICE_FILTERS, domains: ["light"] })).toBe(true);
  });
});

describe("deviceFacets", () => {
  it("counts device rows per area, Unassigned last", () => {
    const { areas } = deviceFacets(rows());
    expect(areas.map((a) => [a.id, a.count])).toEqual([
      ["living_room", 3],
      ["kitchen", 2],
      ["bedroom", 3],
      ["office", 3],
      [UNASSIGNED, 9],
    ]);
  });

  it("counts a device once per domain it contains", () => {
    const { domains } = deviceFacets(rows());
    expect(domains.find((d) => d.label === "SENSOR")?.count).toBe(12);
    expect(domains.find((d) => d.label === "SWITCH")?.count).toBe(1);
    expect(domains.find((d) => d.label === "BINARY SENSOR")?.count).toBe(1);
    expect(domains.map((d) => d.label)).toEqual([...domains.map((d) => d.label)].sort((a, b) => a.localeCompare(b)));
  });

  it("is computed over all rows, so it does not change with filters", () => {
    const all = rows();
    const before = deviceFacets(all);
    filterDeviceRows(all, { ...EMPTY_DEVICE_FILTERS, kind: "interactive", query: "desk" });
    expect(deviceFacets(all)).toEqual(before);
  });
});

describe("resolveDeviceKey", () => {
  const all = rows();

  it("a device key resolves to its row, canonical", () => {
    const hit = resolveDeviceKey(all, "office~desk_plug");
    expect(hit?.row.key).toBe("office~desk_plug");
    expect(hit?.canonical).toBe(true);
  });

  it("a member entity id of a multi-entity device resolves to the device, not canonical", () => {
    const hit = resolveDeviceKey(all, "sensor.office_desk_power");
    expect(hit?.row.key).toBe("office~desk_plug");
    expect(hit?.canonical).toBe(false);
  });

  it("a standalone entity id resolves to its own row, canonical", () => {
    const hit = resolveDeviceKey(all, "lock.front_door");
    expect(hit?.row.key).toBe("lock.front_door");
    expect(hit?.canonical).toBe(true);
  });

  it("an unknown param resolves to null", () => {
    expect(resolveDeviceKey(all, "light.nope")).toBeNull();
    expect(resolveDeviceKey(all, "office~nope")).toBeNull();
  });
});

describe("device availability (126)", () => {
  const hub = (id: string, state: string, device = "Hub") => entity({ entityId: id, deviceName: device, state, attributes: {} });

  it("is offline only when every member is unavailable or unknown", () => {
    const [row] = rows([hub("switch.hub", "unavailable"), hub("sensor.hub_power", "unknown")]);
    expect(row.offline).toBe(true);
  });

  it("stays online while one member is still available", () => {
    const [row] = rows([hub("switch.hub", "unavailable"), hub("sensor.hub_power", "42")]);
    expect(row.offline).toBe(false);
    expect(row.primary.entityId).toBe("switch.hub");
    expect(row.statusEntity.entityId).toBe("sensor.hub_power");
  });

  it("shows the primary as status when it is available", () => {
    const [row] = rows([hub("switch.hub", "on"), hub("sensor.hub_power", "unavailable")]);
    expect(row.offline).toBe(false);
    expect(row.statusEntity.entityId).toBe("switch.hub");
  });

  it("treats a cover or scene reporting unknown as available", () => {
    const [cover] = rows([entity({ entityId: "cover.blinds", state: "unknown", attributes: {} })]);
    expect(cover.offline).toBe(false);
  });

  it("an offline standalone sensor is offline; a live device row updates from the store", () => {
    const [sensor] = rows([entity({ entityId: "sensor.co2", state: "unavailable", attributes: { device_class: "carbon_dioxide" } })]);
    expect(sensor.offline).toBe(true);

    const before = stateOf([hub("switch.hub", "on"), hub("sensor.hub_power", "42")]);
    const after = entitiesReducer(before, {
      type: "entityUpdated",
      entity: hub("switch.hub", "unavailable"),
    });
    const later = entitiesReducer(after, { type: "entityUpdated", entity: hub("sensor.hub_power", "unavailable") });
    expect(buildDeviceRows(later, plainLabel)[0].offline).toBe(true);
  });
});

describe("deviceRowKeyIn (feature 129)", () => {
  it("keys a device by area and slug, a standalone entity by its id", () => {
    const device = { entityId: "switch.office_desk", domain: "switch", name: "Desk", state: "on", attributes: {}, area: "office", lastChanged: "", deviceName: "Desk plug" } as Entity;
    expect(deviceRowKeyIn("office", device)).toBe("office~desk_plug");
    expect(deviceRowKeyIn("office", { ...device, deviceName: null })).toBe("switch.office_desk");
  });
});

// Feature 162: multi-visibility (type switch AND room switch) for the Device panel drawer.
describe("panel multi-visibility", () => {
  const house = () => stateOf(createFixtureEntities());
  const interactiveCount = (state: EntitiesState) => Object.values(state.entities).filter(isInteractive).length;
  const flatIds = (state: EntitiesState, v: Parameters<typeof visibleDeckSections>[2], selected: string | null = null) =>
    visibleDeckSections(state, selected, v).flatMap((s) => s.entities.map((e) => e.entityId));

  it("shows every interactive device when nothing is switched off", () => {
    const state = house();
    expect(flatIds(state, ALL_VISIBLE)).toHaveLength(interactiveCount(state));
  });

  it("counts interactive devices per type and per room, summing to the total", () => {
    const state = house();
    const total = interactiveCount(state);
    const types = panelTypeCounts(state);
    expect(Object.values(types).reduce((n, c) => n + c, 0)).toBe(total);
    const rooms = panelRoomCounts(state);
    expect(rooms.every((r) => r.count > 0)).toBe(true);
    expect(rooms.reduce((n, r) => n + r.count, 0)).toBe(total);
  });

  it("hides the devices of a switched-off type and leaves the others", () => {
    const state = house();
    const lights = Object.values(state.entities).filter((e) => isInteractive(e) && e.domain === "light").length;
    const v = setTypeShown(ALL_VISIBLE, "lights", false);
    const ids = flatIds(state, v);
    expect(ids).toHaveLength(interactiveCount(state) - lights);
    expect(ids.every((id) => !id.startsWith("light."))).toBe(true);
  });

  it("hides the devices of a switched-off room", () => {
    const state = house();
    const room = panelRoomCounts(state)[0];
    const v = setRoomShown(ALL_VISIBLE, room.areaId, false);
    expect(visibleDeckSections(state, null, v).some((s) => s.area.areaId === room.areaId)).toBe(false);
    expect(flatIds(state, v)).toHaveLength(interactiveCount(state) - room.count);
  });

  it("shows a device only when its type AND its room are on", () => {
    const state = house();
    const room = panelRoomCounts(state)[0].areaId;
    const v = setRoomShown(setTypeShown(ALL_VISIBLE, "lights", false), room, false);
    const lightsInRoom = Object.values(state.entities).filter(
      (e) => isInteractive(e) && e.domain === "light" && e.area === room,
    ).length;
    const inRoom = panelRoomCounts(state)[0].count;
    const lights = Object.values(state.entities).filter((e) => isInteractive(e) && e.domain === "light").length;
    // Removed = lights (type off) + room devices (room off) - lights already removed in that room (both off).
    expect(flatIds(state, v)).toHaveLength(interactiveCount(state) - lights - inRoom + lightsInRoom);
  });

  it("does not mutate the previous visibility when toggling", () => {
    const off = setTypeShown(ALL_VISIBLE, "climate", false);
    expect(ALL_VISIBLE.hiddenTypes.size).toBe(0);
    expect(off.hiddenTypes.has("climate")).toBe(true);
    expect(setTypeShown(off, "climate", true).hiddenTypes.size).toBe(0);
    expect(setRoomShown(ALL_VISIBLE, "kitchen", false).hiddenRooms.has("kitchen")).toBe(true);
  });

  it("NONE hides every listed type and room, so no device is left", () => {
    const state = house();
    const rooms = panelRoomCounts(state).map((r) => r.areaId);
    const v = hideAllListed(PANEL_TYPES, rooms);
    expect(flatIds(state, v)).toEqual([]);
    expect(switchedOffCount(v, PANEL_TYPES, rooms)).toBe(PANEL_TYPES.length + rooms.length);
  });

  it("counts only the listed types and rooms as switched off", () => {
    const v = setRoomShown(setTypeShown(ALL_VISIBLE, "plugs", false), "unknown_room", false);
    expect(switchedOffCount(v, PANEL_TYPES, ["kitchen"])).toBe(1);
    // Hidden ids that are not in the listed arrays (e.g. a room that lost its devices) do not count.
    expect(switchedOffCount(v, ["lights"], ["kitchen"])).toBe(0);
  });

  it("keeps the 3D stage room focus: a selected room narrows the deck even with every switch on", () => {
    const state = house();
    const room = panelRoomCounts(state)[0].areaId;
    const sections = visibleDeckSections(state, room, ALL_VISIBLE);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((s) => s.area.areaId === room)).toBe(true);
  });

  it("labels the types, with OTHER for the types without a pill", () => {
    expect(panelTypeLabel("lights")).toBe("LIGHTS");
    expect(panelTypeLabel("other")).toBe("OTHER");
    expect(PANEL_TYPES).toContain("other");
  });
});
