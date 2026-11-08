import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApi } from "@/api/ApiContext";
import { subscribeServerEvents, subscribeStreamState } from "@/api/serverEvents";
import type { Entity, ServerAlert } from "@/api/types";
import { deviceRowKeyIn } from "@/features/devices/deviceFilters";
import { useEntityName } from "@/features/names/useEntityName";
import { UNASSIGNED, type EntitiesStatus, type PendingAction } from "@/state/entities";
import type { FeedEvent } from "@/state/feed";
import { useAlertRules } from "@/state/AlertRulesProvider";
import { useEntities } from "@/state/EntitiesProvider";
import { useToast } from "@components/feedback/Toast";
import { ROUTE_PATHS } from "@pages/routePaths";
import PathUtils from "@utils/PathUtils";
import { createAlarm, type Alarm } from "./alarm";
import { entityChanges, evaluate, takeFirings, type AlertEvent } from "./engine";
import { isSilentAtLoad, sinceLabel } from "./serverAlerts";

// Feature 129: the alert monitor. Runs once (AlertsProvider) and reacts to every store change after the first load.
// LOW: feed only. MEDIUM: clickable toast (opens the device). HIGH: queued banner, sound, Home 3D with the area selected.
// Feature 139: when the backend has /api/alerts (server mode) the server raises the alerts and this hook shows them;
// the local engine runs only in local mode (404 from /api/alerts).
export const TOAST_MEDIUM_MS = 8000;

export interface HighAlert {
  id: string;
  entityId: string;
  name: string;
  areaName: string | null;
  text: string;
  since?: string; // feature 139: "hh:mm" for an alert loaded from the start list
  silent?: boolean; // feature 139: an old alert loaded at start: shown in the banner, no navigation, no sound
}

export interface AlertCenterValue {
  queue: HighAlert[]; // HIGH alerts waiting; the first one is shown
  soundEnabled: boolean;
  enableSound: () => void; // one user gesture unlocks Web Audio for the session
  dismiss: () => void; // removes the shown HIGH alert (server mode: acks it on every device)
  dismissAll: () => void; // feature 139: acks every open alert (server mode) and clears the queue
}

type Mode = "unknown" | "server" | "local";

interface Snapshot {
  status: EntitiesStatus;
  entities: Record<string, Entity>;
  pending: Record<string, PendingAction>;
}

function feedEventOf(event: AlertEvent, entity: Entity): FeedEvent {
  return {
    key: `alert:${event.rule.id}@${event.at}`,
    entityId: entity.entityId,
    name: entity.name,
    deviceName: entity.deviceName,
    value: event.text,
    area: entity.area,
    at: event.at,
    alert: event.level,
  };
}

