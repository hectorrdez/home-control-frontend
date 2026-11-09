import FilterPill from "@components/controls/FilterPill";
import { ZoneDot } from "@/features/zones/ZoneDot";
import { RANGES, type RangeLabel } from "@/features/telemetry/history";

// Feature 158: controls shared by the TEMPERATURE and HUMIDITY cards. Each card owns its own room and range state.
export const ALL_ROOMS = "all";

interface RoomPillsProps {
  rooms: string[]; // rooms that have this card's metric (feature 158)
  room: string;
  onRoomChange: (room: string) => void;
  areaName: (areaId: string | null) => string;
}

export function ClimateRoomPills({ rooms, room, onRoomChange, areaName }: RoomPillsProps) {
  return (
    <div role="group" aria-label="Rooms" className="flex flex-wrap gap-space-xs">
      <FilterPill selected={room === ALL_ROOMS} onClick={() => onRoomChange(ALL_ROOMS)}>
        ALL ROOMS
      </FilterPill>
      {rooms.map((id) => (
        <FilterPill key={id} selected={room === id} onClick={() => onRoomChange(id)}>
          <ZoneDot areaId={id} />
          {areaName(id)}
        </FilterPill>
      ))}
    </div>
  );
}

interface RangePillsProps {
  range: RangeLabel;
  onRangeChange: (range: RangeLabel) => void;
}

export function ClimateRangePills({ range, onRangeChange }: RangePillsProps) {
  return (
    <div role="group" aria-label="Range" className="flex flex-wrap gap-space-xs">
      {RANGES.map((r) => (
        <FilterPill key={r.label} selected={range === r.label} onClick={() => onRangeChange(r.label)}>
          {r.label}
        </FilterPill>
      ))}
    </div>
  );
}

// Zone dots of the plotted rooms plus TOTAL MEAN (feature 147). Shown only when the card plots several rooms.
export function ClimateLegend({ rooms, areaName }: { rooms: string[]; areaName: (areaId: string | null) => string }) {
  return (
    <ul aria-label="Chart legend" className="flex flex-wrap gap-space-md">
      {rooms.map((id) => (
        <li key={id} className="flex items-center gap-space-xs font-mono text-label-caps uppercase text-on-surface-variant">
          <ZoneDot areaId={id} />
          {areaName(id)}
        </li>
      ))}
      <li className="flex items-center gap-space-xs font-mono text-label-caps uppercase text-on-surface">
        <span aria-hidden="true" className="inline-block h-0.5 w-4 bg-on-surface" />
        TOTAL MEAN
      </li>
    </ul>
  );
}
