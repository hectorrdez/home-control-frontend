import { useEffect, useRef, useState } from "react";
import Button from "@components/controls/Button";
import FilterPill from "@components/controls/FilterPill";
import Slider from "@components/controls/Slider";
import Stepper from "@components/controls/Stepper";
import Switch from "@components/controls/Switch";
import type { Intent } from "@/state/actions";
import type { Entity } from "@/api/types";
import { domainHue, type Hue } from "./deviceState";
import { useEntityName } from "@/features/names/useEntityName";
import { useCalibrations } from "@/state/CalibrationsProvider";

// Feature 104: the domain controls of a device module. Each control maps to one Intent (see state/actions.ts).
// Controls are disabled while the entity has an action in flight.
const CLIMATE_DEBOUNCE_MS = 600;
const DEFAULT_TEMP_STEP = 0.5;
const DEFAULT_MIN_TEMP = 7;
const DEFAULT_MAX_TEMP = 35;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

interface ControlProps {
  entity: Entity;
  label: string; // feature 115: display name (alias or cleaned); raw entity.name is never shown here
  hue: Hue;
  disabled: boolean;
  send: (intent: Intent) => void;
}

export default function DeviceControls({ entity, disabled, send }: Omit<ControlProps, "hue" | "label">) {
  const hue = domainHue(entity.domain);
  const label = useEntityName().displayName(entity);
  const props: ControlProps = { entity, label, hue, disabled, send };
  switch (entity.domain) {
    case "light":
      return <LightControls {...props} />;
    case "switch":
    case "fan":
      return <PowerControl {...props} />;
    case "climate":
      return <ClimateControls {...props} />;
    case "cover":
      return <CoverControls {...props} />;
    case "lock":
      return <LockControl {...props} />;
    case "scene":
    case "script":
      return (
        <Button variant="secondary" className="w-full" disabled={disabled} busy={disabled} onClick={() => send({ kind: "activate" })}>
          ACTIVATE
        </Button>
      );
    default:
      return null; // sensor / binary_sensor: read-only
  }
}

function PowerControl({ entity, label, disabled, send }: ControlProps) {
  return (
    <Switch
      aria-label={`${label} power`}
      checked={entity.state === "on"}
      disabled={disabled} busy={disabled}
      onCheckedChange={(on) => send({ kind: "power", on })}
    />
  );
}

function LightControls(props: ControlProps) {
  const { entity, send, disabled } = props;
  const brightness = num(entity.attributes.brightness);
  return (
    <div className="flex flex-col gap-space-sm">
      <PowerControl {...props} />
      {brightness !== null && (
        <Slider
          label="INTENSITY"
          value={Math.round((brightness / 255) * 100)}
          min={0}
          max={100}
          unit="%"
          hue="primary"
          busy={disabled}
          onCommit={(pct) => send({ kind: "brightness", pct })}
        />
      )}
    </div>
  );
}

// Stepper with a debounced commit: local draft moves at once, the action is sent 600 ms after the last step.
function ClimateControls({ entity, disabled, send }: ControlProps) {
  const target = num(entity.attributes.temperature) ?? DEFAULT_MIN_TEMP;
  const current = num(entity.attributes.current_temperature);
  const min = num(entity.attributes.min_temp) ?? DEFAULT_MIN_TEMP;
  const max = num(entity.attributes.max_temp) ?? DEFAULT_MAX_TEMP;
  const step = num(entity.attributes.target_temp_step) ?? DEFAULT_TEMP_STEP;
  const modes = strings(entity.attributes.hvac_modes);
  const presets = strings(entity.attributes.preset_modes);
  const [draft, setDraft] = useState(target);
  const dirty = useRef(false); // a local step is waiting to be sent

  // Follow the store (confirmed, optimistic or rolled back) unless a local step is waiting.
  useEffect(() => {
    if (!dirty.current) setDraft(target);
  }, [target]);

  useEffect(() => {
    if (!dirty.current) return;
    if (draft === target) {
      dirty.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      dirty.current = false;
      send({ kind: "temperature", temperature: draft });
    }, CLIMATE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // send is recreated per render with the current entity; the debounce is keyed on the draft only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const stepTo = (value: number) => {
    dirty.current = true;
    setDraft(value);
  };

  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex justify-between font-mono text-label-caps uppercase text-on-surface-variant">
        <span>{`CURRENT AMBIENT ${current === null ? "-" : `${current.toFixed(1)} °C`}`}</span>
        <span>{`TARGET SETPOINT ${target.toFixed(1)} °C`}</span>
      </div>
      <Stepper
        label="Target temperature"
        value={draft}
        min={min}
        max={max}
        step={step}
        unit=" °C"
        busy={disabled}
        onChange={stepTo}
      />
      {modes.length > 0 && (
        <div role="group" aria-label="HVAC mode" className="flex flex-wrap gap-space-xs">
          {modes.map((mode) => (
            <FilterPill
              key={mode}
              selected={entity.state === mode}
              disabled={disabled} busy={disabled}
              onClick={() => send({ kind: "hvac_mode", mode })}
            >
              {mode.toUpperCase()}
            </FilterPill>
          ))}
        </div>
      )}
      {presets.length > 0 && (
        <div role="group" aria-label="Preset" className="flex flex-wrap gap-space-xs">
          {presets.map((preset) => (
            <FilterPill
              key={preset}
              selected={entity.attributes.preset_mode === preset}
              disabled={disabled} busy={disabled}
              onClick={() => send({ kind: "preset", preset })}
            >
              {preset.toUpperCase()}
            </FilterPill>
          ))}
        </div>
      )}
    </div>
  );
}

