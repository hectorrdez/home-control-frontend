import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Entity } from "@/api/types";
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

// Feature 129: the alert monitor. Runs once (AlertsProvider) and reacts to every store change after the first load.
// LOW: feed only. MEDIUM: clickable toast (opens the device). HIGH: queued banner, sound, Home 3D with the area selected.
export const TOAST_MEDIUM_MS = 8000;

export interface HighAlert {
  id: string;
  entityId: string;
  name: string;
  areaName: string | null;
  text: string;
}

export interface AlertCenterValue {
  queue: HighAlert[]; // HIGH alerts waiting; the first one is shown
  soundEnabled: boolean;
  enableSound: () => void; // one user gesture unlocks Web Audio for the session
  dismiss: () => void; // removes the shown HIGH alert
}

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
  const toast = useToast();
  const { displayName } = useEntityName();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [queue, setQueue] = useState<HighAlert[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const alarmRef = useRef<Alarm | null>(null);
  const previous = useRef<Snapshot | null>(null);
  const lastFired = useRef(new Map<string, number>());

  // Evaluate every change since the last store version. The first load (and any reload) is a snapshot: no alerts.
  useEffect(() => {
    const before = previous.current;
    previous.current = { status: state.status, entities: state.entities, pending: state.pending };
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
  }, [state.entities, state.pending, state.status, state.areas, rules, displayName, logAlert, toast, navigate, pathname, setSelectedArea]);

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

  // The beep loops while HIGH alerts wait and stops when the queue empties (or after 30 s, see alarm.ts).
  useEffect(() => {
    const alarm = alarmRef.current;
    if (!alarm) return;
    if (queue.length > 0) alarm.start();
    else alarm.stop();
  }, [queue.length, soundEnabled]);

  useEffect(() => () => alarmRef.current?.stop(), []);

  const dismiss = useCallback(() => setQueue((current) => current.slice(1)), []);

  return useMemo(() => ({ queue, soundEnabled, enableSound, dismiss }), [queue, soundEnabled, enableSound, dismiss]);
}
