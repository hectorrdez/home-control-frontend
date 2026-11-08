import type { Area, Entity, LoggedEvent } from "@/api/types";
import { fromLoggedEvent, mergeFeeds, prependEvent, recordChange, type FeedEvent } from "./feed";

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
// `settling` (117): the HTTP answer still showed the pre-action state (Home Assistant applies the change after
// answering), so the optimistic value is kept and the entity stays "in transition" until a stream event with the
// expected state clears it, or SETTLE_TIMEOUT_MS passes (the provider then drops the marker and refreshes).
export interface PendingAction {
  requestId: number;
  baseline: Entity;
  startedAt: number;
  settling: boolean;
}

export const SETTLE_TIMEOUT_MS = 5000;

export interface EntitiesState {
  status: EntitiesStatus;
  areas: AreaGroup[];
  entities: Record<string, Entity>;
  pending: Record<string, PendingAction>;
  feed: FeedEvent[]; // 111: session-only, newest first
}

export type EntitiesAction =
  | { type: "load" }
  | { type: "loaded"; areas: Area[] }
  | { type: "areasRefreshed"; areas: Area[] }
  | { type: "failed" }
  | { type: "actionStarted"; entityId: string; requestId: number; optimistic: Entity; startedAt: number }
  | { type: "actionConfirmed"; entityId: string; requestId: number; entity: Entity }
  | { type: "actionFailed"; entityId: string; requestId: number }
  | { type: "settleTimedOut"; entityId: string; requestId: number }
  | { type: "entityUpdated"; entity: Entity }
  | { type: "alertLogged"; event: FeedEvent }
  // Feature 140: server event log (GET /api/events seed) and live `event` frames.
  | { type: "serverFeedLoaded"; events: LoggedEvent[] }
  | { type: "serverEventLogged"; event: LoggedEvent };

export const initialEntitiesState: EntitiesState = {
  status: "loading",
  areas: [],
  entities: {},
  pending: {},
  feed: [],
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

// True when an attribute the action changed (optimistic vs baseline) is not the optimistic value in `other`.
function changedAttributeDiffers(baseline: Entity, optimistic: Entity, other: Entity): boolean {
  return Object.keys(optimistic.attributes).some(
    (key) =>
      JSON.stringify(optimistic.attributes[key]) !== JSON.stringify(baseline.attributes[key]) &&
      JSON.stringify(optimistic.attributes[key]) !== JSON.stringify(other.attributes[key]),
  );
}

// An HTTP answer still shows the state from before the action (117): the state differs, or an attribute the
// action changed still has its old value.
function isStale(baseline: Entity, optimistic: Entity, answered: Entity): boolean {
  return answered.state !== optimistic.state || changedAttributeDiffers(baseline, optimistic, answered);
}

function applyEvent(state: EntitiesState, incoming: Entity): EntitiesState {
  const id = incoming.entityId;
  const pending = state.pending[id];
  if (!pending) return withEntity(state, incoming);
  const optimistic = state.entities[id];
  if (reconcileEvent(pending, optimistic, incoming) === "keep") return state;
  // Same state but an older value for the attribute being changed (an event of a superseded action): keep the newer one.
  if (optimistic && incoming.state === optimistic.state && changedAttributeDiffers(pending.baseline, optimistic, incoming)) {
    return state;
  }
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
      return { status: "ready", areas: groups, entities, pending: {}, feed: state.feed };
    }
    case "areasRefreshed": {
      // Re-fetch after a stream reconnect: keep optimistic values of in-flight actions.
      const { groups, entities } = groupsFrom(action.areas);
      for (const id of Object.keys(state.pending)) {
        if (state.entities[id]) entities[id] = state.entities[id];
      }
      // Feature 126: changes missed while the stream was down show up in the feed as well.
      let feed = state.feed;
      for (const id of Object.keys(entities)) feed = recordChange(feed, state.entities[id], entities[id]);
      return { ...state, status: "ready", areas: groups, entities, feed };
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
            settling: false,
          },
        },
      };
    }
    case "actionConfirmed": {
      const pending = state.pending[action.entityId];
      // Stale confirmations (superseded by a newer action) are ignored.
      if (!pending || pending.requestId !== action.requestId) return state;
      const optimistic = state.entities[action.entityId];
      if (optimistic && isStale(pending.baseline, optimistic, action.entity)) {
        // Keep the optimistic value; the stream event with the expected state (or the settle timeout) ends it.
        return { ...state, pending: { ...state.pending, [action.entityId]: { ...pending, settling: true } } };
      }
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
    case "settleTimedOut": {
      const pending = state.pending[action.entityId];
      if (!pending || pending.requestId !== action.requestId || !pending.settling) return state;
      // The optimistic value stays until the provider's area refresh brings the server state.
      const { [action.entityId]: _settled, ...rest } = state.pending;
      return { ...state, pending: rest };
    }
    case "alertLogged":
      return { ...state, feed: mergeFeeds(prependEvent(state.feed, action.event)) };
    case "serverFeedLoaded": {
      const rows = action.events.flatMap((e) => fromLoggedEvent(e, (id) => state.entities[id]) ?? []);
      return { ...state, feed: mergeFeeds(state.feed, rows) };
    }
    case "serverEventLogged": {
      const row = fromLoggedEvent(action.event, (id) => state.entities[id]);
      return row ? { ...state, feed: mergeFeeds(state.feed, [row]) } : state;
    }
    case "entityUpdated": {
      const next = applyEvent(state, action.entity);
      if (next === state) return state;
      const recorded = recordChange(state.feed, state.entities[action.entity.entityId], next.entities[action.entity.entityId]);
      return recorded === state.feed ? next : { ...next, feed: mergeFeeds(recorded) };
    }
  }
}
