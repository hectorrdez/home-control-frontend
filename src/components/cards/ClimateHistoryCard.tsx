import { useMemo, useState, type KeyboardEvent } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Entity } from "@/api/types";
import FilterPill from "@components/controls/FilterPill";
import ClimateTooltip from "./ClimateTooltip";
import HistoryBody from "./HistoryBody";
import { ZoneDot } from "@/features/zones/ZoneDot";
import { zoneColorToken } from "@/features/zones/zoneColors";
import { cssToken } from "@/features/telemetry/chartTokens";
import {
  RANGES,
  clock,
  climateRooms,
  climateSummary,
  downsample,
  fmt,
  meanAcrossSeries,
  mergeRoomClimate,
  toPoints,
  type HistoryPoint,
  type RangeLabel,
  type RoomClimateRow,
  type RoomLine,
} from "@/features/telemetry/history";
import { numericState } from "@/features/telemetry/telemetry";
import { useHistory } from "@/features/telemetry/useHistory";

// Feature 112: temperature (left axis, area) and humidity (right axis, line) for one room or the ALL ROOMS mean.
// Feature 131: ALL ROOMS with 2+ rooms = one zone-colored line per room, a thicker TOTAL MEAN line and the humidity mean.
const ALL = "all";

// Numeric sensors of one device class in a room (or in every room when room is null).
function sensorsIn(entities: Entity[], room: string | null, deviceClass: string): Entity[] {
  return entities.filter(
    (e) =>
      e.domain === "sensor" &&
      e.attributes.device_class === deviceClass &&
      numericState(e) !== null &&
      (room === null || e.area === room),
  );
}

// What the chart draws: per-room lines (ALL ROOMS only), the temperature mean or the single room, and the humidity mean.
interface ClimateView {
  lines: RoomLine[];
  temp: HistoryPoint[];
  hum: HistoryPoint[];
  solo: string | null; // the room whose zone color colors a single temperature area
}

interface ClimateHistoryCardProps {
  entities: Entity[];
  areaName: (areaId: string | null) => string;
}

