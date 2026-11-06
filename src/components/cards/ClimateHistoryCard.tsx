import { useMemo, useState, type KeyboardEvent } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Entity } from "@/api/types";
import FilterPill from "@components/controls/FilterPill";
import HistoryBody from "./HistoryBody";
import { cssToken } from "@/features/telemetry/chartTokens";
import {
  RANGES,
  clock,
  climateRooms,
  climateSummary,
  downsample,
  fmt,
  meanAcrossSeries,
  mergeClimate,
  toPoints,
  type ClimateRow,
  type RangeLabel,
} from "@/features/telemetry/history";
import { numericState } from "@/features/telemetry/telemetry";
import { useHistory } from "@/features/telemetry/useHistory";

// Feature 112: temperature (left axis, area) and humidity (right axis, line) for one room or the ALL ROOMS mean.
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
  const temps = useMemo(() => sensorsIn(entities, scope, "temperature"), [entities, scope]);
  const hums = useMemo(() => sensorsIn(entities, scope, "humidity"), [entities, scope]);
  const ids = useMemo(() => [...temps, ...hums].map((e) => e.entityId), [temps, hums]);
  const { state, retry } = useHistory(ids, hours);
  const roomLabel = room === ALL ? "All rooms" : areaName(room);

  // ALL ROOMS = mean of every room's series per timestamp; a single room = its one temperature and humidity series.
  const rows = useMemo<ClimateRow[]>(() => {
    if (state.status !== "ready") return [];
    const seriesOf = (sensors: Entity[]) =>
      sensors.map((e) => toPoints(state.series.find((s) => s.entityId === e.entityId)));
    const tempSeries = seriesOf(temps);
    const humSeries = seriesOf(hums);
    const temp = room === ALL ? meanAcrossSeries(tempSeries) : (tempSeries[0] ?? []);
    const hum = room === ALL ? meanAcrossSeries(humSeries) : (humSeries[0] ?? []);
    return mergeClimate(downsample(temp), downsample(hum));
  }, [state, temps, hums, room]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0 || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const last = rows.length - 1;
    const step = e.key === "ArrowRight" ? 1 : -1;
    setCursor((c) => Math.min(last, Math.max(0, (c ?? last) + step)));
  };

  const active = cursor === null ? undefined : rows[Math.min(cursor, rows.length - 1)];

  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div role="group" aria-label="Rooms" className="flex flex-wrap gap-space-xs">
          <FilterPill selected={room === ALL} onClick={() => setRoom(ALL)}>
            ALL ROOMS
          </FilterPill>
          {rooms.map((id) => (
            <FilterPill key={id} selected={room === id} onClick={() => setRoom(id)}>
              {areaName(id)}
            </FilterPill>
          ))}
        </div>
        <div role="group" aria-label="Range" className="flex gap-space-xs">
          {RANGES.map((r) => (
            <FilterPill key={r.label} selected={range === r.label} onClick={() => setRange(r.label)}>
              {r.label}
            </FilterPill>
          ))}
        </div>
      </div>

      <HistoryBody state={state} retry={retry} empty={rows.length === 0}>
        <div
          role="img"
          aria-label={`${roomLabel} climate, ${range}: ${climateSummary(rows)}`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setCursor(null)}
          className="rounded focus-visible:outline-2 focus-visible:outline-primary-container"
        >
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={rows}>
              <CartesianGrid stroke={cssToken("outline-variant", "currentColor")} strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="t" tickFormatter={clock} minTickGap={32} />
              <YAxis yAxisId="temp" unit=" °C" domain={["auto", "auto"]} stroke={cssToken("tertiary", "currentColor")} />
              <YAxis yAxisId="hum" orientation="right" unit=" %" domain={[0, 100]} stroke={cssToken("primary-container", "currentColor")} />
              <Tooltip labelFormatter={(t) => clock(String(t))} />
              <Area
                yAxisId="temp"
                dataKey="temp"
                name="Temperature"
                type="monotone"
                stroke={cssToken("tertiary", "currentColor")}
                fill={cssToken("tertiary", "currentColor")}
                fillOpacity={0.15}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                yAxisId="hum"
                dataKey="hum"
                name="Humidity"
                type="monotone"
                stroke={cssToken("primary-container", "currentColor")}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              {active && <ReferenceLine x={active.t} stroke={cssToken("on-surface", "currentColor")} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p aria-live="polite" className="font-mono text-label-caps uppercase text-on-surface">
          {active ? `${clock(active.t)} ${fmt(active.temp)} °C ${fmt(active.hum, 0)} %` : "FOCUS THE CHART AND USE ARROW KEYS TO READ VALUES"}
        </p>
        <p className="font-mono text-label-caps uppercase text-on-surface-variant">{climateSummary(rows)}</p>
        <table className="sr-only">
          <caption>{`${roomLabel} history, ${range}`}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Temperature °C</th>
              <th scope="col">Humidity %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t}>
                <td>{clock(r.t)}</td>
                <td>{fmt(r.temp)}</td>
                <td>{fmt(r.hum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HistoryBody>
    </div>
  );
}
