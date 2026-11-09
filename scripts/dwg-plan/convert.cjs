#!/usr/bin/env node
// DWG floor plan -> refined house plan JSON (feature 149).
//
// Input:  LibreDWG JSON export of "planos casa reforma revisar.dwg":
//           dwgread -O JSON -o plan.json "planos casa reforma revisar.dwg"   (LibreDWG 0.14, win64 release)
// Output: src/house/dwgPlan.json  (metres, per floor; x = right along the facade, y = from the facade to the back)
//
// The DWG has no TEXT entities, so room names and HA area candidates are refined by hand in FLOORS below
// (rectangles in DWG model coordinates, read from the tabiqueria layer). Everything else is extracted:
// walls (paired parallel lines of layer tabiqueria + the single-line party walls), windows/doors (carpinteria
// blocks v120/p72/p80), stair treads and furniture/fixture footprints (muebles, cocina, sanitarios, armarios).
//
// Usage: node scripts/dwg-plan/convert.cjs <plan.json> [out.json]
"use strict";
const fs = require("fs");
const path = require("path");

const Y0 = 1428.55; // facade (front) line, both floors
const Y1 = 1438.96; // back boundary of patio / terrace

const FLOORS = [
  {
    id: "ground",
    label: "Planta baja",
    x0: 1968.95,
    x1: 1973.94,
    stairs: [{ x0: 1968.9, y0: 1432.4, x1: 1969.8, y1: 1434.7 }],
    ignore: [], // regions whose tabiqueria lines are not walls
    rooms: [
      { id: "salon", label: "Salón", areaIds: ["living_room", "salon", "sala_de_estar"], hue: "primary-container", r: [1968.95, 1429.13, 1973.81, 1432.4] },
      { id: "cocina", label: "Cocina-comedor", areaIds: ["kitchen", "cocina", "comedor"], hue: "tertiary-fixed-dim", r: [1971.61, 1432.4, 1973.94, 1435.58] },
      { id: "bano-pb", label: "Baño planta baja", areaIds: ["aseo", "bano_planta_baja", "bathroom_ground"], hue: "secondary", r: [1969.84, 1432.91, 1971.5, 1435.59] },
      // back zone: the partition at x=1970.26 (door p72 from the patio) encloses a 1.3 m strip = taller (workshop, under the terrace)
      { id: "taller", label: "Taller", areaIds: ["taller", "workshop"], hue: "tertiary-fixed-dim", r: [1968.95, 1435.88, 1970.23, 1438.96] },
      { id: "patio", label: "Patio", areaIds: ["patio", "jardin", "garden"], hue: "primary-container", r: [1970.29, 1435.88, 1973.94, 1438.96], outdoor: true },
    ],
  },
  {
    id: "upper",
    label: "Planta alta",
    x0: 1976.58,
    x1: 1981.57,
    stairs: [{ x0: 1976.5, y0: 1432.5, x1: 1978.3, y1: 1434.8 }],
    ignore: [{ x0: 1976.5, y0: 1435.86, x1: 1981.6, y1: 1439, keepY: 1435.88 }], // tile grid of the terrace (keeps the back wall line)
    rooms: [
      { id: "dormitorio-principal", label: "Dormitorio principal", areaIds: ["bedroom", "dormitorio_principal", "master_bedroom", "dormitorio"], hue: "secondary", r: [1978.32, 1432.9, 1981.57, 1435.33] },
      { id: "bano", label: "Baño", areaIds: ["bathroom", "bano", "aseo_planta_alta"], hue: "primary-container", r: [1980.19, 1431.98, 1981.51, 1432.84] },
      { id: "distribuidor", label: "Distribuidor", areaIds: ["hallway", "pasillo", "distribuidor"], hue: "primary-container", r: [1977.44, 1431.98, 1980.13, 1432.84] },
      { id: "dormitorio-2", label: "Dormitorio 2", areaIds: ["office", "dormitorio_2", "despacho", "bedroom_2"], hue: "primary-container", r: [1976.58, 1429.13, 1979.04, 1431.92] },
      { id: "dormitorio-3", label: "Dormitorio 3", areaIds: ["dormitorio_3", "bedroom_3"], hue: "secondary", r: [1979.11, 1429.13, 1981.57, 1431.92] },
      { id: "terraza", label: "Terraza", areaIds: ["terraza", "terrace", "cubierta"], hue: "tertiary-fixed-dim", r: [1976.58, 1435.88, 1981.57, 1438.96], outdoor: true },
    ],
  },
];

