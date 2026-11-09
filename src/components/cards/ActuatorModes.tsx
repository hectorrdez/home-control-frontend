import { useState, type FormEvent, type KeyboardEvent } from "react";
import Button from "@components/controls/Button";
import Dialog from "@components/controls/Dialog";
import Slider from "@components/controls/Slider";
import type { Entity, Preset } from "@/api/types";
import { useEntityName } from "@/features/names/useEntityName";
import {
  PRESET_MAX_PER_COVER,
  initialPresetPercent,
  presetErrorText,
  presetNameValid,
} from "@/features/presets/presets";
import { useCalibrations } from "@/state/CalibrationsProvider";
import { usePresets } from "@/state/PresetsProvider";

// Feature 156: the MODES dialog of a cover. Lists its saved positions (142) to apply, edit (name and position) or
// create. It reuses the 142 presets provider and wording; applying a mode closes the dialog.
interface ActuatorModesProps {
  entity: Entity;
  onClose: () => void;
}

export default function ActuatorModes({ entity, onClose }: ActuatorModesProps) {
  const names = useEntityName();
  const { presetsFor, save, rename, apply } = usePresets();
  const { calibrations } = useCalibrations();
  const list: Preset[] = presetsFor(entity.entityId);
  const full = list.length >= PRESET_MAX_PER_COVER;

  const [newName, setNewName] = useState("");
  const [newPercent, setNewPercent] = useState<number | null>(null);
  const percent = newPercent ?? initialPresetPercent(entity, calibrations[entity.entityId]);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPercent, setEditPercent] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (preset: Preset) => {
    setError(null);
    setEditingId(preset.id);
    setEditName(preset.name);
    setEditPercent(preset.percent);
  };

  const saveEdit = (preset: Preset) => {
    const next = editName.trim();
    if (!presetNameValid(next)) {
      setError("NAME MUST BE 1 TO 30 CHARACTERS");
      return;
    }
    setError(null);
    setBusyId(preset.id);
    rename(preset.id, { name: next, percent: editPercent }).then(
      () => {
        setBusyId(null);
        setEditingId(null);
      },
      (err: unknown) => {
        setBusyId(null);
        setError(presetErrorText(err, "COULD NOT RENAME POSITION"));
      },
    );
  };

  const onEditKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      // Escape cancels the edit only; the dialog stays open.
      event.preventDefault();
      event.stopPropagation();
      setEditingId(null);
    }
  };

  const onApply = (preset: Preset) => {
    setError(null);
    setBusyId(preset.id);
    apply(preset.id).then(
      () => onClose(),
      (err: unknown) => {
        setBusyId(null);
        setError(presetErrorText(err, "COULD NOT RUN POSITION"));
      },
    );
  };

  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!presetNameValid(newName) || creating) return;
    setCreating(true);
    setError(null);
    save({ entityId: entity.entityId, name: newName.trim(), percent }).then(
      () => {
        setCreating(false);
        setNewName("");
        setNewPercent(null);
      },
      (err: unknown) => {
        setCreating(false);
        setError(presetErrorText(err, "COULD NOT SAVE MODE"));
      },
    );
  };

  return (
    <Dialog title={`Modos: ${names.displayName(entity)}`} onClose={onClose}>
      {list.length === 0 ? (
        <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">NO MODES YET</p>
      ) : (
        <ul aria-label="Modes" className="flex flex-col gap-space-xs">
          {list.map((preset) =>
            editingId === preset.id ? (
              <li key={preset.id}>
                <div className="flex flex-col gap-space-xs">
                  <input
                    type="text"
                    value={editName}
                    maxLength={30}
                    aria-label="Edit mode name"
                    onKeyDown={onEditKey}
                    onChange={(event) => setEditName(event.currentTarget.value)}
                    className="min-w-0 rounded border border-outline-variant bg-surface-container-lowest px-space-sm py-space-xs font-sans text-body-md text-on-surface"
                  />
                  <Slider
                    label="POSITION"
                    value={editPercent}
                    min={0}
                    max={100}
                    unit="%"
                    hue="primary"
                    busy={busyId === preset.id}
                    onCommit={setEditPercent}
                  />
                  <div className="flex gap-space-sm">
                    <Button className="flex-1" busy={busyId === preset.id} disabled={busyId !== null} onClick={() => saveEdit(preset)}>
                      SAVE
                    </Button>
                    <Button variant="secondary" className="flex-1" disabled={busyId !== null} onClick={() => setEditingId(null)}>
                      CANCEL
                    </Button>
                  </div>
                </div>
              </li>
            ) : (
              <li key={preset.id} className="flex items-center gap-space-sm">
                <span className="min-w-0 flex-1 truncate font-sans text-body-md uppercase text-on-surface">{preset.name}</span>
                <span className="font-mono text-telemetry-md text-on-surface">{`${preset.percent}%`}</span>
                <Button
                  variant="secondary"
                  aria-label={`Apply ${preset.name} ${preset.percent}%`}
                  busy={busyId === preset.id}
                  disabled={busyId !== null}
                  onClick={() => onApply(preset)}
                >
                  APPLY
                </Button>
                <Button
                  variant="secondary"
                  aria-label={`Edit ${preset.name}`}
                  disabled={busyId !== null}
                  onClick={() => startEdit(preset)}
                >
                  EDIT
                </Button>
              </li>
            ),
          )}
        </ul>
      )}

      {full ? (
        <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">{`MAX ${PRESET_MAX_PER_COVER} MODES`}</p>
      ) : (
        <form aria-label="New mode" onSubmit={onCreate} className="flex flex-col gap-space-sm">
          <label className="flex flex-col gap-space-xs font-label-caps text-label-caps uppercase text-on-surface-variant">
            NEW MODE NAME
            <input
              value={newName}
              onChange={(event) => setNewName(event.currentTarget.value)}
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
            busy={creating}
            onCommit={setNewPercent}
          />
          <Button type="submit" className="self-start" busy={creating} disabled={creating || !presetNameValid(newName)}>
            CREATE MODE
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="font-body-md text-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
