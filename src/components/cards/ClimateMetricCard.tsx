import { useMemo, useState, type KeyboardEvent } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Entity } from "@/api/types";
import ClimateTooltip from "./ClimateTooltip";
import HistoryBody from "./HistoryBody";
import { ClimateLegend, ClimateRangePills, ClimateRoomPills, ALL_ROOMS } from "./ClimateCardParts";
import { ZoneDot } from "@/features/zones/ZoneDot";
import { useZoneTokenResolver, zoneStroke } from "@/features/zones/ZoneColorsContext";
import { cssToken } from "@/features/telemetry/chartTokens";
import {
  RANGES,
  clock,
  climateRooms,
  downsample,
  fmt,
  meanAcrossSeries,
  mergeRoomClimate,
  roomLines,
  summarize,
  toPoints,
  type HistoryPoint,
  type RangeLabel,
  type RoomClimateRow,
  type RoomLine,
} from "@/features/telemetry/history";
import { numericState } from "@/features/telemetry/telemetry";
import { useHistory } from "@/features/telemetry/useHistory";

// Feature 158: one card per metric (TEMPERATURE or HUMIDITY). Each card has its own useHistory call, Rooms and Range
// filters, cursor and readout; the old shared CLIMATE HISTORY panel (112/131/144) is split into these two cards.
// Feature 131: temperature ALL ROOMS with 2+ rooms = one zone-colored line per room plus a thicker TOTAL MEAN.
// Feature 144/147: humidity keeps per-room lines plus mean, or one series in the room's zone color.
export type ClimateMetric = "temperature" | "humidity";


// Numeric sensors of one device class in a room (or in every room when room is null).
function sensorsIn(entities: Entity[], room: string | null, deviceClass: ClimateMetric): Entity[] {
  return entities.filter(
    (e) =>
      e.domain === "sensor" &&
      e.attributes.device_class === deviceClass &&
      numericState(e) !== null &&
      (room === null || e.area === room),
  );
}

// What the chart draws: per-room lines (ALL ROOMS, 2+ rooms with this metric) and the main series.
interface CardView {
  lines: RoomLine[];
  points: HistoryPoint[];
  solo: string | null; // the one room whose zone color colors a single series (feature 131/147)
}

interface ClimateMetricCardProps {
  metric: ClimateMetric;
  entities: Entity[];
  areaName: (areaId: string | null) => string;
}