const PARTY_WALL = 0.12; // party walls are single lines in the DWG; modelled inwards with this thickness
const MIN_GAP = 0.03;
const MAX_GAP = 0.62;
const EPS = 1e-3;
const HEIGHTS = { cocina: 0.9, armarios: 2.0, sanitarios: 0.7, muebles: 0.75 };
const BLOCK_HEIGHTS = { "cama-105": 0.55, cama_g: 0.55, silla: 0.9, "mesa-peque": 0.45, comedor: 0.8, chanlong: 0.8 };

// ---------- LibreDWG JSON -> flat entity list (model space, INSERTs expanded) ----------
function flatten(j) {
  const O = j.OBJECTS;
  const H = (h) => (Array.isArray(h) ? h[h.length - 1] : h);
  const byH = {};
  for (const o of O) if (o.handle) byH[H(o.handle)] = o;
  const blockEnts = {};
  const verts = {};
  for (const o of O) {
    if (o.entity === "VERTEX_2D") (verts[H(o.ownerhandle)] ||= []).push(o);
    else if (o.entity && o.entmode === 0) (blockEnts[H(o.ownerhandle)] ||= []).push(o);
  }
  const out = [];
  const tf = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[4], m[2] * p[0] + m[3] * p[1] + m[5]];
  const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[0] * b[4] + a[1] * b[5] + a[4], a[2] * b[4] + a[3] * b[5] + a[5]];
  function walk(e, m, insert, parentLayer) {
    let layer = byH[H(e.layer)]?.name ?? "0";
    if (layer === "0" && parentLayer) layer = parentLayer;
    const t = (p) => tf(m, p);
    const push = (kind, pts) => out.push({ kind, layer, pts, insert });
    if (e.entity === "LINE") push("line", [t(e.start), t(e.end)]);
    else if (e.entity === "LWPOLYLINE") push("poly", e.points.map(t));
    else if (e.entity === "POLYLINE_2D") push("poly", (verts[H(e.handle)] || []).map((v) => t(v.point)));
    else if (e.entity === "ARC" || e.entity === "CIRCLE") {
      const a0 = e.entity === "ARC" ? e.start_angle : 0;
      let span = e.entity === "ARC" ? e.end_angle - a0 : 2 * Math.PI;
      if (span <= 0) span += 2 * Math.PI;
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const a = a0 + (span * i) / 16;
        pts.push(t([e.center[0] + e.radius * Math.cos(a), e.center[1] + e.radius * Math.sin(a)]));
      }
      push("arc", pts);
    } else if (e.entity === "INSERT") {
      const r = e.rotation || 0;
      const s = e.scale || [1, 1, 1];
      const local = [Math.cos(r) * s[0], -Math.sin(r) * s[1], Math.sin(r) * s[0], Math.cos(r) * s[1], e.ins_pt[0], e.ins_pt[1]];
      const ins = { block: byH[H(e.block_header)].name, id: H(e.handle) };
      for (const c of blockEnts[H(e.block_header)] || []) walk(c, mul(m, local), insert ?? ins, layer);
    }
  }
  for (const o of O) if (o.entity && o.entmode === 2) walk(o, [1, 0, 0, 1, 0, 0], null, null);
  return out;
}

// ---------- helpers ----------
const inside = (p, r) => p[0] >= r.x0 - EPS && p[0] <= r.x1 + EPS && p[1] >= r.y0 - EPS && p[1] <= r.y1 + EPS;
const bbox = (pts) => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const round = (v) => Math.round(v * 1000) / 1000;

