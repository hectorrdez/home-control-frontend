import { useState, type FormEvent, type RefObject } from "react";
import Button from "@components/controls/Button";
import EditableName from "@components/controls/EditableName";
import Slider from "@components/controls/Slider";
import Card from "./Card";
import type { Entity, Preset } from "@/api/types";
import { useCalibrations } from "@/state/CalibrationsProvider";
import { usePresets } from "@/state/PresetsProvider";
import {
  PRESET_MAX_PER_COVER,
  canUsePresets,
  initialPresetPercent,
  presetErrorText,
  presetNameValid,
} from "@/features/presets/presets";

// Feature 142: saved positions of one cover (backend 021), on the device detail page. Hidden while presets are
// unavailable (no endpoint). Non-eligible covers only say how to become eligible.
interface SavedPositionsCardProps {
  entity: Entity;
  nameRef?: RefObject<HTMLInputElement | null>; // focused by the calibration wizard's SAVE A POSITION shortcut
}

export default function SavedPositionsCard({ entity, nameRef }: SavedPositionsCardProps) {
  const { status, presetsFor, save, rename, remove, apply } = usePresets();
  const { calibrations } = useCalibrations();
  const calibration = calibrations[entity.entityId];
  const [name, setName] = useState("");
  // null until the user moves the slider: the prefill follows the calibration once it has loaded.
  const [chosen, setChosen] = useState<number | null>(null);
  const percent = chosen ?? initialPresetPercent(entity, calibration);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status !== "ready") return null;

  const eligible = canUsePresets(entity, calibration);
  const list = presetsFor(entity.entityId);
  const full = list.length >= PRESET_MAX_PER_COVER;

  const onApply = (preset: Preset) => {
    setError(null);
    setBusyId(preset.id);
    apply(preset.id).then(
      () => setBusyId(null),
      (err: unknown) => {
        setBusyId(null);
        setError(presetErrorText(err, "COULD NOT APPLY POSITION"));
      },
    );
  };

  const onDelete = (preset: Preset) => {
    setError(null);
    setConfirmId(null);
    setBusyId(preset.id);
    remove(preset.id).then(
      () => setBusyId(null),
      (err: unknown) => {
        setBusyId(null);
        setError(presetErrorText(err, "COULD NOT DELETE POSITION"));
      },
    );
  };

  const onRename = (preset: Preset, draft: string): Promise<boolean> => {
    const next = draft.trim();
    if (!presetNameValid(next)) {
      setError("NAME MUST BE 1 TO 30 CHARACTERS");
      return Promise.resolve(false);
    }
    if (next === preset.name) return Promise.resolve(true);
    setError(null);
    return rename(preset.id, { name: next, percent: preset.percent }).then(
      () => true,
      (err: unknown) => {
        setError(presetErrorText(err, "COULD NOT RENAME POSITION"));
        return false;
      },
    );
  };

  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!presetNameValid(name) || saving) return;
    setSaving(true);
    setError(null);
    save({ entityId: entity.entityId, name: name.trim(), percent }).then(
      () => {
        setName("");
        setChosen(null);
        setSaving(false);
      },
      (err: unknown) => {
        setSaving(false);
        setError(presetErrorText(err, "COULD NOT SAVE POSITION"));
      },
    );
  };

  return (
    <Card className="flex flex-col gap-space-sm">
      <h2 className="font-label-caps text-label-caps uppercase text-on-surface-variant">SAVED POSITIONS</h2>

      {!eligible ? (
        <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">CALIBRATE TO SAVE POSITIONS</p>
      ) : (
        <>
          {list.length === 0 ? (
            <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">NO SAVED POSITIONS</p>
          ) : (
            <ul aria-label="Saved positions" className="flex flex-col gap-space-xs">
              {list.map((preset) => (
                <li key={preset.id} className="flex flex-wrap items-center gap-space-sm">
                  <EditableName
                    entityId={preset.id}
                    shown={preset.name}
                    label={preset.name}
                    raw={preset.name}
                    canRename={busyId === null}
                    onRename={(draft) => onRename(preset, draft)}
                    textClassName="font-sans text-body-md uppercase text-on-surface"
                  />
                  <span className="font-mono text-telemetry-md text-on-surface">{`${preset.percent}%`}</span>
                  {confirmId === preset.id ? (
                    <div className="flex items-center gap-space-xs">
                      <span className="font-label-caps text-label-caps uppercase text-on-surface">{`DELETE ${preset.name.toUpperCase()}?`}</span>
                      <Button variant="destructive" onClick={() => onDelete(preset)}>
                        YES
                      </Button>
                      <Button variant="secondary" onClick={() => setConfirmId(null)}>
                        NO
                      </Button>
                    </div>
                  ) : (
                    <div className="ml-auto flex gap-space-xs">
                      <Button
                        variant="secondary"
                        aria-label={`Apply ${preset.name} ${preset.percent}%`}
                        busy={busyId === preset.id}
                        disabled={busyId !== null}
                        onClick={() => onApply(preset)}
                      >
                        APPLY
                      </Button>
                      <Button variant="secondary" disabled={busyId !== null} onClick={() => setConfirmId(preset.id)}>
                        DELETE
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {full ? (
            <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">{`MAX ${PRESET_MAX_PER_COVER} POSITIONS`}</p>
          ) : (
            <form aria-label="Save position" onSubmit={onSave} className="flex flex-col gap-space-sm">
              <label className="flex flex-col gap-space-xs font-label-caps text-label-caps uppercase text-on-surface-variant">
                POSITION NAME
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  className="rounded border border-outline-variant bg-surface-container-lowest px-space-sm py-space-xs font-sans text-body-md text-on-surface"
                />
              </label>
              <Slider
                label="POSITION"
                value={percent}
                min={0}
                max={100}
                unit="%"
                hue="primary"
                busy={saving}
                onCommit={setChosen}
              />
              <Button type="submit" className="self-start" busy={saving} disabled={saving || !presetNameValid(name)}>
                SAVE POSITION
              </Button>
            </form>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="font-body-md text-error">
          {error}
        </p>
      )}
    </Card>
  );
}