export function useAlerts(): AlertCenterValue {
  const { state, logAlert, setSelectedArea } = useEntities();
  const { rules } = useAlertRules();
  const api = useApi();
  const toast = useToast();
  const { displayName } = useEntityName();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [queue, setQueue] = useState<HighAlert[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [mode, setMode] = useState<Mode>("unknown");
  const alarmRef = useRef<Alarm | null>(null);
  const previous = useRef<Snapshot | null>(null);
  const lastFired = useRef(new Map<string, number>());
  const seenAlerts = useRef(new Set<string>());
  // Latest store and router values for the stream callbacks, which are subscribed once.
  const latest = useRef({ entities: state.entities, areas: state.areas, pathname, displayName, navigate, toast, logAlert, setSelectedArea });
  useEffect(() => {
    latest.current = { entities: state.entities, areas: state.areas, pathname, displayName, navigate, toast, logAlert, setSelectedArea };
  });
  const isServer = mode === "server";

  // Server mode: one alert from the backend. fromList: the start list or a reconnect merge; otherwise a live frame.
  const onServerAlert = useCallback((alert: ServerAlert, fromList: boolean) => {
    if (seenAlerts.current.has(alert.id)) return;
    seenAlerts.current.add(alert.id);
    const { entities, areas, pathname: path, displayName: nameOf, navigate: go, toast: notify, logAlert: log, setSelectedArea: select } = latest.current;
    const entity = alert.entityId ? entities[alert.entityId] : undefined;
    const name = entity ? nameOf(entity) : (alert.entityId ?? "ALERT");
    log({
      key: `alert:${alert.id}`,
      entityId: alert.entityId ?? "",
      name,
      deviceName: entity?.deviceName,
      value: alert.text,
      area: entity?.area ?? null,
      at: alert.firedAt,
      alert: alert.level,
    });
    if (alert.level === "low") return;
    if (alert.level === "medium") {
      if (fromList) return; // old medium alerts stay in the feed
      if (!entity) {
        notify.show(`${name}: ${alert.text}`, { durationMs: TOAST_MEDIUM_MS });
        return;
      }
      const key = deviceRowKeyIn(entity.area ?? UNASSIGNED, entity);
      notify.show(`${name}: ${alert.text}`, { durationMs: TOAST_MEDIUM_MS, onClick: () => void go(PathUtils.deviceDetailPath(key)) });
      return;
    }
    const silent = fromList && isSilentAtLoad(alert, Date.now());
    const areaName = entity ? (areas.find((area) => area.areaId === entity.area)?.name ?? null) : null;
    setQueue((current) =>
      current.some((item) => item.id === alert.id)
        ? current
        : [
            ...current,
            {
              id: alert.id,
              entityId: alert.entityId ?? "",
              name,
              areaName,
              text: alert.text,
              since: fromList ? sinceLabel(alert.firedAt) : undefined,
              silent,
            },
          ],
    );
    if (silent) return;
    if (path !== ROUTE_PATHS.home) void go(ROUTE_PATHS.home);
    if (entity) select(entity.area);
  }, []);

  // Feature 139: start list, live frames, reconnect merge. A backend without /api/alerts keeps the 129 local engine.
  useEffect(() => {
    let active = true;
    let serverMode = false;
    let wasDown = false;
    const enterServer = () => {
      if (serverMode) return;
      serverMode = true;
      setMode("server");
    };
    const load = (initial: boolean) =>
      api.listAlerts("open").then(
        (alerts) => {
          if (!active) return;
          enterServer();
          if (!initial) {
            // Alerts acked (or expired) while the stream was down leave the queue.
            const open = new Set(alerts.map((alert) => alert.id));
            setQueue((current) => current.filter((item) => open.has(item.id)));
          }
          for (const alert of [...alerts].reverse()) onServerAlert(alert, true); // oldest first keeps the queue order
        },
        () => {
          if (active && !serverMode) setMode("local");
        },
      );
    void load(true);
    const unsubscribeServer = subscribeServerEvents((event) => {
      if (event.type === "alert") {
        enterServer();
        onServerAlert(event.alert, false);
      } else if (event.type === "alert_acked") {
        setQueue((current) => current.filter((item) => item.id !== event.id));
      }
    });
    const unsubscribeStream = subscribeStreamState((next) => {
      if (next !== "open") {
        wasDown = true;
        return;
      }
      if (wasDown) {
        wasDown = false;
        void load(false);
      }
    });
    return () => {
      active = false;
      unsubscribeServer();
      unsubscribeStream();
    };
  }, [api, onServerAlert]);

  // Evaluate every change since the last store version. The first load (and any reload) is a snapshot: no alerts.
  // Local engine only: in server mode (or while the mode is still unknown) the server decides.
  useEffect(() => {
    const before = previous.current;
    previous.current = { status: state.status, entities: state.entities, pending: state.pending };
    if (mode !== "local") return;
    if (!before || before.status !== "ready" || state.status !== "ready") return;

    const changes = entityChanges(before.entities, before.pending, state.entities, state.pending);
    const events = takeFirings(
      changes.flatMap((change) => evaluate(rules, change.before, change.after, { interacted: change.interacted })),
      lastFired.current,
      Date.now(),
    );
    for (const event of events) {
      const entity = state.entities[event.entityId];
      const name = displayName(entity);
      logAlert(feedEventOf(event, entity));
      if (event.level === "medium") {
        const key = deviceRowKeyIn(entity.area ?? UNASSIGNED, entity);
        toast.show(`${name}: ${event.text}`, {
          durationMs: TOAST_MEDIUM_MS,
          onClick: () => void navigate(PathUtils.deviceDetailPath(key)),
        });
      }
      if (event.level === "high") {
        const areaName = state.areas.find((area) => area.areaId === entity.area)?.name ?? null;
        setQueue((current) => [
          ...current,
          { id: `${event.rule.id}@${event.at}`, entityId: entity.entityId, name, areaName, text: event.text },
        ]);
        if (pathname !== ROUTE_PATHS.home) void navigate(ROUTE_PATHS.home);
        setSelectedArea(entity.area);
      }
    }
  }, [mode, state.entities, state.pending, state.status, state.areas, rules, displayName, logAlert, toast, navigate, pathname, setSelectedArea]);

  const enableSound = useCallback(() => {
    if (alarmRef.current) return;
    try {
      const ctx = new AudioContext();
      void ctx.resume();
      alarmRef.current = createAlarm(ctx);
      setSoundEnabled(true);
    } catch {
      // No Web Audio: the banner keeps its "sound blocked" hint.
    }
  }, []);

  // The beep loops while audible HIGH alerts wait and stops when they are gone (or after 30 s, see alarm.ts).
  const audible = queue.some((item) => !item.silent);
  useEffect(() => {
    const alarm = alarmRef.current;
    if (!alarm) return;
    if (audible) alarm.start();
    else alarm.stop();
  }, [audible, soundEnabled]);

  useEffect(() => () => alarmRef.current?.stop(), []);

  const dismiss = useCallback(() => {
    const first = queue[0];
    if (!first) return;
    if (!isServer) {
      setQueue((current) => current.slice(1));
      return;
    }
    setQueue((current) => current.filter((item) => item.id !== first.id));
    api.ackAlert(first.id).catch(() => {
      setQueue((current) => (current.some((item) => item.id === first.id) ? current : [first, ...current]));
      toast.show("COULD NOT DISMISS");
    });
  }, [queue, isServer, api, toast]);

  const dismissAll = useCallback(() => {
    const all = queue;
    setQueue([]);
    if (!isServer) return;
    api.ackAllAlerts().catch(() => {
      setQueue((current) => [...all.filter((item) => !current.some((kept) => kept.id === item.id)), ...current]);
      toast.show("COULD NOT DISMISS");
    });
  }, [queue, isServer, api, toast]);

  return useMemo(
    () => ({ queue, soundEnabled, enableSound, dismiss, dismissAll }),
    [queue, soundEnabled, enableSound, dismiss, dismissAll],
  );
}
