import type { Entity } from "../types";

export interface FixtureArea {
  areaId: string;
  name: string;
}

export const FIXTURE_AREAS: FixtureArea[] = [
  { areaId: "living_room", name: "Living room" },
  { areaId: "kitchen", name: "Kitchen" },
  { areaId: "bedroom", name: "Master suite" },
  { areaId: "office", name: "Office" },
];

export const FIXTURE_TIME = "2026-11-06T08:00:00.000Z";

function entity(
  entityId: string,
  state: string,
  attributes: Record<string, unknown>,
  area: string | null,
  name: string,
): Entity {
  return {
    entityId,
    domain: entityId.split(".")[0],
    name,
    state,
    attributes,
    area,
    lastChanged: FIXTURE_TIME,
    deviceName: null,
  };
}

// Realistic HA-shaped house matching the Stitch reference (4 rooms, mixed domains, sensors).
export function createFixtureEntities(): Entity[] {
  const roomSensors = (areaId: string, label: string, temp: string, humidity: string): Entity[] => [
    entity(`sensor.${areaId}_temperature`, temp, { device_class: "temperature", unit_of_measurement: "°C" }, areaId, `${label} temperature`),
    entity(`sensor.${areaId}_humidity`, humidity, { device_class: "humidity", unit_of_measurement: "%" }, areaId, `${label} humidity`),
  ];

  return [
    entity("light.living_room_ceiling", "on", { brightness: 200, supported_color_modes: ["color_temp"], color_temp_kelvin: 3500 }, "living_room", "Living room ceiling"),
    entity("light.kitchen_ceiling", "off", { brightness: 0, supported_color_modes: ["brightness"] }, "kitchen", "Kitchen ceiling"),
    entity("light.bedroom_lamp", "on", { brightness: 120, supported_color_modes: ["brightness"] }, "bedroom", "Bedroom lamp"),
    entity("light.office_desk", "on", { brightness: 255, supported_color_modes: ["brightness"] }, "office", "Office desk light"),
    ...roomSensors("living_room", "Living room", "22.4", "48"),
    ...roomSensors("kitchen", "Kitchen", "21.8", "52"),
    ...roomSensors("bedroom", "Master suite", "20.9", "45"),
    ...roomSensors("office", "Office", "23.1", "41"),
    entity("climate.living_room", "heat", {
      current_temperature: 22.4,
      temperature: 21,
      hvac_modes: ["off", "heat", "cool", "auto"],
      hvac_action: "heating",
      preset_modes: ["home", "away", "sleep"],
      preset_mode: "home",
      min_temp: 16,
      max_temp: 28,
      target_temp_step: 0.5,
    }, "living_room", "Thermostat"),
    entity("cover.bedroom_blinds", "open", { current_position: 70 }, "bedroom", "Bedroom blinds"),
    entity("switch.office_desk", "on", {}, "office", "Desk outlet"),
    entity("sensor.office_desk_power", "42.5", { device_class: "power", unit_of_measurement: "W" }, "office", "Desk outlet power"),
    entity("binary_sensor.entry_motion", "off", { device_class: "motion" }, null, "Entry motion"),
    entity("lock.front_door", "locked", {}, null, "Front door"),
    entity("sensor.house_power", "1240", { device_class: "power", unit_of_measurement: "W" }, null, "House power"),
    entity("sensor.energy_today", "8.6", { device_class: "energy", unit_of_measurement: "kWh" }, null, "Energy today"),
    entity("sensor.co2", "612", { device_class: "carbon_dioxide", unit_of_measurement: "ppm" }, null, "CO2"),
    entity("sensor.pm25", "9", { device_class: "pm25", unit_of_measurement: "µg/m³" }, null, "PM2.5"),
    entity("sensor.hvac_filter_life", "82", { device_class: "battery", unit_of_measurement: "%" }, null, "HVAC filter life"),
    entity("sensor.solar_power", "960", { device_class: "power", unit_of_measurement: "W" }, null, "Solar power"),
    entity("sensor.entry_motion_battery", "87", { device_class: "battery", unit_of_measurement: "%" }, null, "Entry motion battery"),
    entity("scene.dawn", "2026-11-06T06:00:00.000Z", {}, null, "Dawn"),
  ];
}

// Feature 120 "many-devices" scenario: 20 extra lights so the device list overflows its container (119 scroll proof).
export function createManyDeviceEntities(): Entity[] {
  return Array.from({ length: 20 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return entity(`light.strip_${n}`, "off", { brightness: 0, supported_color_modes: ["brightness"] }, "office", `Strip ${n}`);
  });
}

// Feature 115 "raw-names" scenario: the real HA names (sibling prefixes, ALL CAPS, double spaces) in the unassigned area.
export function createRawNameEntities(): Entity[] {
  const raw = (entityId: string, state: string, attributes: Record<string, unknown>, name: string, deviceName: string): Entity => ({
    ...entity(entityId, state, attributes, null, name),
    deviceName,
  });
  return [
    raw("sensor.rt_ac65p_download_speed", "42", { device_class: "data_rate", state_class: "measurement", unit_of_measurement: "Mbit/s" }, "RT-AC65P Velocidad de descarga", "RT-AC65P"),
    raw("sensor.rt_ac65p_upload_speed", "7", { device_class: "data_rate", state_class: "measurement", unit_of_measurement: "Mbit/s" }, "RT-AC65P Velocidad de subida", "RT-AC65P"),
    raw("sensor.samsung_s24_battery_level", "76", { device_class: "battery", unit_of_measurement: "%" }, "samsung s24 hector Battery level", "samsung s24 hector"),
    raw("sensor.samsung_s24_battery_state", "charging", {}, "samsung s24 hector Battery state", "samsung s24 hector"),
    raw("sensor.backup_status", "idle", {}, "Backup Estado del administrador de copias de seguridad", "Backup"),
    raw("sensor.backup_next", "2026-11-07T03:00:00.000Z", { device_class: "timestamp" }, "Backup Próxima copia de seguridad", "Backup"),
    raw("binary_sensor.patio_door", "off", { device_class: "door" }, "ENCERRADO EN EL PATIO  Batería", "ENCERRADO EN EL PATIO"),
    raw("sensor.patio_temperature", "14.2", { device_class: "temperature", unit_of_measurement: "°C" }, "ENCERRADO EN EL PATIO  Temperatura", "ENCERRADO EN EL PATIO"),
  ];
}
