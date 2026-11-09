import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import PathUtils from "@utils/PathUtils";
import Button from "@components/controls/Button";
import Dialog from "@components/controls/Dialog";
import Slider from "@components/controls/Slider";
import type { Entity } from "@/api/types";
import { useEntityName } from "@/features/names/useEntityName";
import { canUsePresets } from "@/features/presets/presets";
import { useCalibrations } from "@/state/CalibrationsProvider";
import { usePresets } from "@/state/PresetsProvider";
import ActuatorModes from "./ActuatorModes";
import { domainHue } from "./deviceState";
import { useDeviceAction } from "./useDeviceAction";

// Feature 156: the actuator long-press menu. Opens for one entity (the tile passes it up via onLongPress).
// Options: go to the device details, rename (inline, same rules as the device rename), and MODES when the cover
// can save positions (opens the modes dialog). Calibrated or position-reporting covers get a position slider.
interface ActuatorMenuProps {
  entity: Entity;
  onClose: () => void;
}

export default function ActuatorMenu({ entity, onClose }: ActuatorMenuProps) {
  const [view, setView] = useState<"menu" | "modes">("menu");
  if (view === "modes") return <ActuatorModes entity={entity} onClose={onClose} />;
  return <MenuDialog entity={entity} onClose={onClose} onModes={() => setView("modes")} />;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function MenuDialog({ entity, onClose, onModes }: ActuatorMenuProps & { onModes: () => void }) {
  const navigate = useNavigate();
  const names = useEntityName();
  const { status: presetStatus } = usePresets();
  const { calibrations } = useCalibrations();
  const modesAvailable = presetStatus === "ready" && canUsePresets(entity, calibrations[entity.entityId]);
  const { send, pending } = useDeviceAction(entity);

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const focusRenameButton = useRef(false);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (focusRenameButton.current) {
      focusRenameButton.current = false;
      renameButtonRef.current?.focus();
    }
  }, [renaming]);

  const startRename = () => {
    setDraft(names.displayName(entity));
    setRenameError(null);
    setRenaming(true);
  };

  const cancelRename = () => {
    focusRenameButton.current = true;
    setRenaming(false);
  };

  // Enter saves. A failed save keeps the editor open with the error. An empty name resets to the cleaned HA name
  // (the alias hook treats it as a reset).
  const saveRename = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setRenameError(null);
    const ok = await names.renameEntity(entity, draft);
    savingRef.current = false;
    setSaving(false);
    if (ok) cancelRename();
    else setRenameError("COULD NOT RENAME");
  };

  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveRename();
    } else if (event.key === "Escape") {
      // Escape cancels the edit only; the dialog stays open.
      event.preventDefault();
      event.stopPropagation();
      if (!savingRef.current) cancelRename();
    }
  };

  return (
    <Dialog title={names.displayName(entity)} onClose={onClose}>
      {entity.domain === "cover" && <CoverRange entity={entity} disabled={pending} send={send} />}

      {renaming ? (
        <div className="flex flex-col gap-space-xs">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            maxLength={80}
            disabled={saving}
            aria-label={`Name for ${entity.entityId}`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onRenameKey}
            className="min-w-0 rounded border border-outline-variant bg-surface px-space-xs py-space-xs font-sans text-title-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary-container"
          />
          <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            {saving ? <span className="font-mono">SENDING</span> : "ENTER SAVE • ESC CANCEL • EMPTY RESETS"}
          </p>
          {renameError && (
            <p role="alert" className="font-body-md text-error">
              {renameError}
            </p>
          )}
        </div>
      ) : (
        <div role="group" aria-label="Options" className="flex flex-col gap-space-xs">
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={() => {
              void navigate(PathUtils.deviceDetailPath(entity.entityId));
              onClose();
            }}
          >
            Ir a detalles del dispositivo
          </Button>
          {names.canRename && (
            <Button ref={renameButtonRef} variant="secondary" className="w-full justify-start" onClick={startRename}>
              Cambiar nombre
            </Button>
          )}
          {modesAvailable && (
            <Button variant="secondary" className="w-full justify-start" onClick={onModes}>
              Modos
            </Button>
          )}
        </div>
      )}
    </Dialog>
  );
}

// Position slider for a cover that reports its position, or a calibrated one (estimate, 0 and 100 only until the
// first end-to-end move). Same commands as the device controls on the detail page.
function CoverRange({ entity, disabled, send }: { entity: Entity; disabled: boolean; send: ReturnType<typeof useDeviceAction>["send"] }) {
  const { status, calibrations } = useCalibrations();
  const hue = domainHue(entity.domain);
  const reported = num(entity.attributes.current_position);
  if (reported !== null) {
    return (
      <Slider
        label={`${reported}% OPEN`}
        value={reported}
        min={0}
        max={100}
        unit="%"
        hue={hue}
        busy={disabled}
        onCommit={(position) => send({ kind: "cover_position", position })}
      />
    );
  }
  if (status !== "ready" || !calibrations[entity.entityId]) return null;
  const estimate = num(entity.attributes.estimated_position);
  const label =
    estimate !== null ? `${estimate}% OPEN (EST.)` : disabled ? "MOVING" : "POSITION UNKNOWN: move to an end first";
  return (
    <Slider
      label={label}
      value={estimate ?? 0}
      min={0}
      max={100}
      unit="%"
      hue={hue}
      busy={disabled}
      disabled={estimate === null}
      onCommit={(percent) => send({ kind: "cover_percent", percent })}
    />
  );
}
