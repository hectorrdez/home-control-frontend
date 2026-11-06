import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { useApi } from "@/api/ApiContext";
import type { ConnectionState, Entity } from "@/api/types";
import { entitiesReducer, initialEntitiesState, SETTLE_TIMEOUT_MS, type EntitiesState } from "./entities";
import { applyIntent, intentAction, type Intent } from "./actions";
import type { DomainFilter } from "./selectors";

interface EntitiesContextValue {
  state: EntitiesState;
  reload: () => void;
  selectedArea: string | null; // null = all rooms (106 reads it)
  setSelectedArea: (areaId: string | null) => void;
  selectedGroup: DomainFilter;
  setSelectedGroup: (group: DomainFilter) => void;
  // Optimistic action (104). Resolves true on success, false after a rollback.
  sendIntent: (entity: Entity, intent: Intent) => Promise<boolean>;
  // Live stream state (105): "open" or "reconnecting". Values keep their last known state meanwhile.
  connection: ConnectionState;
}

const EntitiesContext = createContext<EntitiesContextValue | null>(null);

export function EntitiesProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, dispatch] = useReducer(entitiesReducer, initialEntitiesState);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<DomainFilter>("all");
  const [connection, setConnection] = useState<ConnectionState>("open");
  const requestCounter = useRef(0);

  const load = useCallback(() => {
    dispatch({ type: "load" });
    return api.getAreas().then(
      (areas) => {
        dispatch({ type: "loaded", areas });
      },
      () => {
        dispatch({ type: "failed" });
      },
    );
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // One app-level subscription (105): stream events merge into the store; a reconnect re-fetches the areas once.
  useEffect(() => {
    let previous: ConnectionState = "open";
    return api.subscribe(
      (entity) => dispatch({ type: "entityUpdated", entity }),
      (next) => {
        setConnection(next);
        if (next === "open" && previous === "reconnecting") {
          void api.getAreas().then(
            (areas) => dispatch({ type: "areasRefreshed", areas }),
            () => undefined, // the stream is the source of truth for the next event; keep the last state
          );
        }
        previous = next;
      },
    );
  }, [api]);

  // 117: an action whose answer still showed the old state waits for its stream event. After SETTLE_TIMEOUT_MS
  // the marker is dropped and the areas are re-fetched, so the server state takes over. Keyed on the settling
  // actions only, so unrelated updates do not restart the timers.
  const settlingKey = Object.entries(state.pending)
    .filter(([, pending]) => pending.settling)
    .map(([entityId, pending]) => `${entityId}:${pending.requestId}`)
    .join("|");

  useEffect(() => {
    if (!settlingKey) return;
    const timers = settlingKey.split("|").map((entry) => {
      const separator = entry.lastIndexOf(":");
      const entityId = entry.slice(0, separator);
      const requestId = Number(entry.slice(separator + 1));
      return window.setTimeout(() => {
        dispatch({ type: "settleTimedOut", entityId, requestId });
        void api.getAreas().then(
          (areas) => dispatch({ type: "areasRefreshed", areas }),
          () => undefined, // keep the last state; the next stream event or reload will correct it
        );
      }, SETTLE_TIMEOUT_MS);
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [settlingKey, api]);

  const sendIntent = useCallback(
    (entity: Entity, intent: Intent): Promise<boolean> => {
      const requestId = ++requestCounter.current;
      dispatch({
        type: "actionStarted",
        entityId: entity.entityId,
        requestId,
        optimistic: applyIntent(entity, intent),
        startedAt: Date.now(),
      });
      return api.runAction(entity.entityId, intentAction(intent)).then(
        (confirmed) => {
          dispatch({ type: "actionConfirmed", entityId: entity.entityId, requestId, entity: confirmed });
          return true;
        },
        () => {
          dispatch({ type: "actionFailed", entityId: entity.entityId, requestId });
          return false;
        },
      );
    },
    [api],
  );

  const value = useMemo<EntitiesContextValue>(
    () => ({
      state,
      reload: () => void load(),
      selectedArea,
      setSelectedArea,
      selectedGroup,
      setSelectedGroup,
      sendIntent,
      connection,
    }),
    [state, load, selectedArea, selectedGroup, sendIntent, connection],
  );

  return <EntitiesContext.Provider value={value}>{children}</EntitiesContext.Provider>;
}

export function useEntities(): EntitiesContextValue {
  const value = useContext(EntitiesContext);
  if (!value) throw new Error("useEntities must be used inside EntitiesProvider");
  return value;
}
