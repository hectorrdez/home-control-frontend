import StringUtils from "@utils/StringUtils";
import { useId, useState } from "react";
import type { Hue } from "@/components/cards/deviceState";
import Spinner from "./Spinner";

// Feature 104: native range input in the domain hue. Commits on release (pointer up / key up), not on every move.
// Stays focusable while busy (117): only a small inline spinner next to the label.
type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  hue: Hue;
  busy?: boolean;
  disabled?: boolean; // feature 127: the calibrated cover has no estimate yet (only the 0 / 100 ends can be sent)
  onCommit: (value: number) => void;
};

const accent = {
  primary: "accent-primary-container",
  secondary: "accent-secondary",
  tertiary: "accent-tertiary-fixed-dim",
};

export default function Slider({ label, value, min, max, step = 1, unit, hue, busy = false, disabled = false, onCommit }: SliderProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;

  const commit = () => {
    if (draft === null) return;
    const next = draft;
    setDraft(null);
    if (next !== value) onCommit(next);
  };

  const labelId = useId();

  return (
    <div className="flex flex-col gap-space-xs">
      <span id={labelId} className="flex items-center justify-between font-mono text-label-caps uppercase text-on-surface-variant">
        <span className="flex items-center gap-space-xs">
          {label}
          {busy && <Spinner size="sm" className="text-primary-container" />}
        </span>
        <span className="text-on-surface">{`${shown}${unit}`}</span>
      </span>
      <input
        type="range"
        aria-labelledby={labelId}
        aria-busy={busy || undefined}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        value={shown}
        aria-valuetext={`${shown}${unit}`}
        onChange={(event) => setDraft(Number(event.currentTarget.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className={StringUtils.JoinClassName(
          "h-2 w-full cursor-pointer rounded-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container",
          accent[hue],
        )}
      />
    </div>
  );
}