// Walls: pair parallel axis-aligned lines (gap MIN_GAP..MAX_GAP, nothing parallel in between) over their overlap.
function pairWalls(lines) {
  const walls = [];
  for (const axis of ["h", "v"]) {
    // normalise to {c: constant coord, a, b: interval}
    const segs = lines
      .filter((l) => l.axis === axis)
      .map((l) => (axis === "h" ? { c: l.p[1], a: Math.min(l.p[0], l.q[0]), b: Math.max(l.p[0], l.q[0]) } : { c: l.p[0], a: Math.min(l.p[1], l.q[1]), b: Math.max(l.p[1], l.q[1]) }));
    for (const s of segs) {
      // nearest parallel line(s) above/right of s; every line at that distance closes a wall over its overlap
      const cands = segs
        .map((o) => ({ o, gap: o.c - s.c, a: Math.max(s.a, o.a), b: Math.min(s.b, o.b) }))
        .filter((x) => x.gap >= MIN_GAP && x.gap <= MAX_GAP && x.b - x.a >= 0.04);
      if (!cands.length) continue;
      const g = Math.min(...cands.map((x) => x.gap));
      for (const best of cands.filter((x) => x.gap - g < EPS)) {
        const blocked = segs.some((m) => m.c > s.c + EPS && m.c < best.o.c - EPS && Math.min(m.b, best.b) - Math.max(m.a, best.a) > 0.04);
        if (blocked) continue;
        const w = axis === "h" ? [best.a, s.c, best.b, best.o.c] : [s.c, best.a, best.o.c, best.b];
        if (!walls.some((x) => x.every((v, i) => Math.abs(v - w[i]) < EPS))) walls.push(w);
      }
    }
  }
  return walls;
}

