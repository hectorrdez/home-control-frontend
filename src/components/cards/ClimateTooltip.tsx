import { clock, fmt, type RoomClimateRow, type RoomLine } from "@/features/telemetry/history";

interface ClimateTooltipProps {
  row: RoomClimateRow | undefined;
  metric: "temp" | "hum"; // feature 144: each chart shows only its own metric
  lines: RoomLine[]; // empty = single-room / non-ALL view
  areaName: (areaId: string | null) => string;
}

// Chart tooltip: every plotted room plus TOTAL MEAN, "--" where a room has no point at that timestamp.
export default function ClimateTooltip({ row, metric, lines, areaName }: ClimateTooltipProps) {
  if (!row) return null;
  const isTemp = metric === "temp";
  const roomValue = (room: string) => (isTemp ? row.rooms[room] : row.humRooms[room]) ?? null;
  const digits = isTemp ? 1 : 0;
  const unit = isTemp ? " °C" : " %";
  return (
    <div role="status" className="rounded bg-surface-container p-space-sm font-mono text-label-caps uppercase text-on-surface">
      <p>{clock(row.t)}</p>
      {lines.length > 0 ? (
        <>
          {lines.map(({ room }) => (
            <p key={room}>{`${areaName(room)} ${fmt(roomValue(room), digits)}${unit}`}</p>
          ))}
          <p>{`TOTAL MEAN ${fmt(isTemp ? row.temp : row.hum, digits)}${unit}`}</p>
        </>
      ) : (
        <p>{`${isTemp ? "Temperature" : "Humidity"} ${fmt(isTemp ? row.temp : row.hum, digits)}${unit}`}</p>
      )}
    </div>
  );
}
