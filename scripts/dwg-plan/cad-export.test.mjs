import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// cad-export.cjs is CommonJS (no deps); load it from this ESM test.
const require = createRequire(import.meta.url);
const { buildDxf } = require("./cad-export.cjs");
const plan = require("../../src/house/dwgPlan.json");

const LAYER_NAMES = [
  "M3D-WALL", "M3D-GLAZ", "M3D-STAIR", "M3D-FURN", "M3D-SLAB", "M3D-ROOF", "M3D-ANNO",
  "A-WALL", "A-DOOR", "A-GLAZ", "A-STAIR", "A-FURN", "A-ROOF", "A-DIMS", "A-ANNO", "A-VIEW",
];

describe("dwg-plan CAD export", () => {
  const dxf = buildDxf(plan);

  it("writes an ASCII R12 DXF with every layer and ends with EOF", () => {
    expect(dxf).toContain("AC1009");
    for (const name of LAYER_NAMES) expect(dxf).toContain(name);
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
  });

  it("emits a 3D model made of faces", () => {
    expect(dxf.split("3DFACE").length - 1).toBeGreaterThanOrEqual(500);
  });

  it("writes a TEXT for every room label", () => {
    for (const floor of plan.floors) {
      for (const room of floor.rooms) expect(dxf).toContain(room.label);
    }
  });

  it("titles the 9 views (planta, alzado, perfil per floor)", () => {
    for (const floor of plan.floors) {
      const base = floor.label.toUpperCase();
      expect(dxf).toContain(`${base} - PLANTA`);
      expect(dxf).toContain(`${base} - ALZADO PRINCIPAL`);
      expect(dxf).toContain(`${base} - PERFIL (SECCION X=`);
    }
    expect(dxf).toContain("MODELO 3D");
  });
});
