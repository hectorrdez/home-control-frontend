import dwgPlan from "./dwgPlan.json";

// House plan (106, real DWG plans from 149). World units: the house is a 22 x 22 plate centred on the origin.
// Scale is uniform: 2 units per metre on every axis, so heights are real heights (2.7 m levels, 1.0 m parapets).
// Colors are CSS token names (without `--color-`), resolved once at mount by the scene.

export type TokenName = "primary-container" | "tertiary-fixed-dim" | "secondary" | "outline-variant" | "on-surface-variant";

// "low" walls and glass are cut lower in the isolated floor view (facade and right party wall).
export type WallCut = "low" | "normal";

export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  y?: number; // base elevation, default 0
  cut?: WallCut; // section cut in the isolated floor view, default "normal"
}

export interface RoomPlan {
  id: string;
  areaId: string; // first candidate; bindRooms resolves the live one
  areaIds: string[]; // HA area id candidates, most likely first
  label: string;
  rect: Box; // bounding box of the parts (label anchor, h unused)
  parts: Box[]; // floor footprint(s): one per rectangle, an L-shaped room has two
  hue: TokenName; // glow hue when the room is lit
  furniture: Box[];
}

export interface RoofPlan {
  box: Box; // footprint, mapped like rooms (h unused)
  knee: number; // knee wall top, units
  ridge: number; // ridge height above the floor, units
}

export interface FloorPlan {
  index: number;
  label: string;
  level: number; // 0 ground, 1 upper, 2 attic
  height: number; // floor-to-floor height, units
  rooms: RoomPlan[];
  walls: Box[];
  glass: Box[];
  fixtures: Box[]; // boxes not inside any room: stair steps, stray furniture
  roof?: RoofPlan;
}

export interface HousePlan {
  plate: number;
  floors: FloorPlan[];
}

// A room bound to the live areas, flattened over all floors.
export interface BoundRoom extends RoomPlan {
  floor: number;
  present: boolean; // a candidate area exists in getAreas()
}

// Shape of src/house/dwgPlan.json (written by scripts/dwg-plan/convert.cjs). Metres; (x, y) = min corner.
interface DwgRect {
  x: number;
  y: number;
  w: number;
  d: number;
}
interface DwgFloor {
  id: string;
  label: string;
  level: number;
  height: number;
  wallHeight?: number; // attic wall height, metres
  width: number;
  depth: number;
  houseDepth: number;
  rooms: Array<DwgRect & { id: string; label: string; areaIds: string[]; hue: string; outdoor: boolean; parts: DwgRect[] }>;
  walls: Array<DwgRect & { h: number; kind: string }>;
  openings: Array<DwgRect & { kind: string; width: number }>;
  steps: Array<DwgRect & { base: number; h: number }>;
  furniture: Array<DwgRect & { h: number; layer?: string; block?: string }>;
  roof?: DwgRect & { knee: number; ridge: number; ridgeAxis: string };
}
export interface DwgPlan {
  floors: DwgFloor[];
}

const PLATE = 22;
const SCALE = 2; // scene units per metre
const WALL_TOP = 2.7; // metres, level height (window lintel runs to this)
const WINDOW_SILL = 0.9; // metres
const WINDOW_HEAD = 2.1; // metres
const FACADE_Y = 0.7; // metres from the facade line; walls and windows nearer than this are the cutaway

const inside = (px: number, py: number, r: DwgRect) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.d;

// Smallest box around the given boxes (used as the room's label anchor).
function bounds(parts: Box[]): Box {
  const minX = Math.min(...parts.map((p) => p.x - p.w / 2));
  const maxX = Math.max(...parts.map((p) => p.x + p.w / 2));
  const minZ = Math.min(...parts.map((p) => p.z - p.d / 2));
  const maxZ = Math.max(...parts.map((p) => p.z + p.d / 2));
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ, h: 0 };
}

export function buildPlanFromDwg(dwg: DwgPlan): HousePlan {
  return {
    plate: PLATE,
    floors: dwg.floors.map((floor, index) => buildFloor(floor, index)),
  };
}

function buildFloor(f: DwgFloor, index: number): FloorPlan {
  const cx = f.width / 2;
  const cy = f.depth / 2;
  // Facade (y = 0) ends at +z, which faces the iso camera. h and y are metres; the result is in units.
  const box = (r: DwgRect, h: number, y = 0): Box => ({
    x: (r.x + r.w / 2 - cx) * SCALE,
    z: (cy - (r.y + r.d / 2)) * SCALE,
    w: r.w * SCALE,
    d: r.d * SCALE,
    h: h * SCALE,
    y: y * SCALE,
  });
  const isFacade = (r: DwgRect) => r.y + r.d / 2 < FACADE_Y;

  const rooms: RoomPlan[] = f.rooms.map((room) => {
    const parts = (room.parts.length ? room.parts : [room]).map((p) => box(p, 0));
    return {
      id: room.id,
      areaId: room.areaIds[0],
      areaIds: room.areaIds,
      label: room.label,
      rect: bounds(parts),
      parts,
      hue: room.hue as TokenName,
      furniture: [],
    };
  });

  const walls: Box[] = [];
  const glass: Box[] = [];
  const fixtures: Box[] = [];

  for (const wall of f.walls) {
    const low = isFacade(wall) || (wall.kind === "party" && wall.x + wall.w >= f.width - 0.01);
    walls.push({ ...box(wall, wall.h), cut: low ? "low" : "normal" });
  }

  for (const opening of f.openings) {
    if (opening.kind !== "window") continue; // doors are gaps, no geometry
    const cut: WallCut = isFacade(opening) ? "low" : "normal";
    walls.push({ ...box(opening, WINDOW_SILL), cut });
    glass.push({ ...box(opening, WINDOW_HEAD - WINDOW_SILL, WINDOW_SILL), cut });
    walls.push({ ...box(opening, WALL_TOP - WINDOW_HEAD, WINDOW_HEAD), cut });
  }

  for (const piece of f.furniture) {
    const b = box(piece, piece.h);
    const mx = piece.x + piece.w / 2;
    const my = piece.y + piece.d / 2;
    const owner = f.rooms.findIndex((room) => (room.parts.length ? room.parts : [room]).some((p) => inside(mx, my, p)));
    if (owner >= 0) rooms[owner].furniture.push(b);
    else fixtures.push(b);
  }

  for (const step of f.steps) fixtures.push(box(step, step.h, step.base));

  const roof = f.roof ? { box: box(f.roof, 0), knee: f.roof.knee * SCALE, ridge: f.roof.ridge * SCALE } : undefined;

  return { index, label: f.label, level: f.level, height: f.height * SCALE, rooms, walls, glass, fixtures, roof };
}

export const DEFAULT_PLAN: HousePlan = buildPlanFromDwg(dwgPlan);

// Plan rooms bound to the live areas, over all floors. The resolved areaId is the first candidate present in
// `liveAreaIds`, else the first candidate. Does not mutate the plan.
export function bindRooms(plan: HousePlan, liveAreaIds: string[]): BoundRoom[] {
  const live = new Set(liveAreaIds);
  return plan.floors.flatMap((floor) =>
    floor.rooms.map((room) => {
      const candidate = room.areaIds.find((id) => live.has(id));
      return { ...room, areaId: candidate ?? room.areaIds[0], floor: floor.index, present: candidate !== undefined };
    }),
  );
}
