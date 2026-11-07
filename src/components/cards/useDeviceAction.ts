import { useCallback, useEffect, useRef, useState } from "react";
import type { Entity } from "@/api/types";
import { useEntities } from "@/state/EntitiesProvider";
import { useToast } from "@components/feedback/Toast";
import { useEntityName } from "@/features/names/useEntityName";
import type { Intent } from "@/state/actions";

// 117: how long the success flash / error highlight stays after an action settles.
const FEEDBACK_MS = 1200;

// Feature 122: the send + feedback logic shared by the device card (DeviceModule) and the detail page.
// Pending/settling come from the store; success flashes, a failed send highlights and shows the error toast.
export function useDeviceAction(entity: Entity) {
  const { state, sendIntent } = useEntities();
  const toast = useToast();
  const names = useEntityName();
  const transition = state.pending[entity.entityId];
  const pending = Boolean(transition);
  const settling = transition?.settling ?? false;
  const outcome = useRef<boolean | null>(null); // result of the last send: false = rolled back by the provider
  const wasPending = useRef(false);
  const feedbackTimer = useRef<number | undefined>(undefined);
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);

  const flash = useCallback((kind: "success" | "error") => {
    window.clearTimeout(feedbackTimer.current);
    setFeedback(kind);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), FEEDBACK_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);

  // The settled action flashes success, unless its send already failed (the failure owns the highlight).
  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    if (outcome.current !== false) flash("success");
  }, [pending, flash]);

  const send = (intent: Intent) => {
    outcome.current = null;
    void sendIntent(entity, intent).then((ok) => {
      outcome.current = ok;
      if (!ok) {
        flash("error");
        toast.show(`Could not update ${names.displayName(entity)}`);
      }
    });
  };

  return { send, pending, settling, feedback };
}
