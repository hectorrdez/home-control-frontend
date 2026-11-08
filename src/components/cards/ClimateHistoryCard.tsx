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
  roomLines,
  toPoints,
  type HistoryPoint,
  type RangeLabel,
  type RoomClimateRow,
  type RoomLine,
} from "@/features/telemetry/history";
import { numericState } from "@/features/telemetry/telemetry";
import { useHistory } from "@/features/telemetry/useHistory";

// Feature 112: temperature (area) and humidity (line) for one room or the ALL ROOMS mean.
// Feature 131: ALL ROOMS with 2+ rooms = one zone-colored line per room, a thicker TOTAL MEAN line and the humidity mean.
// Feature 144: temperature and humidity are two stacked charts sharing the time axis and one cursor.
// Assumption (card marked): "separate" = one metric per chart, not one chart per room.
const ALL = "all";
const HUM_PAD = 5; // humidity axis: data range padded by 5 %, clamped to 0..100

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

// What the charts draw: per-room lines (ALL ROOMS, 2+ rooms with that metric), the temperature and humidity series.
interface ClimateView {
  lines: RoomLine[]; // temperature per room; empty = one temperature series
  humLines: RoomLine[]; // humidity per room (feature 144); empty = one humidity series
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
  const humRoomIds = useMemo(() => climateRooms(entities, "humidity"), [entities]);
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
    if (room !== ALL) {
      return { lines: [], humLines: [], temp: firstOf(room, "temperature"), hum: firstOf(room, "humidity"), solo: room };
    }
    // ALL ROOMS: each chart decides its lines from its own metric's data (feature 144 review).
    // 2+ rooms with that metric: one line per room, and the total mean averages those room lines (rooms weigh equally).
    // Exactly one room: its first series, same as selecting that room. No room: humidity = unassigned sensors' mean.
    const tempRooms = roomLines(rooms, (id) => seriesOf(sensorsIn(entities, id, "temperature")));
    const humRooms = roomLines(humRoomIds, (id) => seriesOf(sensorsIn(entities, id, "humidity")));
    const solo = tempRooms.length === 1 ? tempRooms[0].room : null;
    const lines = tempRooms.length >= 2 ? tempRooms : [];
    const humLines = humRooms.length >= 2 ? humRooms : [];
    const temp = lines.length > 0 ? meanAcrossSeries(lines.map((l) => l.points)) : solo ? firstOf(solo, "temperature") : [];
    const hum =
      humLines.length > 0
        ? meanAcrossSeries(humLines.map((l) => l.points))
        : humRooms.length === 1
          ? firstOf(humRooms[0].room, "humidity")
          : meanAcrossSeries(seriesOf(sensorsIn(entities, null, "humidity")));
    return { lines, humLines, temp, hum, solo };
  }, [state, room, rooms, humRoomIds, entities]);

  const rows = useMemo<RoomClimateRow[]>(
    // Each series is thinned on its own before the merge, so a sparse room never loses all its points to a dense one.
    // With room lines, TOTAL MEAN is the mean of the thinned room points, so it always matches the room values shown beside it.
    () => {
      if (!view) return [];
      const lines = view.lines.map((l) => ({ room: l.room, points: downsample(l.points) }));
      const humLines = view.humLines.map((l) => ({ room: l.room, points: downsample(l.points) }));
      const temp = lines.length > 0 ? meanAcrossSeries(lines.map((l) => l.points)) : downsample(view.temp);
      const hum = humLines.length > 0 ? meanAcrossSeries(humLines.map((l) => l.points)) : downsample(view.hum);
      return mergeRoomClimate(lines, temp, hum, humLines);
    },
    [view],
  );

  const lines = view?.lines ?? [];
  const humLines = view?.humLines ?? [];
  const multiTemp = lines.length > 0;
  const multiHum = humLines.length > 0;
  const multi = multiTemp || multiHum;
  const legendRooms = [...new Set([...lines, ...humLines].map((l) => l.room))];
  const roomColor = (id: string) => cssToken(zoneColorToken(id), "currentColor");
  const tempColor = view?.solo ? roomColor(view.solo) : cssToken("tertiary", "currentColor");
  const humColor = cssToken("primary-container", "currentColor");
  const meanColor = cssToken("on-surface", "currentColor");
  const summary = climateSummary(rows);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0 || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const last = rows.length - 1;
    const step = e.key === "ArrowRight" ? 1 : -1;
    setCursor((c) => Math.min(last, Math.max(0, (c ?? last) + step)));
  };

  // Hovering either chart moves the shared cursor (feature 144).
  const onChartMove = (next: { activeTooltipIndex?: unknown }) => {
    setCursor(typeof next.activeTooltipIndex === "number" ? next.activeTooltipIndex : null);
  };
  const clearCursor = () => setCursor(null);

  const active = cursor === null ? undefined : rows[Math.min(cursor, rows.length - 1)];
  // Each metric reads its room lines when it has them, otherwise its single series (no room lines in one chart is not the other's problem).
  const readout = active
    ? `${clock(active.t)} ${[
        ...(multiTemp
          ? [...lines.map(({ room: id }) => `${areaName(id).toUpperCase()} ${fmt(active.rooms[id] ?? null)} °C`), `MEAN ${fmt(active.temp)} °C`]
          : [`${fmt(active.temp)} °C`]),
        ...(multiHum
          ? [...humLines.map(({ room: id }) => `${areaName(id).toUpperCase()} ${fmt(active.humRooms[id] ?? null, 0)} %`), `MEAN ${fmt(active.hum, 0)} %`]
          : [`${fmt(active.hum, 0)} %`]),
      ].join(multi ? " • " : " ")}`
    : "FOCUS THE CURSOR AND USE ARROW KEYS TO READ VALUES";

  // Shared by both charts: same X axis, same Y-axis width so the plot areas line up.
  const xAxis = (labels: boolean) => (
    <XAxis dataKey="t" tickFormatter={clock} minTickGap={32} tick={labels} />
  );
  const cursorLine = active && <ReferenceLine x={active.t} stroke={meanColor} />;

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
        <div className="flex flex-col gap-space-xs">
          <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">TEMPERATURE</p>
          <div role="img" aria-label={`${roomLabel} temperature, ${range}: ${summary}`}>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={rows} onMouseMove={onChartMove} onMouseLeave={clearCursor}>
                <CartesianGrid stroke={cssToken("outline-variant", "currentColor")} strokeOpacity={0.3} vertical={false} />
                {xAxis(false)}
                <YAxis width={56} unit=" °C" domain={["auto", "auto"]} stroke={cssToken("tertiary", "currentColor")} />
                <Tooltip
                  content={({ active: on, label }) => (
                    <ClimateTooltip
                      row={on ? rows.find((r) => r.t === label) : undefined}
                      metric="temp"
                      lines={lines}
                      areaName={areaName}
                    />
                  )}
                />
                {multiTemp ? (
                  lines.map(({ room: id }) => (
                    <Line
                      key={id}
                      data-testid="climate-room-line"
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
                {multiTemp && (
                  <Line
                    data-testid="climate-mean-line"
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
                {cursorLine}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">HUMIDITY</p>
          <div role="img" aria-label={`${roomLabel} humidity, ${range}: ${summary}`}>
            <ResponsiveContainer width="100%" height={140}>
              <ComposedChart data={rows} onMouseMove={onChartMove} onMouseLeave={clearCursor}>
                <CartesianGrid stroke={cssToken("outline-variant", "currentColor")} strokeOpacity={0.3} vertical={false} />
                {xAxis(true)}
                <YAxis
                  width={56}
                  unit=" %"
                  domain={[(min: number) => Math.max(0, Math.floor(min - HUM_PAD)), (max: number) => Math.min(100, Math.ceil(max + HUM_PAD))]}
                  stroke={humColor}
                />
                <Tooltip
                  content={({ active: on, label }) => (
                    <ClimateTooltip
                      row={on ? rows.find((r) => r.t === label) : undefined}
                      metric="hum"
                      lines={humLines}
                      areaName={areaName}
                    />
                  )}
                />
                {multiHum
                  ? humLines.map(({ room: id }) => (
                      <Line
                        key={id}
                        data-testid="climate-humidity-room-line"
                        dataKey={(r: RoomClimateRow) => r.humRooms[id] ?? null}
                        name={areaName(id)}
                        type="monotone"
                        stroke={roomColor(id)}
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                      />
                    ))
                  : null}
                <Line
                  data-testid="climate-humidity-line"
                  dataKey="hum"
                  name={multiHum ? "Total mean humidity" : "Humidity"}
                  type="monotone"
                  stroke={multiHum ? meanColor : humColor}
                  strokeWidth={multiHum ? 3 : 1}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                {cursorLine}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        {multi && (
          <ul aria-label="Chart legend" className="flex flex-wrap gap-space-md">
            {legendRooms.map((id) => (
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
          onBlur={clearCursor}
          className="rounded focus-visible:outline-2 focus-visible:outline-primary-container"
        >
          <p className="font-mono text-label-caps uppercase text-on-surface">{readout}</p>
        </div>
        <p className="font-mono text-label-caps uppercase text-on-surface-variant">{summary}</p>
        <table className="sr-only">
          <caption>{`${roomLabel} history, ${range}`}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              {multiTemp ? (
                <>
                  {lines.map(({ room: id }) => (
                    <th key={id} scope="col">{`${areaName(id)} °C`}</th>
                  ))}
                  <th scope="col">Total mean °C</th>
                </>
              ) : (
                <th scope="col">Temperature °C</th>
              )}
              {multiHum ? (
                <>
                  {humLines.map(({ room: id }) => (
                    <th key={`h-${id}`} scope="col">{`${areaName(id)} humidity %`}</th>
                  ))}
                  <th scope="col">Total mean humidity %</th>
                </>
              ) : (
                <th scope="col">Humidity %</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t}>
                <td>{clock(r.t)}</td>
                {multiTemp ? (
                  <>
                    {lines.map(({ room: id }) => (
                      <td key={id}>{fmt(r.rooms[id] ?? null)}</td>
                    ))}
                    <td>{fmt(r.temp)}</td>
                  </>
                ) : (
                  <td>{fmt(r.temp)}</td>
                )}
                {multiHum ? (
                  <>
                    {humLines.map(({ room: id }) => (
                      <td key={`h-${id}`}>{fmt(r.humRooms[id] ?? null)}</td>
                    ))}
                    <td>{fmt(r.hum)}</td>
                  </>
                ) : (
                  <td>{fmt(r.hum)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </HistoryBody>
    </div>
  );
}