function convert(flat) {
  const floors = FLOORS.map((F) => {
    const R = { x0: F.x0 - 0.05, y0: Y0 - 0.05, x1: F.x1 + 0.05, y1: Y1 + 0.05 };
    const mine = flat.filter((e) => e.pts.length && e.pts.every((p) => inside(p, R)));
    const loc = (x, y) => [round(x - F.x0), round(y - Y0)];
    const rect = (r) => {
      const [x, y] = loc(r[0], r[1]);
      const [x2, y2] = loc(r[2], r[3]);
      return { x, y, w: round(x2 - x), d: round(y2 - y) };
    };

    // wall lines (tabiqueria, not inside stairs / ignored regions)
    const lines = [];
    const treads = [];
    for (const e of mine) {
      if (e.layer !== "tabiqueria" || e.kind !== "line") continue;
      const [p, q] = e.pts;
      const axis = Math.abs(p[1] - q[1]) < EPS ? "h" : Math.abs(p[0] - q[0]) < EPS ? "v" : null;
      if (!axis) continue;
      const inStair = F.stairs.find((s) => inside(p, s) && inside(q, s));
      if (inStair && axis === "h") {
        treads.push({ y: p[1], a: Math.min(p[0], q[0]), b: Math.max(p[0], q[0]) });
        continue;
      }
      if (F.ignore.some((s) => inside(p, s) && inside(q, s) && !(axis === "h" && Math.abs(p[1] - s.keepY) < 0.005))) continue;
      lines.push({ axis, p, q });
    }
    const walls = pairWalls(lines).map((w) => ({ ...rect(w), kind: "wall" }));
    // single-line party walls (left/right) and the back boundary of the patio / terrace
    walls.push({ ...rect([F.x0, Y0, F.x0 + PARTY_WALL, Y1]), kind: "party" });
    walls.push({ ...rect([F.x1 - PARTY_WALL, Y0, F.x1, Y1]), kind: "party" });
    walls.push({ ...rect([F.x0, Y1 - PARTY_WALL, F.x1, Y1]), kind: "boundary" });

    // stair treads: consecutive treads of a flight rise by one step each
    treads.sort((t1, t2) => t1.a - t2.a || t1.y - t2.y);
    const steps = [];
    const flights = new Map();
    for (const t of treads) {
      const key = `${round(t.a)}|${round(t.b)}`;
      if (!flights.has(key)) flights.set(key, []);
      flights.get(key).push(t);
    }
    for (const list of flights.values()) {
      list.sort((t1, t2) => t1.y - t2.y);
      for (let i = 0; i < list.length - 1; i++) {
        steps.push({ ...rect([list[i].a, list[i].y, list[i].b, list[i + 1].y]), h: round(0.18 * (i + 1)) });
      }
    }

    // openings and furniture from block inserts; loose fixture lines grouped by connectivity
    const inserts = new Map();
    const loose = [];
    for (const e of mine) {
      if (e.insert) {
        if (!inserts.has(e.insert.id)) inserts.set(e.insert.id, { block: e.insert.block, layer: e.layer, pts: [] });
        const ins = inserts.get(e.insert.id);
        if (e.kind !== "arc" || !/^p\d+/.test(ins.block)) ins.pts.push(...e.pts); // door swings excluded
      } else if (HEIGHTS[e.layer] || e.layer === "carpinteria") loose.push(e);
    }
    const openings = [];
    const furniture = [];
    for (const ins of inserts.values()) {
      const b = bbox(ins.pts);
      const m = /^([pv])(\d+)$/.exec(ins.block);
      if (m) openings.push({ kind: m[1] === "v" ? "window" : "door", width: Number(m[2]) / 100, ...rect(b) });
      else furniture.push({ ...rect(b), h: BLOCK_HEIGHTS[ins.block] ?? HEIGHTS[ins.layer] ?? 0.7, layer: ins.layer, block: ins.block });
    }
    // group loose entities whose bboxes touch (same layer)
    const groups = [];
    for (const e of loose) {
      const b = bbox(e.pts);
      const hit = groups.filter((g) => g.layer === e.layer && b[0] <= g.b[2] + 0.02 && b[2] >= g.b[0] - 0.02 && b[1] <= g.b[3] + 0.02 && b[3] >= g.b[1] - 0.02);
      const merged = { layer: e.layer, b };
      for (const g of hit) {
        merged.b = [Math.min(merged.b[0], g.b[0]), Math.min(merged.b[1], g.b[1]), Math.max(merged.b[2], g.b[2]), Math.max(merged.b[3], g.b[3])];
        groups.splice(groups.indexOf(g), 1);
      }
      groups.push(merged);
    }
    for (const g of groups) {
      const r = rect(g.b);
      if (r.w < 0.15 && r.d < 0.15) continue;
      if (g.layer === "carpinteria") {
        // loose window frames drawn without a block (back wall of the ground floor)
        openings.push({ kind: "window", width: round(Math.max(r.w, r.d)), ...r });
        continue;
      }
      furniture.push({ ...r, h: HEIGHTS[g.layer], layer: g.layer });
    }

    // windows sit inside the wall lines: cut the wall along the window span (the scene draws sill + glass + lintel)
    const cut = [];
    for (const w of walls) {
      let pieces = [w];
      for (const o of openings) {
        if (o.kind !== "window") continue;
        const alongX = o.w >= o.d;
        pieces = pieces.flatMap((pc) => {
          const across = alongX ? Math.min(pc.y + pc.d, o.y + o.d) - Math.max(pc.y, o.y) : Math.min(pc.x + pc.w, o.x + o.w) - Math.max(pc.x, o.x);
          const a = alongX ? pc.x : pc.y;
          const b = alongX ? pc.x + pc.w : pc.y + pc.d;
          const oa = alongX ? o.x : o.y;
          const ob = alongX ? o.x + o.w : o.y + o.d;
          if (across < -EPS || ob <= a + EPS || oa >= b - EPS || (alongX ? pc.w < pc.d : pc.d < pc.w)) return [pc];
          const out = [];
          if (oa - a > 0.02) out.push(alongX ? { ...pc, w: round(oa - a) } : { ...pc, d: round(oa - a) });
          if (b - ob > 0.02) out.push(alongX ? { ...pc, x: round(ob), w: round(b - ob) } : { ...pc, y: round(ob), d: round(b - ob) });
          return out;
        });
      }
      cut.push(...pieces);
    }
    walls.length = 0;
    walls.push(...cut);

    return {
      id: F.id,
      label: F.label,
      width: round(F.x1 - F.x0),
      depth: round(Y1 - Y0),
      rooms: F.rooms.map((room) => ({ id: room.id, label: room.label, areaIds: room.areaIds, hue: room.hue, outdoor: Boolean(room.outdoor), ...rect(room.r) })),
      walls,
      openings,
      steps,
      furniture,
    };
  });
  return {
    source: "planos casa reforma revisar.dwg (AC1032 / AutoCAD 2018), read with LibreDWG 0.14 dwgread -O JSON",
    units: "m",
    axes: "x along the facade (left to right seen from the street), y from the facade to the back",
    floors,
  };
}

if (require.main === module) {
  const [input, output = path.join(__dirname, "../../src/house/dwgPlan.json")] = process.argv.slice(2);
  if (!input) {
    console.error("usage: node scripts/dwg-plan/convert.cjs <libredwg plan.json> [out.json]");
    process.exit(2);
  }
  const plan = convert(flatten(JSON.parse(fs.readFileSync(input, "utf8"))));
  fs.writeFileSync(output, JSON.stringify(plan, null, 2) + "\n");
  for (const f of plan.floors) console.log(`${f.id}: ${f.rooms.length} rooms, ${f.walls.length} walls, ${f.openings.length} openings, ${f.steps.length} steps, ${f.furniture.length} furniture`);
}

module.exports = { flatten, convert };
