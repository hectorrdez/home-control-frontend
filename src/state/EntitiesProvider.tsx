import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { useApi } from "@/api/ApiContext";
import { entitiesReducer, initialEntitiesState, type EntitiesState } from "./entities";
import type { DomainFilter } from "./selectors";

interface EntitiesContextValue {
  state: EntitiesState;
  reload: () => void;
  selectedArea: string | null; // null = all rooms (106 reads it)
  setSelectedArea: (areaId: string | null) => void;
  selectedGroup: DomainFilter;
  setSelectedGroup: (group: DomainFilter) => void;
}

const EntitiesContext = createContext<EntitiesContextValue | null>(null);

export function EntitiesProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, dispatch] = useReducer(entitiesReducer, initialEntitiesState);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<DomainFilter>("all");

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

  const value = useMemo<EntitiesContextValue>(
    () => ({
      state,
      reload: () => void load(),
      selectedArea,
      setSelectedArea,
      selectedGroup,
      setSelectedGroup,
    }),
    [state, load, selectedArea, selectedGroup],
  );

  return <EntitiesContext.Provider value={value}>{children}</EntitiesContext.Provider>;
}

export function useEntities(): EntitiesContextValue {
  const value = useContext(EntitiesContext);
  if (!value) throw new Error("useEntities must be used inside EntitiesProvider");
  return value;
}
