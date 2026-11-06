import type { Area, Entity } from "@/api/types";

// Single entity store (feature 103). Entities keyed by entityId; areas keep order and membership.
// 104 adds optimistic actions (pending map with a rollback baseline); 105 merges stream events.
// Keep the reducer pure: callers pass timestamps in the actions.
export const UNASSIGNED = "unassigned";

export interface AreaGroup {
  areaId: string;
  name: string;
  entityIds: string[];
}

export type EntitiesStatus = "loading" | "ready" | "error";

// One pending action per entity. `baseline` is the last value the server confirmed (rollback target).
// A newer action supersedes the older optimistic value: it keeps the same baseline, and only its
// requestId can confirm or roll back. `startedAt` (epoch ms) decides whether a stream event is newer.
export interface PendingAction {
  requestId: number;
  baseline: Entity;
  startedAt: number;
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
  | { type: "areasRefreshed"; areas: Area[] }
  | { type: "failed" }
  | { type: "actionStarted"; entityId: string; requestId: number; optimistic: Entity; startedAt: number }
  | { type: "actionConfirmed"; entityId: string; requestId: number; entity: Entity }
  | { type: "actionFailed"; entityId: string; requestId: number }
  | { type: "entityUpdated"; entity: Entity };

export const initialEntitiesState: EntitiesState = {
  status: "loading",
  areas: [],
  entities: {},
  pending: {},
};

function groupsFrom(areas: Area[]): { groups: AreaGroup[]; entities: Record<string, Entity> } {
  const entities: Record<string, Entity> = {};
  const groups: AreaGroup[] = areas.map((area) => {
    for (const entity of area.entities) entities[entity.entityId] = entity;
    return { areaId: area.areaId, name: area.name, entityIds: area.entities.map((e) => e.entityId) };
  });
  return { groups, entities };
}

// Stores an entity. Unknown entities join their area group, or the unassigned group when the area is unknown.
function withEntity(state: EntitiesState, entity: Entity): EntitiesState {
  const id = entity.entityId;
  if (state.entities[id]) {
    return { ...state, entities: { ...state.entities, [id]: entity } };
  }
  let areas = state.areas;
  let target = areas.findIndex((group) => group.areaId === (entity.area ?? UNASSIGNED));
  if (target === -1) target = areas.findIndex((group) => group.areaId === UNASSIGNED);
  if (target === -1) {
    areas = [...areas, { areaId: UNASSIGNED, name: "Unassigned", entityIds: [] }];
    target = areas.length - 1;
  }
  areas = areas.map((group, index) => (index === target ? { ...group, entityIds: [...group.entityIds, id] } : group));
  return { ...state, areas, entities: { ...state.entities, [id]: entity } };
}

// Reconcile a stream event with a pending optimistic action (104):
// - same state as the optimistic value -> confirmed, pending cleared;
// - different state and newer than the action start -> the server wins, pending cleared;
// - otherwise the optimistic value is kept.
export function reconcileEvent(
  pending: PendingAction | undefined,
  optimistic: Entity | undefined,
  incoming: Entity,
): "apply" | "keep" {
  if (!pending || !optimistic) return "apply";
  if (incoming.state === optimistic.state) return "apply";
  return Date.parse(incoming.lastChanged) > pending.startedAt ? "apply" : "keep";
}

function applyEvent(state: EntitiesState, incoming: Entity): EntitiesState {
  const id = incoming.entityId;
  const pending = state.pending[id];
  if (!pending) return withEntity(state, incoming);
  if (reconcileEvent(pending, state.entities[id], incoming) === "keep") return state;
  const { [id]: _settled, ...rest } = state.pending;
  return withEntity({ ...state, pending: rest }, incoming);
}

export function entitiesReducer(state: EntitiesState, action: EntitiesAction): EntitiesState {
  switch (action.type) {
    case "load":
      return { ...state, status: "loading" };
    case "failed":
      return { ...state, status: "error" };
    case "loaded": {
      const { groups, entities } = groupsFrom(action.areas);
      return { status: "ready", areas: groups, entities, pending: {} };
    }
    case "areasRefreshed": {
      // Re-fetch after a stream reconnect: keep optimistic values of in-flight actions.
      const { groups, entities } = groupsFrom(action.areas);
      for (const id of Object.keys(state.pending)) {
        if (state.entities[id]) entities[id] = state.entities[id];
      }
      return { ...state, status: "ready", areas: groups, entities };
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
          [action.entityId]: {
            requestId: action.requestId,
            baseline: previous ? previous.baseline : current,
            startedAt: action.startedAt,
          },
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
    case "entityUpdated":
      return applyEvent(state, action.entity);
  }
}
