import { clock, fmt, type RoomClimateRow, type RoomLine } from "@/features/telemetry/history";

interface ClimateTooltipProps {
  row: RoomClimateRow | undefined;
  lines: RoomLine[]; // empty = single-room / non-ALL view
  areaName: (areaId: string | null) => string;
}

// Chart tooltip: every plotted room plus TOTAL MEAN, "--" where a room has no point at that timestamp.
export default function ClimateTooltip({ row, lines, areaName }: ClimateTooltipProps) {
  if (!row) return null;
  return (
    <div role="status" className="rounded bg-surface-container p-space-sm font-mono text-label-caps uppercase text-on-surface">
      <p>{clock(row.t)}</p>
      {lines.length > 0 ? (
        <>
          {lines.map(({ room }) => (
            <p key={room}>{`${areaName(room)} ${fmt(row.rooms[room] ?? null)} °C`}</p>
          ))}
          <p>{`TOTAL MEAN ${fmt(row.temp)} °C`}</p>
        </>
      ) : (
        <p>{`Temperature ${fmt(row.temp)} °C`}</p>
      )}
      <p>{`Humidity ${fmt(row.hum, 0)} %`}</p>
    </div>
  );
}
