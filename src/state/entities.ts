import type { Area, Entity } from "@/api/types";

// Single entity store (feature 103). Entities keyed by entityId; areas keep order and membership.
// 104 adds optimistic actions (pending map with a rollback baseline); 105 feeds entityUpdated.
// Keep the reducer pure.
export const UNASSIGNED = "unassigned";

export interface AreaGroup {
  areaId: string;
  name: string;
  entityIds: string[];
}

export type EntitiesStatus = "loading" | "ready" | "error";

// One pending action per entity. `baseline` is the last value the server confirmed (rollback target).
// A newer action supersedes the older optimistic value: it keeps the same baseline, and only its
// requestId can confirm or roll back.
export interface PendingAction {
  requestId: number;
  baseline: Entity;
}

export interface EntitiesState {
  status: EntitiesStatus;
  areas: AreaGroup[];
  entities: Record<string, Entity>;
  pending: Record<string, PendingAction>;
}

export type EntitiesAction =
  | { type: "load" }
  | { type: "loaded"; areas: Area[] }
  | { type: "failed" }
  | { type: "actionStarted"; entityId: string; requestId: number; optimistic: Entity }
  | { type: "actionConfirmed"; entityId: string; requestId: number; entity: Entity }
  | { type: "actionFailed"; entityId: string; requestId: number }
  | { type: "entityUpdated"; entity: Entity };

export const initialEntitiesState: EntitiesState = {
  status: "loading",
  areas: [],
  entities: {},
  pending: {},
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
      return { status: "ready", areas, entities, pending: {} };
    }
    case "actionStarted": {
      const current = state.entities[action.entityId];
      if (!current) return state;
      const previous = state.pending[action.entityId];
      return {
        ...state,
        entities: { ...state.entities, [action.entityId]: action.optimistic },
        pending: {
          ...state.pending,
          [action.entityId]: { requestId: action.requestId, baseline: previous ? previous.baseline : current },
        },
      };
    }
    case "actionConfirmed": {
      const pending = state.pending[action.entityId];
      // Stale confirmations (superseded by a newer action) are ignored.
      if (!pending || pending.requestId !== action.requestId) return state;
      const { [action.entityId]: _done, ...rest } = state.pending;
      return {
        ...state,
        entities: { ...state.entities, [action.entityId]: action.entity },
        pending: rest,
      };
    }
    case "actionFailed": {
      const pending = state.pending[action.entityId];
      if (!pending || pending.requestId !== action.requestId) return state;
      const { [action.entityId]: _done, ...rest } = state.pending;
      return {
        ...state,
        entities: { ...state.entities, [action.entityId]: pending.baseline },
        pending: rest,
      };
    }
    case "entityUpdated": {
      if (!state.entities[action.entity.entityId]) return state;
      return { ...state, entities: { ...state.entities, [action.entity.entityId]: action.entity } };
    }
  }
}
