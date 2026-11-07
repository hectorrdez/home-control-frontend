import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import { attributeRows, formatAttributeValue } from "./attributes";

// Feature 122: value formatting of the ATTRIBUTES list (string as-is, numbers/booleans String(), arrays joined,
// objects JSON, null/undefined as --).
describe("formatAttributeValue", () => {
  it("keeps strings as they are", () => {
    expect(formatAttributeValue("heat")).toBe("heat");
  });

  it("stringifies numbers and booleans", () => {
    expect(formatAttributeValue(255)).toBe("255");
    expect(formatAttributeValue(0.5)).toBe("0.5");
    expect(formatAttributeValue(true)).toBe("true");
    expect(formatAttributeValue(false)).toBe("false");
  });

  it("joins arrays with a comma and a space", () => {
    expect(formatAttributeValue(["color_temp", "brightness"])).toBe("color_temp, brightness");
    expect(formatAttributeValue([])).toBe("");
  });

  it("renders objects as JSON", () => {
    expect(formatAttributeValue({ a: 1 })).toBe('{"a":1}');
  });

  it("shows null and undefined as --", () => {
    expect(formatAttributeValue(null)).toBe("--");
    expect(formatAttributeValue(undefined)).toBe("--");
  });
});

describe("attributeRows", () => {
  const lamp: Entity = {
    entityId: "light.office_desk",
    domain: "light",
    name: "Office desk light",
    state: "on",
    attributes: { supported_color_modes: ["brightness"], brightness: 255, friendly: null },
    area: "office",
    lastChanged: "2026-11-06T08:00:00.000Z",
    deviceName: null,
  };

  it("lists every attribute sorted by key with its formatted value", () => {
    expect(attributeRows(lamp)).toEqual([
      { key: "brightness", value: "255" },
      { key: "friendly", value: "--" },
      { key: "supported_color_modes", value: "brightness" },
    ]);
  });

  it("returns no rows for an entity without attributes", () => {
    expect(attributeRows({ ...lamp, attributes: {} })).toEqual([]);
  });
});