export default function ClimateMetricCard({ metric, entities, areaName }: ClimateMetricCardProps) {
  const isTemp = metric === "temperature";
  const unit = isTemp ? " °C" : " %";
  const digits = isTemp ? 1 : 0;
  const title = isTemp ? "TEMPERATURE" : "HUMIDITY";
  const rooms = useMemo(() => climateRooms(entities, metric), [entities, metric]);
  const [room, setRoom] = useState<string>(ALL_ROOMS);
  const [range, setRange] = useState<RangeLabel>("24H");
  const [cursor, setCursor] = useState<number | null>(null);
  const hours = RANGES.find((r) => r.label === range)?.hours ?? 24;

  const scope = room === ALL_ROOMS ? null : room;
  const ids = useMemo(() => sensorsIn(entities, scope, metric).map((e) => e.entityId), [entities, scope, metric]);
  const { state, retry } = useHistory(ids, hours);
  const roomLabel = room === ALL_ROOMS ? "All rooms" : areaName(room);
  const zoneOf = useZoneTokenResolver();

  const view = useMemo<CardView | null>(() => {
    if (state.status !== "ready") return null;
    const seriesOf = (sensors: Entity[]) =>
      sensors.map((e) => toPoints(state.series.find((s) => s.entityId === e.entityId)));
    // One room: its first series of this metric (feature 112 behavior).
    const firstOf = (id: string) => seriesOf(sensorsIn(entities, id, metric).slice(0, 1))[0] ?? [];
    if (room !== ALL_ROOMS) return { lines: [], points: firstOf(room), solo: room };
    // ALL ROOMS: 2+ rooms = one line per room, and the total mean averages those room lines (rooms weigh equally).
    // Exactly one room: its first series. No room: humidity falls back to the unassigned sensors' mean (144).
    const roomSeries = roomLines(rooms, (id) => seriesOf(sensorsIn(entities, id, metric)));
    const solo = roomSeries.length === 1 ? roomSeries[0].room : null;
    const lines = roomSeries.length >= 2 ? roomSeries : [];
    const points =
      lines.length > 0
        ? meanAcrossSeries(lines.map((l) => l.points))
        : solo
          ? firstOf(solo)
          : isTemp
            ? []
            : meanAcrossSeries(seriesOf(sensorsIn(entities, null, metric)));
    return { lines, points, solo };
  }, [state, room, rooms, entities, metric, isTemp]);

  // Each series is thinned on its own before the merge; TOTAL MEAN is the mean of the thinned room points (feature 131).
  const rows = useMemo<RoomClimateRow[]>(() => {
    if (!view) return [];
    const lines = view.lines.map((l) => ({ room: l.room, points: downsample(l.points) }));
    const main = lines.length > 0 ? meanAcrossSeries(lines.map((l) => l.points)) : downsample(view.points);
    return isTemp ? mergeRoomClimate(lines, main, [], []) : mergeRoomClimate([], [], main, lines);
  }, [view, isTemp]);

  const rowValue = (row: RoomClimateRow, id: string | null): number | null => {
    if (id === null) return isTemp ? row.temp : row.hum;
    return (isTemp ? row.rooms[id] : row.humRooms[id]) ?? null;
  };

  const lines = view?.lines ?? [];
  const multi = lines.length > 0;
  const soloRoom = view?.solo ?? null;
  // Feature 147: the room's assigned zone color (the same one as its pill, its legend dot and the CHARTS panel).
  const roomColor = (id: string) => zoneStroke(zoneOf(id));
  const mainColor = soloRoom
    ? roomColor(soloRoom)
    : isTemp
      ? cssToken("tertiary", "currentColor")
      : cssToken("primary-container", "currentColor");
  const meanColor = cssToken("on-surface", "currentColor");
  const summary = isTemp ? temperatureSummary(rows) : humiditySummary(rows);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0 || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const last = rows.length - 1;
    const step = e.key === "ArrowRight" ? 1 : -1;
    setCursor((c) => Math.min(last, Math.max(0, (c ?? last) + step)));
  };

  // Hovering the chart moves this card's cursor only (feature 158: no shared cursor).
  const onChartMove = (next: { activeTooltipIndex?: unknown }) => {
    setCursor(typeof next.activeTooltipIndex === "number" ? next.activeTooltipIndex : null);
  };
  const clearCursor = () => setCursor(null);

  const active = cursor === null ? undefined : rows[Math.min(cursor, rows.length - 1)];
  // Feature 147: each readout part of a room carries its zone dot; the aria-valuetext string keeps the same text.
  const sep = multi ? " • " : " ";
  const parts: { room: string | null; text: string }[] = active
    ? multi
      ? [
          ...lines.map(({ room: id }) => ({
            room: id,
            text: `${areaName(id).toUpperCase()} ${fmt(rowValue(active, id), digits)}${unit}`,
          })),
          { room: null, text: `MEAN ${fmt(rowValue(active, null), digits)}${unit}` },
        ]
      : [{ room: null, text: `${fmt(rowValue(active, null), digits)}${unit}` }]
    : [];
  const readout = active
    ? `${clock(active.t)} ${parts.map((p) => p.text).join(sep)}`
    : "FOCUS THE CURSOR AND USE ARROW KEYS TO READ VALUES";
  const readoutRoom = !multi ? soloRoom : null;

  // Shared X axis; the humidity chart shows the time labels, the temperature chart does not (as before 144).
  const cursorLine = active && <ReferenceLine x={active.t} stroke={meanColor} />;

  return (
    <div className="flex flex-col gap-space-sm">
      <h3 className="font-label-caps text-label-caps uppercase text-on-surface">{title}</h3>
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <ClimateRoomPills rooms={rooms} room={room} onRoomChange={setRoom} areaName={areaName} />
        <ClimateRangePills range={range} onRangeChange={setRange} />
      </div>

      <HistoryBody state={state} retry={retry} empty={rows.length === 0}>
        <div role="img" aria-label={`${roomLabel} ${metric}, ${range}: ${summary}`}>
          <ResponsiveContainer width="100%" height={isTemp ? 180 : 140}>
            <ComposedChart data={rows} onMouseMove={onChartMove} onMouseLeave={clearCursor}>
              <CartesianGrid stroke={cssToken("outline-variant", "currentColor")} strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="t" tickFormatter={clock} minTickGap={32} tick={!isTemp} />
              <YAxis
                width={56}
                unit={unit}
                domain={
                  isTemp
                    ? ["auto", "auto"]
                    : [(min: number) => Math.max(0, Math.floor(min - 5)), (max: number) => Math.min(100, Math.ceil(max + 5))]
                }
                stroke={isTemp ? cssToken("tertiary", "currentColor") : mainColor}
              />
              <Tooltip
                content={({ active: on, label }) => (
                  <ClimateTooltip
                    row={on ? rows.find((r) => r.t === label) : undefined}
                    metric={isTemp ? "temp" : "hum"}
                    lines={lines}
                    solo={soloRoom}
                    areaName={areaName}
                  />
                )}
              />
              {lines.map(({ room: id }) => (
                <Line
                  key={id}
                  data-testid={isTemp ? "climate-room-line" : "climate-humidity-room-line"}
                  dataKey={(r: RoomClimateRow) => rowValue(r, id)}
                  name={areaName(id)}
                  type="monotone"
                  stroke={roomColor(id)}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
              {isTemp && !multi && (
                <Area
                  data-testid="climate-temp-area"
                  dataKey="temp"
                  name="Temperature"
                  type="monotone"
                  stroke={mainColor}
                  fill={mainColor}
                  fillOpacity={0.15}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {isTemp && multi && (
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
              {!isTemp && (
                <Line
                  data-testid="climate-humidity-line"
                  dataKey="hum"
                  name={multi ? "Total mean humidity" : "Humidity"}
                  type="monotone"
                  stroke={multi ? meanColor : mainColor}
                  strokeWidth={multi ? 3 : 1}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {cursorLine}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {multi && <ClimateLegend rooms={lines.map((l) => l.room)} areaName={areaName} />}
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Chart cursor, ${metric}: left and right arrow keys move through the history`}
          aria-valuemin={0}
          aria-valuemax={Math.max(rows.length - 1, 0)}
          aria-valuenow={active ? Math.min(cursor ?? 0, rows.length - 1) : 0}
          aria-valuetext={readout}
          onKeyDown={onKeyDown}
          onBlur={clearCursor}
          className="rounded focus-visible:outline-2 focus-visible:outline-primary-container"
        >
          <p className="font-mono text-label-caps uppercase text-on-surface">
            {active ? (
              <>
                {clock(active.t)}
                {readoutRoom && (
                  <>
                    {" "}
                    <ZoneDot areaId={readoutRoom} className="mx-space-xs align-middle" />
                    {`${areaName(readoutRoom).toUpperCase()} `}
                  </>
                )}
                {parts.map((part, i) => (
                  <span key={i}>
                    {i > 0 && sep}
                    {part.room && <ZoneDot areaId={part.room} className="mx-space-xs align-middle" />}
                    {part.text}
                  </span>
                ))}
              </>
            ) : (
              readout
            )}
          </p>
        </div>
        <p className="font-mono text-label-caps uppercase text-on-surface-variant">{summary}</p>
        <table className="sr-only">
          <caption>{`${roomLabel} ${metric} history, ${range}`}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              {multi ? (
                <>
                  {lines.map(({ room: id }) => (
                    <th key={id} scope="col">{isTemp ? `${areaName(id)} °C` : `${areaName(id)} humidity %`}</th>
                  ))}
                  <th scope="col">{isTemp ? "Total mean °C" : "Total mean humidity %"}</th>
                </>
              ) : (
                <th scope="col">{isTemp ? "Temperature °C" : "Humidity %"}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t}>
                <td>{clock(r.t)}</td>
                {multi &&
                  lines.map(({ room: id }) => <td key={id}>{fmt(rowValue(r, id), digits)}</td>)}
                <td>{fmt(rowValue(r, null), digits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HistoryBody>
    </div>
  );
}

// PEAK, TEMP VARIANCE of the card's temperature rows (feature 112 summary, without the humidity part).
function temperatureSummary(rows: RoomClimateRow[]): string {
  const temps: HistoryPoint[] = rows.flatMap((r) => (r.temp === null ? [] : [{ t: r.t, v: r.temp }]));
  const s = summarize(temps);
  const peak = s.peak ? `${clock(s.peak.t)} ${fmt(s.peak.v)} °C` : "--";
  return `PEAK ${peak} • TEMP VARIANCE ${fmt(s.variance)} °C`;
}

// HUMIDITY MEAN of the card's humidity rows.
function humiditySummary(rows: RoomClimateRow[]): string {
  const values = rows.flatMap((r) => (r.hum === null ? [] : [r.hum]));
  const mean = values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
  return `HUMIDITY MEAN ${fmt(mean)} %`;
}
