import { ArrowDown, ArrowUp, EyeOff } from "lucide-react";
import Button from "@components/controls/Button";
import FilterPill from "@components/controls/FilterPill";
import { KIND_LABEL, SIZE_LABEL, SIZES } from "@/features/telemetry/widgetEditor";
import type { WidgetKind, WidgetSize } from "@/features/telemetry/widgets";

// Feature 114: edit controls shown under a chart card while the telemetry grid is in edit mode.
// Feature 146: the WIDE toggle is replaced by a FULL / HALF / THIRD width selector.
interface ChartEditBarProps {
  label: string;
  // Feature 159: climate cards have no chart type, so kind/kinds/onKind are optional and the type group is omitted.
  kind?: WidgetKind;
  kinds?: WidgetKind[];
  size: WidgetSize;
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onKind?: (kind: WidgetKind) => void;
  onSize: (size: WidgetSize) => void;
  onHide: () => void;
}

export default function ChartEditBar({
  label,
  kind,
  kinds,
  size,
  canUp,
  canDown,
  onMove,
  onKind,
  onSize,
  onHide,
}: ChartEditBarProps) {
  return (
    <div role="group" aria-label={`Edit ${label}`} className="mt-space-xs flex flex-wrap items-center gap-space-xs">
      <Button variant="secondary" data-move="up" aria-label={`Move ${label} up`} disabled={!canUp} onClick={() => onMove(-1)}>
        <ArrowUp size={16} aria-hidden="true" />
      </Button>
      <Button variant="secondary" data-move="down" aria-label={`Move ${label} down`} disabled={!canDown} onClick={() => onMove(1)}>
        <ArrowDown size={16} aria-hidden="true" />
      </Button>
      {kinds && kinds.length > 0 && onKind && (
        <div role="group" aria-label={`Chart type for ${label}`} className="flex flex-wrap gap-space-xs">
          {kinds.map((k) => (
            <FilterPill key={k} selected={kind === k} onClick={() => onKind(k)}>
              {KIND_LABEL[k]}
            </FilterPill>
          ))}
        </div>
      )}
      <div role="group" aria-label={`Width for ${label}`} className="flex flex-wrap gap-space-xs">
        {SIZES.map((s) => (
          <FilterPill key={s} selected={size === s} onClick={() => onSize(s)}>
            {SIZE_LABEL[s]}
          </FilterPill>
        ))}
      </div>
      <Button variant="secondary" aria-label={`Hide ${label}`} onClick={onHide}>
        <EyeOff size={16} aria-hidden="true" />
        HIDE
      </Button>
    </div>
  );
}
