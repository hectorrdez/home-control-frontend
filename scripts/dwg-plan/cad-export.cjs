#!/usr/bin/env node
// Refined house plan (src/house/dwgPlan.json, feature 151) -> CAD drawing (DXF R12, AC1009, metres).
//
// Output: a 3D model at the origin (z up, levels stacked at n * LEVEL_H) plus, to its right, a 2D sheet with
// planta / alzado principal / perfil (section) per floor. Entities: LINE, 3DFACE, TEXT only. No hidden-line removal.
//
// Usage: node scripts/dwg-plan/cad-export.cjs [plan.json] [out.dxf]
// DWG: convert with LibreDWG 0.14 (experimental writer): dxf2dwg -y --as r2004 -o casa-3d.dwg casa-3d.dxf
//      (use r2004: the default r2000 output drops every TEXT value). Check with: dwgread -O JSON casa-3d.dwg
"use strict";
const fs = require("fs");
const path = require("path");

const LEVEL_H = 2.7;
const SILL = 0.9;
const HEAD = 2.1;
const SLAB = 0.15;

const DEFAULT_PLAN = path.join(__dirname, "../../src/house/dwgPlan.json");
const DEFAULT_OUT = path.join(__dirname, "../../../casa-3d.dxf");

const LAYERS = [
  ["M3D-WALL", 7], ["M3D-GLAZ", 4], ["M3D-STAIR", 2], ["M3D-FURN", 8], ["M3D-SLAB", 9], ["M3D-ROOF", 3], ["M3D-ANNO", 7],
  ["A-WALL", 7], ["A-DOOR", 1], ["A-GLAZ", 4], ["A-STAIR", 2], ["A-FURN", 8], ["A-ROOF", 3], ["A-DIMS", 6], ["A-ANNO", 7], ["A-VIEW", 5],
];

// Vertical section x per floor (metres, along the facade).
const CUT = { ground: 0.45, upper: 2.0, attic: 2.5 };

function fmt(v) {
  const s = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/\.?0+$/, "");
  return s === "" || s === "-0" ? "0" : s;
}

function countEntities(dxf) {
  const lines = dxf.split(/\r?\n/);
  const counts = {};
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const type = lines[i + 1].trim();
    if (lines[i].trim() === "0" && (type === "LINE" || type === "3DFACE" || type === "TEXT")) {
      counts[type] = (counts[type] || 0) + 1;
    }
  }
  return counts;
}

