import StringUtils from "@utils/StringUtils";

// Feature 104: -/+ stepper with a mono value (climate setpoint). Buttons are 44px touch targets.
type StepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export default function Stepper({ label, value, min, max, step, unit, onChange }: StepperProps) {
  const down = round1(Math.max(min, value - step));
  const up = round1(Math.min(max, value + step));
  const button = StringUtils.JoinClassName(
    "flex h-11 w-11 items-center justify-center rounded border border-outline-variant bg-surface-container-high font-mono text-title-md text-on-surface hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container",
  );

  return (
    <div role="group" aria-label={label} className="flex items-center justify-between gap-space-sm">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        className={button}
        disabled={value <= min}
        onClick={() => onChange(down)}
      >
        -
      </button>
      <span aria-live="polite" className="font-mono text-telemetry-lg text-on-surface">
        {`${round1(value).toFixed(1)}${unit}`}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        className={button}
        disabled={value >= max}
        onClick={() => onChange(up)}
      >
        +
      </button>
    </div>
  );
}