// Feature 127: a calibrated cover without position feedback moves to a percentage (backend 011). The estimate is
// null while a move runs or before the first end-to-end move, so only SHUT (0%) and FULL (100%) are sent then.
function CalibratedCoverControls({ entity, hue, disabled, send }: ControlProps) {
  const estimate = num(entity.attributes.estimated_position);
  const label =
    estimate !== null ? `${estimate}% OPEN (EST.)` : disabled ? "MOVING" : "POSITION UNKNOWN: move to an end first";
  return (
    <div className="flex flex-col gap-space-sm">
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
      <div className="flex gap-space-sm">
        <Button variant="secondary" className="flex-1" disabled={disabled} busy={disabled} onClick={() => send({ kind: "cover_percent", percent: 0 })}>
          SHUT (0%)
        </Button>
        <Button variant="secondary" className="flex-1" disabled={disabled} busy={disabled} onClick={() => send({ kind: "cover_percent", percent: 100 })}>
          FULL (100%)
        </Button>
      </div>
    </div>
  );
}

// Covers that report no current_position are assumed-state: no slider, only SHUT / STOP / OPEN (until calibrated).
function CoverControls(props: ControlProps) {
  const { entity, hue, disabled, send } = props;
  const reported = num(entity.attributes.current_position);
  const { status, calibrations } = useCalibrations();
  if (reported === null && status === "ready" && calibrations[entity.entityId]) {
    return <CalibratedCoverControls {...props} />;
  }
  if (reported === null) {
    return (
      <div className="flex gap-space-sm">
        <Button variant="secondary" className="flex-1" disabled={disabled} busy={disabled} onClick={() => send({ kind: "cover_close" })}>
          SHUT
        </Button>
        <Button variant="secondary" className="flex-1" disabled={disabled} busy={disabled} onClick={() => send({ kind: "cover_stop" })}>
          STOP
        </Button>
        <Button variant="secondary" className="flex-1" disabled={disabled} busy={disabled} onClick={() => send({ kind: "cover_open" })}>
          OPEN
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-space-sm">
      <Slider
        label={`${reported}% OPEN`}
        value={reported}
        min={0}
        max={100}
        unit="%"
        hue={hue}
        busy={disabled}
        onCommit={(value) => send({ kind: "cover_position", position: value })}
      />
      <div className="flex gap-space-sm">
        <Button variant="secondary" className="flex-1" disabled={disabled} busy={disabled} onClick={() => send({ kind: "cover_close" })}>
          SHUT (0%)
        </Button>
        <Button variant="secondary" className="flex-1" disabled={disabled} busy={disabled} onClick={() => send({ kind: "cover_open" })}>
          FULL (100%)
        </Button>
      </div>
    </div>
  );
}

// Locking is immediate; unlocking asks for a confirm step first (destructive style).
function LockControl({ entity, label, disabled, send }: ControlProps) {
  const locked = entity.state === "locked";
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex flex-col gap-space-sm">
        <p className="font-mono text-label-caps uppercase text-error">Unlock {label}?</p>
        <div className="flex gap-space-sm">
          <Button
            variant="destructive"
            className="flex-1"
            disabled={disabled} busy={disabled}
            onClick={() => {
              setConfirming(false);
              send({ kind: "lock", locked: false });
            }}
          >
            CONFIRM UNLOCK
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
            CANCEL
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Switch
      aria-label={`${label} locked`}
      checked={locked}
      disabled={disabled} busy={disabled}
      onCheckedChange={(next) => (next ? send({ kind: "lock", locked: true }) : setConfirming(true))}
    />
  );
}