export default function ClimateHistoryCard({ entities, areaName }: ClimateHistoryCardProps) {
  const rooms = useMemo(() => climateRooms(entities), [entities]);
  const [room, setRoom] = useState<string>(ALL);
  const [range, setRange] = useState<RangeLabel>("24H");
  const [cursor, setCursor] = useState<number | null>(null);
  const hours = RANGES.find((r) => r.label === range)?.hours ?? 24;

  const scope = room === ALL ? null : room;
  const ids = useMemo(
    () => [...sensorsIn(entities, scope, "temperature"), ...sensorsIn(entities, scope, "humidity")].map((e) => e.entityId),
    [entities, scope],
  );
  const { state, retry } = useHistory(ids, hours);
  const roomLabel = room === ALL ? "All rooms" : areaName(room);

  const view = useMemo<ClimateView | null>(() => {
    if (state.status !== "ready") return null;
    const seriesOf = (sensors: Entity[]) =>
      sensors.map((e) => toPoints(state.series.find((s) => s.entityId === e.entityId)));
    // One room: the first temperature and first humidity series (feature 112 behavior).
    const firstOf = (id: string, deviceClass: string) => seriesOf(sensorsIn(entities, id, deviceClass).slice(0, 1))[0] ?? [];
    if (room !== ALL) return { lines: [], temp: firstOf(room, "temperature"), hum: firstOf(room, "humidity"), solo: room };
    // ALL ROOMS: each room is its own mean; the total mean averages the plotted room lines, so rooms weigh equally.
    const lines = rooms.flatMap((id): RoomLine[] => {
      const points = meanAcrossSeries(seriesOf(sensorsIn(entities, id, "temperature")));
      return points.length > 0 ? [{ room: id, points }] : [];
    });
    // Humidity keeps feature 112: the mean of every humidity sensor series (unassigned ones included).
    const hum = meanAcrossSeries(seriesOf(sensorsIn(entities, null, "humidity")));
    // Exactly one room with temperature data: same series and color as selecting that room.
    const only = lines.length === 1 ? lines[0].room : null;
    if (only) return { lines: [], temp: firstOf(only, "temperature"), hum: firstOf(only, "humidity"), solo: only };
    // No room temperature at all: humidity still shows.
    if (lines.length === 0) return { lines: [], temp: [], hum, solo: null };
    return { lines, temp: meanAcrossSeries(lines.map((l) => l.points)), hum, solo: null };
  }, [state, room, rooms, entities]);

  const rows = useMemo<RoomClimateRow[]>(
    // Each series is thinned on its own before the merge, so a sparse room never loses all its points to a dense one.
    // With room lines, TOTAL MEAN is the mean of the thinned room points, so it always matches the room values shown beside it.
    () => {
      if (!view) return [];
      const lines = view.lines.map((l) => ({ room: l.room, points: downsample(l.points) }));
      const temp = lines.length > 0 ? meanAcrossSeries(lines.map((l) => l.points)) : downsample(view.temp);
      return mergeRoomClimate(lines, temp, downsample(view.hum));
    },
    [view],
  );

  const lines = view?.lines ?? [];
  const multi = lines.length > 0;
  const roomColor = (id: string) => cssToken(zoneColorToken(id), "currentColor");
  const tempColor = view?.solo ? roomColor(view.solo) : cssToken("tertiary", "currentColor");
  const meanColor = cssToken("on-surface", "currentColor");

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0 || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const last = rows.length - 1;
    const step = e.key === "ArrowRight" ? 1 : -1;
    setCursor((c) => Math.min(last, Math.max(0, (c ?? last) + step)));
  };

  const active = cursor === null ? undefined : rows[Math.min(cursor, rows.length - 1)];
  const readout = active
    ? multi
      ? `${clock(active.t)} ${lines.map(({ room: id }) => `${areaName(id).toUpperCase()} ${fmt(active.rooms[id] ?? null)} °C • `).join("")}MEAN ${fmt(active.temp)} °C ${fmt(active.hum, 0)} %`
      : `${clock(active.t)} ${fmt(active.temp)} °C ${fmt(active.hum, 0)} %`
    : "FOCUS THE CURSOR AND USE ARROW KEYS TO READ VALUES";

  return (
    <div className="flex flex-col gap-space-sm">
      <h3 className="font-label-caps text-label-caps uppercase text-on-surface">CLIMATE HISTORY</h3>
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div role="group" aria-label="Rooms" className="flex flex-wrap gap-space-xs">
          <FilterPill selected={room === ALL} onClick={() => setRoom(ALL)}>
            ALL ROOMS
          </FilterPill>
          {rooms.map((id) => (
            <FilterPill key={id} selected={room === id} onClick={() => setRoom(id)}>
              <ZoneDot areaId={id} />
              {areaName(id)}
            </FilterPill>
          ))}
        </div>
        <div role="group" aria-label="Range" className="flex flex-wrap gap-space-xs">
          {RANGES.map((r) => (
            <FilterPill key={r.label} selected={range === r.label} onClick={() => setRange(r.label)}>
              {r.label}
            </FilterPill>
          ))}
        </div>
      </div>

      <HistoryBody state={state} retry={retry} empty={rows.length === 0}>
        <div role="img" aria-label={`${roomLabel} climate, ${range}: ${climateSummary(rows)}`}>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={rows}>
              <CartesianGrid stroke={cssToken("outline-variant", "currentColor")} strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="t" tickFormatter={clock} minTickGap={32} />
              <YAxis yAxisId="temp" unit=" °C" domain={["auto", "auto"]} stroke={cssToken("tertiary", "currentColor")} />
              <YAxis yAxisId="hum" orientation="right" unit=" %" domain={[0, 100]} stroke={cssToken("primary-container", "currentColor")} />
              <Tooltip
                content={({ active: on, label }) => (
                  <ClimateTooltip row={on ? rows.find((r) => r.t === label) : undefined} lines={lines} areaName={areaName} />
                )}
              />
              {multi ? (
                lines.map(({ room: id }) => (
                  <Line
                    key={id}
                    data-testid="climate-room-line"
                    yAxisId="temp"
                    dataKey={(r: RoomClimateRow) => r.rooms[id] ?? null}
                    name={areaName(id)}
                    type="monotone"
                    stroke={roomColor(id)}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))
              ) : (
                <Area
                  data-testid="climate-temp-area"
                  yAxisId="temp"
                  dataKey="temp"
                  name="Temperature"
                  type="monotone"
                  stroke={tempColor}
                  fill={tempColor}
                  fillOpacity={0.15}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              <Line
                data-testid="climate-humidity-line"
                yAxisId="hum"
                dataKey="hum"
                name="Humidity"
                type="monotone"
                stroke={cssToken("primary-container", "currentColor")}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              {multi && (
                <Line
                  data-testid="climate-mean-line"
                  yAxisId="temp"
                  dataKey="temp"
                  name="Total mean"
                  type="monotone"
                  stroke={meanColor}
                  strokeWidth={3}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {active && <ReferenceLine x={active.t} stroke={meanColor} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {multi && (
          <ul aria-label="Chart legend" className="flex flex-wrap gap-space-md">
            {lines.map(({ room: id }) => (
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
        )}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Chart cursor: left and right arrow keys move through the history"
          aria-valuemin={0}
          aria-valuemax={Math.max(rows.length - 1, 0)}
          aria-valuenow={active ? Math.min(cursor ?? 0, rows.length - 1) : 0}
          aria-valuetext={readout}
          onKeyDown={onKeyDown}
          onBlur={() => setCursor(null)}
          className="rounded focus-visible:outline-2 focus-visible:outline-primary-container"
        >
          <p className="font-mono text-label-caps uppercase text-on-surface">{readout}</p>
        </div>
        <p className="font-mono text-label-caps uppercase text-on-surface-variant">{climateSummary(rows)}</p>
        <table className="sr-only">
          <caption>{`${roomLabel} history, ${range}`}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              {multi ? (
                <>
                  {lines.map(({ room: id }) => (
                    <th key={id} scope="col">{`${areaName(id)} °C`}</th>
                  ))}
                  <th scope="col">Total mean °C</th>
                </>
              ) : (
                <th scope="col">Temperature °C</th>
              )}
              <th scope="col">Humidity %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t}>
                <td>{clock(r.t)}</td>
                {multi ? (
                  <>
                    {lines.map(({ room: id }) => (
                      <td key={id}>{fmt(r.rooms[id] ?? null)}</td>
                    ))}
                    <td>{fmt(r.temp)}</td>
                  </>
                ) : (
                  <td>{fmt(r.temp)}</td>
                )}
                <td>{fmt(r.hum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HistoryBody>
    </div>
  );
}
