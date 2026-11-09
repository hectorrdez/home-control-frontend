import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// convert.cjs is CommonJS (no deps); load it from this ESM test.
const require = createRequire(import.meta.url);
const { flatten, convert } = require("./convert.cjs");

// Tiny LibreDWG-like JSON: one LAYER object and two horizontal LINE entities on it, 0.3 m apart on the ground facade.
const layerHandle = [0, 1, 16];
const synthetic = {
  OBJECTS: [
    { object: "LAYER", name: "tabiqueria", handle: layerHandle },
    {
      entity: "LINE",
      entmode: 2,
      layer: [5, 1, 16, 16],
      handle: [0, 1, 20],
      start: [1969, 1428.55],
      end: [1972, 1428.55],
    },
    {
      entity: "LINE",
      entmode: 2,
      layer: [5, 1, 16, 16],
      handle: [0, 1, 21],
      start: [1969, 1428.85],
      end: [1972, 1428.85],
    },
  ],
};

describe("dwg-plan converter", () => {
  it("flattens layered LINE entities and pairs them into a wall", () => {
    const flat = flatten(synthetic);
    expect(flat).toHaveLength(2);
    expect(flat.every((e) => e.layer === "tabiqueria" && e.kind === "line")).toBe(true);

    const walls = convert(flat).floors[0].walls;
    const wall = walls.find((w) => w.kind === "wall");
    expect(wall).toBeDefined();
    expect(wall.d).toBeCloseTo(0.3, 2);
    expect(walls.filter((w) => w.kind !== "wall").map((w) => w.kind).sort()).toEqual(["boundary", "party", "party"]);
  });

  it("emits the rooms of each floor in the configured order", () => {
    const { floors } = convert(flatten(synthetic));
    expect(floors.map((f) => f.rooms.map((r) => r.id))).toEqual([
      ["salon", "cocina", "bano-pb", "taller", "patio"],
      ["dormitorio-principal", "bano", "distribuidor", "dormitorio-2", "dormitorio-3", "terraza"],
    ]);
  });
});
