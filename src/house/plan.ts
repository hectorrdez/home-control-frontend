// Procedural house plan (106). World units: the house is a 22 x 22 plate centred on the origin.
// Colors are CSS token names (without `--color-`), resolved once at mount by the scene.

export type TokenName = "primary-container" | "tertiary-fixed-dim" | "secondary" | "outline-variant" | "on-surface-variant";

export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export interface RoomPlan {
  id: string;
  areaId: string; // HA area id; rooms whose area is missing from getAreas() render dimmed and unselectable
  label: string;
  rect: Box; // footprint on the floor (h unused)
  hue: TokenName; // glow hue when the room is lit
  furniture: Box[];
}

export interface HousePlan {
  plate: number;
  floors: { index: number; rooms: RoomPlan[]; walls: Box[] }[];
}

const WALL_H = 2.6;
const LOW_WALL_H = 1.2;

// Default plan: the Stitch 2x2 layout mapped to the mock house areas.
export const DEFAULT_PLAN: HousePlan = {
  plate: 22,
  floors: [
    {
      index: 0,
      rooms: [
        {
          id: "living",
          areaId: "living_room",
          label: "Living room",
          rect: { x: -5.5, z: -5.5, w: 10, d: 10, h: 0 },
          hue: "primary-container",
          furniture: [
            { x: -5, z: -5.5, w: 5, d: 2.2, h: 0.9 },
            { x: -5, z: -9.8, w: 4.5, d: 0.3, h: 1.8 },
          ],
        },
        {
          id: "kitchen",
          areaId: "kitchen",
          label: "Kitchen",
          rect: { x: 5.5, z: -5.5, w: 10, d: 10, h: 0 },
          hue: "tertiary-fixed-dim",
          furniture: [
            { x: 5.5, z: -6, w: 6, d: 2, h: 1.1 },
            { x: 9, z: -3.5, w: 2, d: 4, h: 1.1 },
          ],
        },
        {
          id: "bedroom",
          areaId: "bedroom",
          label: "Master suite",
          rect: { x: -5.5, z: 5.5, w: 10, d: 10, h: 0 },
          hue: "secondary",
          furniture: [{ x: -5, z: 5.5, w: 4, d: 5, h: 0.8 }],
        },
        {
          id: "office",
          areaId: "office",
          label: "Office",
          rect: { x: 5.5, z: 5.5, w: 10, d: 10, h: 0 },
          hue: "primary-container",
          furniture: [{ x: 5.5, z: 5.5, w: 4.5, d: 2, h: 0.9 }],
        },
      ],
      walls: [
        { x: 0, z: -11, w: 22, d: 0.4, h: WALL_H },
        { x: -11, z: 0, w: 0.4, d: 22, h: WALL_H },
        { x: 0, z: 11, w: 22, d: 0.4, h: LOW_WALL_H },
        { x: 11, z: 0, w: 0.4, d: 22, h: LOW_WALL_H },
        { x: 0, z: 0, w: 0.3, d: 22, h: WALL_H },
        { x: -5.5, z: 0, w: 11, d: 0.3, h: WALL_H },
        { x: 5.5, z: 0, w: 11, d: 0.3, h: WALL_H },
      ],
    },
  ],
};

// Plan rooms bound to the live areas. `present` is false when the room's area is not in getAreas().
export function bindRooms(plan: HousePlan, areaIds: string[]): (RoomPlan & { present: boolean })[] {
  const known = new Set(areaIds);
  return plan.floors[0].rooms.map((room) => ({ ...room, present: known.has(room.areaId) }));
}
