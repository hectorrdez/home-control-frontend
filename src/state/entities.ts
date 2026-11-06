import type { Area, Entity } from "@/api/types";

// Single entity store (feature 103). Entities keyed by entityId; areas keep order and membership.
// 104 (optimistic actions) and 105 (live merge) extend this reducer; keep it pure.
export const UNASSIGNED = "unassigned";

export interface AreaGroup {
  areaId: string;
  name: string;
  entityIds: string[];
}

export type EntitiesStatus = "loading" | "ready" | "error";

export interface EntitiesState {
  status: EntitiesStatus;
  areas: AreaGroup[];
  entities: Record<string, Entity>;
}

export type EntitiesAction =
  | { type: "load" }
  | { type: "loaded"; areas: Area[] }
  | { type: "failed" };

export const initialEntitiesState: EntitiesState = {
  status: "loading",
  areas: [],
  entities: {},
};

export function entitiesReducer(state: EntitiesState, action: EntitiesAction): EntitiesState {
  switch (action.type) {
    case "load":
      return { ...state, status: "loading" };
    case "failed":
      return { ...state, status: "error" };
    case "loaded": {
      const entities: Record<string, Entity> = {};
      const areas: AreaGroup[] = action.areas.map((area) => {
        for (const entity of area.entities) entities[entity.entityId] = entity;
        return {
          areaId: area.areaId,
          name: area.name,
          entityIds: area.entities.map((e) => e.entityId),
        };
      });
      return { status: "ready", areas, entities };
    }
  }
}