function buildDxf(plan) {
  // Entities are arrays of [groupCode, value] pairs.
  const ents = [];
  const ext = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let view = null; // 2D bounds of the sheet view being drawn

  function track(x, y, z) {
    const p = [x, y, z];
    for (let i = 0; i < 3; i++) {
      if (p[i] < ext.min[i]) ext.min[i] = p[i];
      if (p[i] > ext.max[i]) ext.max[i] = p[i];
    }
    if (view) {
      if (x < view.min[0]) view.min[0] = x;
      if (y < view.min[1]) view.min[1] = y;
      if (x > view.max[0]) view.max[0] = x;
      if (y > view.max[1]) view.max[1] = y;
    }
  }

  function face(layer, p) {
    p.forEach(([x, y, z]) => track(x, y, z));
    const [a, b, c, d] = p;
    ents.push([
      [0, "3DFACE"], [8, layer],
      [10, fmt(a[0])], [11, fmt(b[0])], [12, fmt(c[0])], [13, fmt(d[0])],
      [20, fmt(a[1])], [21, fmt(b[1])], [22, fmt(c[1])], [23, fmt(d[1])],
      [30, fmt(a[2])], [31, fmt(b[2])], [32, fmt(c[2])], [33, fmt(d[2])],
    ]);
  }

  // Axis-aligned box: 6 faces. Degenerate boxes are skipped.
  function box(layer, x, y, w, d, z0, z1) {
    if (!(w > 0 && d > 0 && z1 > z0)) return;
    const x1 = x + w, y1 = y + d;
    face(layer, [[x, y, z0], [x1, y, z0], [x1, y1, z0], [x, y1, z0]]);
    face(layer, [[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]]);
    face(layer, [[x, y, z0], [x1, y, z0], [x1, y, z1], [x, y, z1]]);
    face(layer, [[x, y1, z0], [x1, y1, z0], [x1, y1, z1], [x, y1, z1]]);
    face(layer, [[x, y, z0], [x, y1, z0], [x, y1, z1], [x, y, z1]]);
    face(layer, [[x1, y, z0], [x1, y1, z0], [x1, y1, z1], [x1, y, z1]]);
  }

  function line(layer, x1, y1, x2, y2) {
    track(x1, y1, 0);
    track(x2, y2, 0);
    ents.push([
      [0, "LINE"], [8, layer],
      [10, fmt(x1)], [20, fmt(y1)], [30, "0"],
      [11, fmt(x2)], [21, fmt(y2)], [31, "0"],
    ]);
  }

  // Rectangle outline (x, y) min corner, w along x, h along y (or z on the elevations).
  function rect(layer, x, y, w, h) {
    line(layer, x, y, x + w, y);
    line(layer, x + w, y, x + w, y + h);
    line(layer, x + w, y + h, x, y + h);
    line(layer, x, y + h, x, y);
  }

  // Dimension line with 45-degree slashes at both ends.
  function dim(layer, x1, y1, x2, y2) {
    line(layer, x1, y1, x2, y2);
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      line(layer, px - 0.1, py - 0.1, px + 0.1, py + 0.1);
    }
  }

  // align: undefined/left, "center" or "right" (anchor = insertion point for all three).
  function text(layer, x, y, z, height, str, align) {
    track(x, y, z);
    const e = [
      [0, "TEXT"], [8, layer],
      [10, fmt(x)], [20, fmt(y)], [30, fmt(z)],
      [40, fmt(height)], [1, String(str).replace(/[\r\n]+/g, " ")],
    ];
    if (align) {
      e.push([72, align === "right" ? 2 : 1], [11, fmt(x)], [21, fmt(y)], [31, fmt(z)]);
    }
    ents.push(e);
  }

  // Draws a sheet view and frames it (0.5 m margin) with its title above.
  function sheetView(title, draw) {
    view = { min: [Infinity, Infinity], max: [-Infinity, -Infinity] };
    draw();
    const b = view;
    view = null;
    const L = b.min[0] - 0.5, B = b.min[1] - 0.5, R = b.max[0] + 0.5, T = b.max[1] + 0.5;
    rect("A-VIEW", L, B, R - L, T - B);
    text("A-VIEW", L, T + 0.15, 0, 0.35, title);
  }

  function model3d(f) {
    const z0 = f.level * LEVEL_H;

    for (const w of f.walls) box("M3D-WALL", w.x, w.y, w.w, w.d, z0, z0 + w.h);

    for (const o of f.openings) {
      if (o.kind === "window") {
        box("M3D-WALL", o.x, o.y, o.w, o.d, z0, z0 + SILL);
        box("M3D-WALL", o.x, o.y, o.w, o.d, z0 + HEAD, z0 + LEVEL_H);
        const zb = z0 + SILL, zt = z0 + HEAD;
        if (o.w >= o.d) {
          const yc = o.y + o.d / 2;
          face("M3D-GLAZ", [[o.x, yc, zb], [o.x + o.w, yc, zb], [o.x + o.w, yc, zt], [o.x, yc, zt]]);
        } else {
          const xc = o.x + o.w / 2;
          face("M3D-GLAZ", [[xc, o.y, zb], [xc, o.y + o.d, zb], [xc, o.y + o.d, zt], [xc, o.y, zt]]);
        }
      } else if (o.kind === "door" && Math.min(o.w, o.d) <= 0.35) {
        box("M3D-WALL", o.x, o.y, o.w, o.d, z0 + HEAD, z0 + LEVEL_H);
      }
    }

    for (const fu of f.furniture) box("M3D-FURN", fu.x, fu.y, fu.w, fu.d, z0, z0 + fu.h);
    for (const s of f.steps || []) box("M3D-STAIR", s.x, s.y, s.w, s.d, s.base, s.base + s.h);

    if (f.level > 0) {
      for (const r of f.rooms) for (const p of r.parts) box("M3D-SLAB", p.x, p.y, p.w, p.d, z0 - SLAB, z0);
    }

    if (f.roof) {
      const r = f.roof;
      const eave = z0 + r.knee, ridge = z0 + r.ridge, ym = r.y + r.d / 2;
      face("M3D-ROOF", [[r.x, r.y, eave], [r.x + r.w, r.y, eave], [r.x + r.w, ym, ridge], [r.x, ym, ridge]]);
      face("M3D-ROOF", [[r.x, r.y + r.d, eave], [r.x + r.w, r.y + r.d, eave], [r.x + r.w, ym, ridge], [r.x, ym, ridge]]);
      for (const gx of [r.x, r.x + r.w]) {
        face("M3D-ROOF", [[gx, r.y, eave], [gx, r.y + r.d, eave], [gx, ym, ridge], [gx, ym, ridge]]);
      }
    }

    for (const room of f.rooms) {
      text("M3D-ANNO", room.x + room.w / 2, room.y + room.d / 2, z0 + 0.05, 0.2, room.label);
    }
  }

  function planta(f, X) {
    sheetView(`${f.label.toUpperCase()} - PLANTA`, () => {
      for (const w of f.walls) rect("A-WALL", X + w.x, w.y, w.w, w.d);

      for (const o of f.openings) {
        if (o.kind === "window") {
          rect("A-GLAZ", X + o.x, o.y, o.w, o.d);
          if (o.w >= o.d) line("A-GLAZ", X + o.x, o.y + o.d / 2, X + o.x + o.w, o.y + o.d / 2);
          else line("A-GLAZ", X + o.x + o.w / 2, o.y, X + o.x + o.w / 2, o.y + o.d);
        } else {
          rect("A-DOOR", X + o.x, o.y, o.w, o.d);
        }
      }

      for (const fu of f.furniture) rect("A-FURN", X + fu.x, fu.y, fu.w, fu.d);
      for (const s of f.steps || []) rect("A-STAIR", X + s.x, s.y, s.w, s.d);

      if (f.roof) {
        const r = f.roof;
        rect("A-ROOF", X + r.x, r.y, r.w, r.d);
        line("A-ROOF", X + r.x, r.y + r.d / 2, X + r.x + r.w, r.y + r.d / 2);
      }

      for (const room of f.rooms) {
        const cx = X + room.x + room.w / 2, cy = room.y + room.d / 2;
        const area = room.parts.reduce((s, p) => s + p.w * p.d, 0);
        text("A-ANNO", cx, cy, 0, 0.18, room.label, "center");
        text("A-ANNO", cx, cy - 0.25, 0, 0.18, `${area.toFixed(1)} m2`, "center");
      }

      dim("A-DIMS", X, -0.6, X + f.width, -0.6);
      text("A-DIMS", X + f.width / 2, -0.9, 0, 0.18, f.width.toFixed(2), "center");
      dim("A-DIMS", X - 0.6, 0, X - 0.6, f.depth);
      text("A-DIMS", X - 0.7, f.depth / 2, 0, 0.18, f.depth.toFixed(2), "right");
    });
  }

  function alzado(f, X) {
    const Y = -7;
    sheetView(`${f.label.toUpperCase()} - ALZADO PRINCIPAL`, () => {
      for (const w of f.walls) if (w.y < 1.0) rect("A-WALL", X + w.x, Y, w.w, w.h);
      for (const o of f.openings) {
        if (o.kind === "window" && o.y < 1.0) rect("A-GLAZ", X + o.x, Y + SILL, o.w, HEAD - SILL);
      }
      line("A-WALL", X - 0.5, Y, X + f.width + 0.5, Y);

      if (f.roof) {
        const r = f.roof;
        rect("A-ROOF", X + r.x, Y + r.knee, r.w, r.ridge - r.knee);
      }

      const dx = X + f.width + 0.6;
      dim("A-DIMS", dx, Y, dx, Y + f.height);
      text("A-DIMS", dx + 0.2, Y + f.height / 2, 0, 0.18, f.height.toFixed(2));
    });
  }

  function perfil(f, X) {
    const Y = -14;
    const cut = CUT[f.id] !== undefined ? CUT[f.id] : f.width / 2;
    sheetView(`${f.label.toUpperCase()} - PERFIL (SECCION X=${cut} m)`, () => {
      for (const w of f.walls) {
        if (w.x <= cut && cut <= w.x + w.w) rect("A-WALL", X + w.y, Y, w.d, w.h);
      }
      for (const fu of f.furniture) {
        if (fu.x <= cut && cut <= fu.x + fu.w) rect("A-FURN", X + fu.y, Y, fu.d, fu.h);
      }
      for (const s of f.steps || []) rect("A-STAIR", X + s.y, Y + s.base, s.d, s.h);

      if (f.roof) {
        const r = f.roof;
        const pts = [
          [r.y, 0], [r.y, r.knee], [r.y + r.d / 2, r.ridge], [r.y + r.d, r.knee], [r.y + r.d, 0],
        ].map(([py, pz]) => [X + py, Y + pz]);
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          line("A-ROOF", a[0], a[1], b[0], b[1]);
        }
      }

      line("A-WALL", X - 0.5, Y, X + f.depth + 0.5, Y);
    });
  }

  for (const f of plan.floors) model3d(f);
  plan.floors.forEach((f, i) => {
    const X = 12 + i * 14;
    planta(f, X);
    alzado(f, X);
    perfil(f, X);
  });
  text("A-VIEW", 0, 11.5, 0, 0.4, "MODELO 3D");

  const entText = ents
    .map((e) => e.map(([c, v]) => `${c}\r\n${v}`).join("\r\n"))
    .join("\r\n");
  const bounds = ext.min.map((m, i) => [fmt(m), fmt(ext.max[i])]);

  const layerEnts = LAYERS.map(
    ([name, color]) => `0\r\nLAYER\r\n2\r\n${name}\r\n70\r\n0\r\n62\r\n${color}\r\n6\r\nCONTINUOUS`
  ).join("\r\n");

  return [
    "0", "SECTION", "2", "HEADER",
    "9", "$ACADVER", "1", "AC1009",
    "9", "$INSUNITS", "70", "6",
    "9", "$DWGCODEPAGE", "3", "ANSI_1252",
    "9", "$EXTMIN", "10", bounds[0][0], "20", bounds[1][0], "30", bounds[2][0],
    "9", "$EXTMAX", "10", bounds[0][1], "20", bounds[1][1], "30", bounds[2][1],
    "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES",
    "0", "TABLE", "2", "LTYPE", "70", "1",
    "0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0.0",
    "0", "ENDTAB",
    "0", "TABLE", "2", "LAYER", "70", String(LAYERS.length),
    layerEnts,
    "0", "ENDTAB",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    entText,
    "0", "ENDSEC",
    "0", "EOF",
    "",
  ].join("\r\n");
}

if (require.main === module) {
  const [inFile = DEFAULT_PLAN, outFile = DEFAULT_OUT] = process.argv.slice(2);
  const plan = JSON.parse(fs.readFileSync(inFile, "utf8"));
  const dxf = buildDxf(plan);
  fs.writeFileSync(outFile, Buffer.from(dxf, "latin1"));
  console.log(`wrote ${outFile}`);
  for (const [type, n] of Object.entries(countEntities(dxf))) console.log(`${type}: ${n}`);
}

module.exports = { buildDxf };
