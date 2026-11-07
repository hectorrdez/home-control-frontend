import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Entity } from "@/api/types";
import FilterPill from "@components/controls/FilterPill";
import HistoryBody from "./HistoryBody";
import { cssToken } from "@/features/telemetry/chartTokens";
import { RANGES, clock, downsample, fmt, toPoints, type HistoryPoint, type RangeLabel } from "@/features/telemetry/history";
import { useHistory } from "@/features/telemetry/useHistory";

// Feature 122: history of one numeric sensor (single series area chart). Ranges 6H/24H/7D/30D, default 24H.
interface EntityHistoryCardProps {
  entity: Entity;
  displayName: string;
}

function summaryText(points: HistoryPoint[], unit: string): string {
  if (points.length === 0) return "no data";
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const u = unit ? ` ${unit}` : "";
  return `min ${fmt(min)}${u}, avg ${fmt(avg)}${u}, max ${fmt(max)}${u}`;
}

export default function EntityHistoryCard({ entity, displayName }: EntityHistoryCardProps) {
  const [range, setRange] = useState<RangeLabel>("24H");
  const hours = RANGES.find((r) => r.label === range)?.hours ?? 24;
  const unit = typeof entity.attributes.unit_of_measurement === "string" ? entity.attributes.unit_of_measurement : "";
  const { state, retry } = useHistory([entity.entityId], hours);

  const points = useMemo<HistoryPoint[]>(() => {
    if (state.status !== "ready") return [];
    return downsample(toPoints(state.series.find((s) => s.entityId === entity.entityId)));
  }, [state, entity.entityId]);

  const stroke = cssToken("secondary", "currentColor");
  const summary = summaryText(points, unit);

  return (
    <div className="flex flex-col gap-space-sm">
      <div role="group" aria-label="Range" className="flex flex-wrap gap-space-xs">
        {RANGES.map((r) => (
          <FilterPill key={r.label} selected={range === r.label} onClick={() => setRange(r.label)}>
            {r.label}
          </FilterPill>
        ))}
      </div>

      <HistoryBody state={state} retry={retry} empty={points.length === 0}>
        <div role="img" aria-label={`${displayName} history, ${range}: ${summary}`}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={points}>
              <XAxis dataKey="t" tickFormatter={clock} minTickGap={32} />
              <YAxis domain={["auto", "auto"]} unit={unit ? ` ${unit}` : undefined} />
              <Tooltip labelFormatter={(t) => clock(String(t))} />
              <Area dataKey="v" name={displayName} type="monotone" stroke={stroke} fill={stroke} fillOpacity={0.2} dot={false} connectNulls isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="font-mono text-label-caps uppercase text-on-surface-variant">{summary}</p>
        <table className="sr-only">
          <caption>{`${displayName} history, ${range}`}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">{unit ? `Value ${unit}` : "Value"}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.t}>
                <td>{clock(p.t)}</td>
                <td>{fmt(p.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HistoryBody>
    </div>
  );
}
