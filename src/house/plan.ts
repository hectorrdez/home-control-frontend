import dwgPlan from "./dwgPlan.json";

// House plan (106, real DWG plans from 149). World units: the house is a 22 x 22 plate centred on the origin.
// Colors are CSS token names (without `--color-`), resolved once at mount by the scene.

export type TokenName = "primary-container" | "tertiary-fixed-dim" | "secondary" | "outline-variant" | "on-surface-variant";

export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  y?: number; // base elevation, default 0
}

export interface RoomPlan {
  id: string;
  areaId: string; // first candidate; bindRooms resolves the live one
  areaIds: string[]; // HA area id candidates, most likely first
  label: string;
  rect: Box; // footprint on the floor (h unused)
  hue: TokenName; // glow hue when the room is lit
  furniture: Box[];
}

export interface FloorPlan {
  index: number;
  label: string;
  rooms: RoomPlan[];
  walls: Box[];
  glass: Box[];
  fixtures: Box[]; // boxes not inside any room: stair steps, stray furniture
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
  width: number;
  depth: number;
  rooms: Array<DwgRect & { id: string; label: string; areaIds: string[]; hue: string; outdoor: boolean }>;
  walls: Array<DwgRect & { kind: string }>;
  openings: Array<DwgRect & { kind: string; width: number }>;
  steps: Array<DwgRect & { h: number }>;
  furniture: Array<DwgRect & { h: number; layer?: string; block?: string }>;
}
export interface DwgPlan {
  floors: DwgFloor[];
}

const PLATE = 22;
const SCALE = 2; // scene units per metre
const WALL_H = 2.6;
const LOW_WALL_H = 1.2;
const FACADE_Y = 0.7; // metres from the facade line; walls and windows nearer than this are the cutaway
const FURNITURE_MAX_H = 2.2;

const inside = (px: number, py: number, r: DwgRect) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.d;

export function buildPlanFromDwg(dwg: DwgPlan): HousePlan {
  return {
    plate: PLATE,
    floors: dwg.floors.map((floor, index) => buildFloor(floor, index)),
  };
}

function buildFloor(f: DwgFloor, index: number): FloorPlan {
  const cx = f.width / 2;
  const cy = f.depth / 2;
  // Facade (y = 0) ends at +z, which faces the iso camera.
  const box = (r: DwgRect, h: number, y = 0): Box => ({
    x: (r.x + r.w / 2 - cx) * SCALE,
    z: (cy - (r.y + r.d / 2)) * SCALE,
    w: r.w * SCALE,
    d: r.d * SCALE,
    h,
    y,
  });

  const rooms: RoomPlan[] = f.rooms.map((room) => ({
    id: room.id,
    areaId: room.areaIds[0],
    areaIds: room.areaIds,
    label: room.label,
    rect: box(room, 0),
    hue: room.hue as TokenName,
    furniture: [],
  }));

  const walls: Box[] = [];
  const glass: Box[] = [];
  const fixtures: Box[] = [];
  const outdoor = f.rooms.filter((room) => room.outdoor);

  for (const wall of f.walls) {
    const mx = wall.x + wall.w / 2;
    const my = wall.y + wall.d / 2;
    const low =
      my < FACADE_Y ||
      (wall.kind === "party" && wall.x + wall.w >= f.width - 0.01) ||
      wall.kind === "boundary" ||
      outdoor.some((room) => inside(mx, my, room));
    walls.push(box(wall, low ? LOW_WALL_H : WALL_H));
  }

  for (const opening of f.openings) {
    if (opening.kind !== "window") continue; // doors are gaps, no geometry
    if (opening.y + opening.d / 2 < FACADE_Y) {
      walls.push(box(opening, 0.5));
      glass.push(box(opening, 0.7, 0.5));
    } else {
      walls.push(box(opening, 0.9));
      glass.push(box(opening, 1.2, 0.9));
      walls.push(box(opening, 0.5, 2.1));
    }
  }

  for (const piece of f.furniture) {
    const b = box(piece, Math.min(piece.h, FURNITURE_MAX_H));
    const mx = piece.x + piece.w / 2;
    const my = piece.y + piece.d / 2;
    const owner = f.rooms.findIndex((room) => inside(mx, my, room));
    if (owner >= 0) rooms[owner].furniture.push(b);
    else fixtures.push(b);
  }

  for (const step of f.steps) fixtures.push(box(step, step.h));

  return { index, label: f.label, rooms, walls, glass, fixtures };
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
