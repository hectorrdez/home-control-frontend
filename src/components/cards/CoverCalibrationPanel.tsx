import { useState } from "react";
import Button from "@components/controls/Button";
import { useToast } from "@components/feedback/Toast";
import type { Entity } from "@/api/types";
import { useCalibrations } from "@/state/CalibrationsProvider";
import CalibrationWizard from "./CalibrationWizard";

// Feature 127: calibrate, recalibrate or delete the timing of a cover without position feedback. Hidden while the
// calibrations endpoint is unavailable, and for covers that report their own position.
interface CoverCalibrationPanelProps {
  entity: Entity;
  disabled: boolean;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export default function CoverCalibrationPanel({ entity, disabled }: CoverCalibrationPanelProps) {
  const { status, calibrations, remove } = useCalibrations();
  const toast = useToast();
  const [wizardOpen, setWizardOpen] = useState(false);
  const reportsPosition = typeof entity.attributes.current_position === "number";
  if (status !== "ready" || reportsPosition) return null;

  if (wizardOpen) return <CalibrationWizard entity={entity} onClose={() => setWizardOpen(false)} />;

  const calibration = calibrations[entity.entityId];
  const onDelete = () => {
    remove(entity.entityId).catch(() => toast.show(`Could not delete the calibration of ${entity.name}`));
  };

  return (
    <section aria-label="Calibration" className="flex flex-col gap-space-xs">
      {calibration && (
        <p className="font-mono text-label-caps uppercase text-on-surface-variant">
          {`CALIBRATED // CLOSE ${seconds(calibration.closeMs)} // OPEN ${seconds(calibration.openMs)}`}
        </p>
      )}
      <div className="flex gap-space-sm">
        <Button variant="secondary" className="flex-1" disabled={disabled} onClick={() => setWizardOpen(true)}>
          {calibration ? "RECALIBRATE" : "CALIBRATE"}
        </Button>
        {calibration && (
          <Button variant="destructive" className="flex-1" disabled={disabled} onClick={onDelete}>
            DELETE CALIBRATION
          </Button>
        )}
      </div>
    </section>
  );
}
