import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import { cleanName, displayName, shortName } from "./displayName";

function entity(name: string, deviceName?: string | null, extra: Partial<Entity> = {}): Entity {
  return {
    entityId: "sensor.example",
    domain: "sensor",
    name,
    state: "1",
    attributes: {},
    area: null,
    lastChanged: "2026-11-06T08:00:00.000Z",
    ...(deviceName === undefined ? {} : { deviceName }),
    ...extra,
  };
}

describe("displayName device strip (real example names)", () => {
  it.each([
    ["RT-AC65P Velocidad de descarga", "RT-AC65P", "Velocidad de descarga"],
    ["samsung s24 hector Battery level", "samsung s24 hector", "Battery level"],
    ["Backup Estado del administrador de copias de seguridad", "Backup", "Estado del administrador de copias de seguridad"],
    ["ENCERRADO EN EL PATIO  Batería", "ENCERRADO EN EL PATIO", "Batería"],
    ["rt-ac65p Velocidad de subida", "RT-AC65P", "Velocidad de subida"],
  ])("%s with device %s -> %s", (name, device, expected) => {
    expect(displayName(entity(name, device))).toBe(expected);
  });

  it("collapses the double space before the ALL CAPS fix when there is no device", () => {
    expect(displayName(entity("ENCERRADO EN EL PATIO  Batería", null))).toBe("Encerrado en el patio Batería");
  });

  it("does not strip on a partial word match", () => {
    expect(displayName(entity("Backupper status", "Backup"))).toBe("Backupper status");
  });

  it("keeps a name equal to the device name", () => {
    expect(displayName(entity("RT-AC65P", "RT-AC65P"))).toBe("RT-AC65P");
  });

  it("strips nothing when deviceName is absent, null or empty", () => {
    expect(displayName(entity("Bedroom lamp"))).toBe("Bedroom lamp");
    expect(displayName(entity("Bedroom lamp", null))).toBe("Bedroom lamp");
    expect(displayName(entity("Bedroom lamp", ""))).toBe("Bedroom lamp");
  });

  it("never infers a prefix from sibling names", () => {
    expect(displayName(entity("Bedroom blinds", null))).toBe("Bedroom blinds");
  });
});

describe("cleanName rules", () => {
  it("keeps acronyms and mixed-case words", () => {
    expect(displayName(entity("CO2"))).toBe("CO2");
    expect(displayName(entity("PM2.5"))).toBe("PM2.5");
    expect(displayName(entity("HVAC filter life"))).toBe("HVAC filter life");
    expect(displayName(entity("TV LED"))).toBe("TV LED");
  });

  it("sentence-cases an ALL CAPS run of 2+ words", () => {
    expect(displayName(entity("ENTRY DOOR OPEN"))).toBe("Entry door open");
  });

  it("falls back to the entity id for empty names", () => {
    expect(displayName(entity("   "))).toBe("sensor.example");
  });

  it("is idempotent on clean names", () => {
    const once = displayName(entity("RT-AC65P Velocidad de descarga", "RT-AC65P"));
    expect(displayName(entity(once, "RT-AC65P"))).toBe(once);
  });
});

describe("shortName area strip", () => {
  it("strips the area from a title when nothing else was stripped", () => {
    expect(shortName(entity("Living room ceiling"), "Living room")).toBe("Ceiling");
  });

  it("does not strip the area when the device strip already applied", () => {
    expect(shortName(entity("Living room ceiling", "Living room"), "Living room")).toBe("ceiling");
    expect(cleanName(entity("Living room Living room ceiling", "Living room"), { areaName: "Living room", stripArea: true })).toBe("Living room ceiling");
  });

  it("keeps the name when the remainder would be empty", () => {
    expect(shortName(entity("Living room"), "Living room")).toBe("Living room");
  });
});
