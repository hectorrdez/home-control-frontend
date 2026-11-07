import { ArrowDown, ArrowUp, EyeOff, Maximize2 } from "lucide-react";
import Button from "@components/controls/Button";
import FilterPill from "@components/controls/FilterPill";
import { KIND_LABEL } from "@/features/telemetry/widgetEditor";
import type { WidgetKind } from "@/features/telemetry/widgets";

// Feature 114: edit controls shown under a chart card while the telemetry grid is in edit mode.
interface ChartEditBarProps {
  label: string;
  kind: WidgetKind;
  kinds: WidgetKind[];
  wide: boolean;
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onKind: (kind: WidgetKind) => void;
  onWide: (wide: boolean) => void;
  onHide: () => void;
}

export default function ChartEditBar({
  label,
  kind,
  kinds,
  wide,
  canUp,
  canDown,
  onMove,
  onKind,
  onWide,
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
      <div role="group" aria-label={`Chart type for ${label}`} className="flex flex-wrap gap-space-xs">
        {kinds.map((k) => (
          <FilterPill key={k} selected={kind === k} onClick={() => onKind(k)}>
            {KIND_LABEL[k]}
          </FilterPill>
        ))}
      </div>
      <FilterPill selected={wide} aria-label={`Wide ${label}`} onClick={() => onWide(!wide)}>
        <Maximize2 size={16} aria-hidden="true" />
        WIDE
      </FilterPill>
      <Button variant="secondary" aria-label={`Hide ${label}`} onClick={onHide}>
        <EyeOff size={16} aria-hidden="true" />
        HIDE
      </Button>
    </div>
  );
}
