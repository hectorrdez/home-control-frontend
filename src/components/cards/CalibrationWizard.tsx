import { useEffect, useReducer, useRef, useState } from "react";
import Button from "@components/controls/Button";
import type { Entity } from "@/api/types";
import { useCalibrations } from "@/state/CalibrationsProvider";
import { useEntities } from "@/state/EntitiesProvider";
import type { Intent } from "@/state/actions";
import { initialWizard, wizardReducer, SEND_FAILED_MESSAGE, type Leg } from "@/features/calibration/wizard";

// Feature 127: two-step timed calibration for a cover without position feedback (close, then open).
// The clock starts when the action request resolved and stops at DONE; the summary saves both times (backend 010).
const TICK_MS = 200;
const LEG_INTENT: Record<Leg, Intent> = { close: { kind: "cover_close" }, open: { kind: "cover_open" } };
const LEG_COPY: Record<Leg, { step: number; verb: string; doing: string; past: string }> = {
  close: { step: 1, verb: "CLOSE", doing: "CLOSING", past: "closed" },
  open: { step: 2, verb: "OPEN", doing: "OPENING", past: "open" },
};

interface CalibrationWizardProps {
  entity: Entity;
  onClose: () => void;
}

export default function CalibrationWizard({ entity, onClose }: CalibrationWizardProps) {
  const { sendIntent } = useEntities();
  const { save } = useCalibrations();
  const [wizard, dispatch] = useReducer(wizardReducer, initialWizard);
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    if (wizard.status !== "moving") return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [wizard.status]);

  const begin = (leg: Leg) => {
    const attempt = ++attempts.current;
    dispatch({ type: "sending", leg, attempt });
    void sendIntent(entity, LEG_INTENT[leg]).then((ok) => {
      if (ok) dispatch({ type: "sent", attempt, at: Date.now() });
      else dispatch({ type: "failed", attempt, message: SEND_FAILED_MESSAGE });
    });
  };

  const press = () => {
    const at = Date.now();
    const next = wizardReducer(wizard, { type: "done", at });
    dispatch({ type: "done", at });
    if (next.status === "sending") begin(next.leg);
  };

  const cancel = () => {
    if (wizard.status === "sending" || wizard.status === "moving") void sendIntent(entity, { kind: "cover_stop" });
    onClose();
  };

  const saveCalibration = () => {
    if (wizard.closeMs === undefined || wizard.openMs === undefined) return;
    setSaving(true);
    setSaveError(null);
    save(entity.entityId, { openMs: wizard.openMs, closeMs: wizard.closeMs }).then(onClose, () => {
      setSaving(false);
      setSaveError("Could not save the calibration. Try again.");
    });
  };

  const copy = LEG_COPY[wizard.leg];
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

  return (
    <section aria-label="Calibration" className="flex flex-col gap-space-sm">
      {wizard.status === "idle" && (
        <>
          <p className="font-body-md text-on-surface">The cover will CLOSE, then OPEN. The times include your reaction time.</p>
          <div className="flex gap-space-sm">
            <Button className="flex-1" onClick={() => begin("close")}>
              START
            </Button>
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              CANCEL
            </Button>
          </div>
        </>
      )}

      {wizard.status === "sending" && (
        <p aria-live="polite" className="font-mono text-label-caps uppercase text-on-surface-variant">
          {`STEP ${copy.step}/2: SENDING ${copy.verb}`}
        </p>
      )}

      {wizard.status === "moving" && (
        <>
          <p aria-live="polite" className="font-body-md text-on-surface">
            {`Step ${copy.step}/2: the cover is ${copy.doing}. Press DONE when it has fully ${copy.past}.`}
          </p>
          <p className="font-mono text-telemetry-md text-on-surface">{`ELAPSED ${seconds(now - wizard.since)}`}</p>
          <div className="flex gap-space-sm">
            <Button className="flex-1" onClick={press}>
              DONE
            </Button>
            <Button variant="secondary" className="flex-1" onClick={cancel}>
              CANCEL
            </Button>
          </div>
        </>
      )}

      {wizard.status === "failed" && (
        <>
          <p role="alert" className="font-body-md text-error">
            {wizard.message}
          </p>
          <div className="flex gap-space-sm">
            <Button className="flex-1" onClick={() => begin(wizard.leg)}>
              RETRY
            </Button>
            <Button variant="secondary" className="flex-1" onClick={cancel}>
              CANCEL
            </Button>
          </div>
        </>
      )}

      {wizard.status === "summary" && wizard.closeMs !== undefined && wizard.openMs !== undefined && (
        <>
          <p className="font-mono text-telemetry-md text-on-surface">
            {`CLOSE ${seconds(wizard.closeMs)} // OPEN ${seconds(wizard.openMs)}`}
          </p>
          {saveError && (
            <p role="alert" className="font-body-md text-error">
              {saveError}
            </p>
          )}
          <div className="flex gap-space-sm">
            <Button className="flex-1" busy={saving} disabled={saving} onClick={saveCalibration}>
              SAVE
            </Button>
            <Button variant="secondary" className="flex-1" disabled={saving} onClick={() => dispatch({ type: "reset" })}>
              RETRY
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
