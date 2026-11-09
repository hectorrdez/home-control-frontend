import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import { tapIntentFor } from "./tileActions";

const entity = (domain: string, state: string): Entity => ({
  entityId: `${domain}.kitchen`,
  domain,
  name: "Kitchen",
  state,
  attributes: {},
  area: "kitchen",
  lastChanged: "2026-11-06T10:00:00.000Z",
});

describe("tapIntentFor (155)", () => {
  it("toggles light, switch and fan power", () => {
    expect(tapIntentFor(entity("light", "off"))).toEqual({ kind: "power", on: true });
    expect(tapIntentFor(entity("light", "on"))).toEqual({ kind: "power", on: false });
    expect(tapIntentFor(entity("switch", "off"))).toEqual({ kind: "power", on: true });
    expect(tapIntentFor(entity("fan", "on"))).toEqual({ kind: "power", on: false });
  });

  it("activates scenes and scripts", () => {
    expect(tapIntentFor(entity("scene", "scening"))).toEqual({ kind: "activate" });
    expect(tapIntentFor(entity("script", "off"))).toEqual({ kind: "activate" });
  });

  it("sends nothing for the other domains (their tap opens the detail page)", () => {
    expect(tapIntentFor(entity("climate", "heat"))).toBeNull();
    expect(tapIntentFor(entity("cover", "open"))).toBeNull();
    expect(tapIntentFor(entity("lock", "locked"))).toBeNull();
  });
});
