import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { useApi } from "@/api/ApiContext";
import type { ConnectionState, Entity } from "@/api/types";
import { entitiesReducer, initialEntitiesState, SETTLE_TIMEOUT_MS, UNASSIGNED, type EntitiesState } from "./entities";
import type { FeedEvent } from "./feed";
import { applyIntent, intentAction, type Intent } from "./actions";
import type { DomainFilter } from "./selectors";
import { isStreamRecovery, shouldResyncAfterHidden } from "./resync";
import { ZoneColorsProvider } from "@/features/zones/ZoneColorsContext";

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
  // Feature 129: an alert raised by a rule is written to the event feed.
  logAlert: (event: FeedEvent) => void;
}

const EntitiesContext = createContext<EntitiesContextValue | null>(null);

export function EntitiesProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, dispatch] = useReducer(entitiesReducer, initialEntitiesState);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<DomainFilter>("all");
  const [connection, setConnection] = useState<ConnectionState>("open");
  const requestCounter = useRef(0);
  const logAlert = useCallback((event: FeedEvent) => dispatch({ type: "alertLogged", event }), []);

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

  // Re-fetch the entity list (keeps optimistic values). A failure keeps the last state; the stream corrects it.
  const refreshAreas = useCallback(() => {
    void api.getAreas().then(
      (areas) => dispatch({ type: "areasRefreshed", areas }),
      () => undefined,
    );
  }, [api]);

  // One app-level subscription (105): stream events merge into the store; a reconnect re-fetches the areas once.
  useEffect(() => {
    let previous: ConnectionState = "open";
    return api.subscribe(
      (entity) => dispatch({ type: "entityUpdated", entity }),
      (next) => {
        setConnection(next);
        if (isStreamRecovery(previous, next)) refreshAreas();
        previous = next;
      },
    );
  }, [api, refreshAreas]);

  // Feature 126: a tab that was hidden for more than 60 s may have missed changes; re-fetch when it is shown again.
  useEffect(() => {
    let hiddenSince: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenSince ??= Date.now();
        return;
      }
      if (shouldResyncAfterHidden(hiddenSince, Date.now())) refreshAreas();
      hiddenSince = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refreshAreas]);

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
        refreshAreas(); // keeps the last state on failure; the next stream event or reload will correct it
      }, SETTLE_TIMEOUT_MS);
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [settlingKey, refreshAreas]);

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
      // Feature 127: the calibrated cover slider has its own endpoint (backend 011).
      const request =
        intent.kind === "cover_percent"
          ? api.setCoverPercent(entity.entityId, intent.percent)
          : api.runAction(entity.entityId, intentAction(intent));
      return request.then(
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
      logAlert,
    }),
    [state, load, selectedArea, selectedGroup, sendIntent, connection, logAlert],
  );

  // Feature 147: zone colors come from the same areas list (every HA area, the unassigned group excluded).
  const zoneAreaIds = useMemo(() => state.areas.map((a) => a.areaId).filter((id) => id !== UNASSIGNED), [state.areas]);

  return (
    <EntitiesContext.Provider value={value}>
      <ZoneColorsProvider areaIds={zoneAreaIds}>{children}</ZoneColorsProvider>
    </EntitiesContext.Provider>
  );
}

export function useEntities(): EntitiesContextValue {
  const value = useContext(EntitiesContext);
  if (!value) throw new Error("useEntities must be used inside EntitiesProvider");
  return value;
}
