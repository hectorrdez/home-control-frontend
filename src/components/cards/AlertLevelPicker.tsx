import FilterPill from "@components/controls/FilterPill";
import type { AlertLevel } from "@/api/types";
import { LEVEL_LABEL, LEVELS } from "@/features/alerts/rules";

// Feature 128: the four levels as single-select pills. The selected one takes its semantic hue; the label always shows.
const SELECTED_HUE: Record<AlertLevel, string> = {
  off: "!border-outline !bg-surface-container-highest !text-on-surface",
  low: "!border-secondary !bg-secondary !text-on-secondary",
  medium: "!border-tertiary-fixed-dim !bg-tertiary-fixed-dim !text-on-tertiary-fixed",
  high: "!border-error !bg-error-container !text-on-error-container",
};

interface AlertLevelPickerProps {
  label: string;
  value: AlertLevel;
  disabled?: boolean;
  onChange: (level: AlertLevel) => void;
}

export default function AlertLevelPicker({ label, value, disabled = false, onChange }: AlertLevelPickerProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-space-xs">
      {LEVELS.map((level) => (
        <FilterPill
          key={level}
          selected={value === level}
          disabled={disabled}
          className={value === level ? SELECTED_HUE[level] : undefined}
          onClick={() => onChange(level)}
        >
          {LEVEL_LABEL[level]}
        </FilterPill>
      ))}
    </div>
  );
}
