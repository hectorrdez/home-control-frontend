import { clock, fmt, type RoomClimateRow, type RoomLine } from "@/features/telemetry/history";
import { ZoneDot } from "@/features/zones/ZoneDot";

interface ClimateTooltipProps {
  row: RoomClimateRow | undefined;
  metric: "temp" | "hum"; // feature 144: each chart shows only its own metric
  lines: RoomLine[]; // empty = single-room / non-ALL view
  solo?: string | null; // feature 147: the one room of a single-room view, named with its zone dot
  areaName: (areaId: string | null) => string;
}

// Chart tooltip: every plotted room plus TOTAL MEAN, "--" where a room has no point at that timestamp.
export default function ClimateTooltip({ row, metric, lines, solo = null, areaName }: ClimateTooltipProps) {
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
            <p key={room}>
              <ZoneDot areaId={room} className="mr-space-xs align-middle" />
              {`${areaName(room)} ${fmt(roomValue(room), digits)}${unit}`}
            </p>
          ))}
          <p>{`TOTAL MEAN ${fmt(isTemp ? row.temp : row.hum, digits)}${unit}`}</p>
        </>
      ) : solo ? (
        <p>
          <ZoneDot areaId={solo} className="mr-space-xs align-middle" />
          {`${areaName(solo)} ${fmt(isTemp ? row.temp : row.hum, digits)}${unit}`}
        </p>
      ) : (
        <p>{`${isTemp ? "Temperature" : "Humidity"} ${fmt(isTemp ? row.temp : row.hum, digits)}${unit}`}</p>
      )}
    </div>
  );
}
