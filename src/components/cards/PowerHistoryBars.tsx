import { useMemo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Entity } from "@/api/types";
import { cssToken } from "@/features/telemetry/chartTokens";
import { housePowerSensor, hourlyAverages, toPoints } from "@/features/telemetry/history";
import { useHistory } from "@/features/telemetry/useHistory";
import { useEntityName } from "@/features/names/useEntityName";
import HistoryBody from "./HistoryBody";

// Feature 112: hourly average watts of the house power sensor over 24 h. Peak hour is highlighted (tertiary).
// Renders nothing when the house has no power sensor.
export default function PowerHistoryBars({ entities }: { entities: Entity[] }) {
  const sensor = useMemo(() => housePowerSensor(entities), [entities]);
  const names = useEntityName();
  const { state, retry } = useHistory(sensor ? [sensor.entityId] : [], 24);
  const bars = useMemo(() => {
    if (state.status !== "ready") return [];
    return hourlyAverages(toPoints(state.series[0]));
  }, [state]);

  if (!sensor) return null;

  const peak = bars.reduce((best, bar, i) => (bar.watts > (bars[best]?.watts ?? -Infinity) ? i : best), 0);

  return (
    <div className="flex flex-col gap-space-sm">
      <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">{`${sensor ? names.displayName(sensor) : ""} • HOURLY AVG W`}</p>
      <HistoryBody state={state} retry={retry} empty={bars.length === 0}>
        <div role="img" aria-label={`${sensor ? names.displayName(sensor) : ""} hourly average watts over 24 hours, peak ${bars[peak]?.hour ?? "--"}`}>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={bars}>
              <XAxis dataKey="hour" minTickGap={24} />
              <YAxis unit=" W" />
              <Tooltip />
              <Bar dataKey="watts" name="Average W" isAnimationActive={false} fill={cssToken("secondary", "currentColor")}>
                {bars.map((_, i) => (
                  <Cell key={i} fill={i === peak ? cssToken("tertiary", "currentColor") : cssToken("secondary", "currentColor")} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </HistoryBody>
    </div>
  );
}
