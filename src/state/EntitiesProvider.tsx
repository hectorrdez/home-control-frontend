import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { useApi } from "@/api/ApiContext";
import type { Entity } from "@/api/types";
import { entitiesReducer, initialEntitiesState, type EntitiesState } from "./entities";
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
}

const EntitiesContext = createContext<EntitiesContextValue | null>(null);

export function EntitiesProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, dispatch] = useReducer(entitiesReducer, initialEntitiesState);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<DomainFilter>("all");
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

  const sendIntent = useCallback(
    (entity: Entity, intent: Intent): Promise<boolean> => {
      const requestId = ++requestCounter.current;
      dispatch({
        type: "actionStarted",
        entityId: entity.entityId,
        requestId,
        optimistic: applyIntent(entity, intent),
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
    }),
    [state, load, selectedArea, selectedGroup, sendIntent],
  );

  return <EntitiesContext.Provider value={value}>{children}</EntitiesContext.Provider>;
}

export function useEntities(): EntitiesContextValue {
  const value = useContext(EntitiesContext);
  if (!value) throw new Error("useEntities must be used inside EntitiesProvider");
  return value;
}
