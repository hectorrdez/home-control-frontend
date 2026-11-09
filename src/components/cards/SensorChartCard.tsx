import { memo } from "react";
import { Area, AreaChart, Bar, BarChart, Line, LineChart, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, PolarAngleAxis } from "recharts";
import type { Entity, ConnectionState } from "@/api/types";
import type { Widget, WidgetKind } from "@/features/telemetry/widgets";
import { latestValue, trendDelta, type Point } from "@/features/telemetry/liveBuffer";
import { GAUGE_OK_ABOVE, GAUGE_WARN_ABOVE } from "@/features/telemetry/constants";
import { cssToken } from "@/features/telemetry/chartTokens";
import Card from "./Card";
import EditableName from "@components/controls/EditableName";
import { useEntityName } from "@/features/names/useEntityName";
import { deviceLabel } from "@/features/names/displayName";
import { normalize } from "@/features/telemetry/widgetFilters";
import { ZoneDot } from "@/features/zones/ZoneDot";
import { seriesTooltipText } from "@/features/telemetry/seriesTooltip";
import { zoneStroke } from "@/features/zones/ZoneColorsContext";
import type { ZoneToken } from "@/features/zones/zoneColors";

// Feature 113: one live chart per numeric sensor. Colors come from the shared token helper (features/telemetry/chartTokens).
// Feature 147: the series take the zone color of the entity's area (neutral when it has none); gauges keep their semantic fill.

const TREND_LABEL: Record<"up" | "down" | "flat", string> = { up: "UP", down: "DOWN", flat: "FLAT" };

function trendText(delta: number | null, unit: string): { text: string; label: string } {
  if (delta === null) return { text: "--", label: "no trend yet" };
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return { text: `${TREND_LABEL.flat} 0 ${unit}`.trim(), label: "flat" };
  const direction = rounded > 0 ? "up" : "down";
  const text = `${TREND_LABEL[direction]} ${rounded > 0 ? "+" : ""}${rounded} ${unit}`.trim();
  return { text, label: direction };
}

function timeLabel(t: unknown): string {
  return new Date(Number(t)).toLocaleTimeString();
}

interface ChartProps {
  kind: WidgetKind;
  points: Point[];
  color: string; // zone color of the series (neutral when the entity has no area)
  identity: string; // "<area> · <label>": the tooltip names the room
  unit: string;
}

function SensorChart({ kind, points, color, identity, unit }: ChartProps) {
  const data = points.map((p) => ({ t: p.t, v: p.v }));
  // Feature 147: a null series name hides the default "v: " prefix.
  const tooltip = <Tooltip labelFormatter={timeLabel} formatter={(value) => [seriesTooltipText(identity, value, unit), null]} />;

  if (kind === "gauge") {
    const value = latestValue(points) ?? 0;
    const fill =
      value >= GAUGE_OK_ABOVE
        ? cssToken("secondary", "currentColor")
        : value >= GAUGE_WARN_ABOVE
          ? cssToken("tertiary-fixed-dim", "currentColor")
          : cssToken("error", "currentColor");
    return (
      <ResponsiveContainer width="100%" height={112}>
        <RadialBarChart data={[{ name: "value", v: value }]} innerRadius="70%" outerRadius="100%" startAngle={180} endAngle={0}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="v" fill={fill} background isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  }

  if (kind === "bar") {
    return (
      <ResponsiveContainer width="100%" height={112}>
        <BarChart data={data}>
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
          <YAxis hide domain={["auto", "auto"]} />
          {tooltip}
          <Bar dataKey="v" fill={color} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (kind === "area") {
    return (
      <ResponsiveContainer width="100%" height={112}>
        <AreaChart data={data}>
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
          <YAxis hide domain={["auto", "auto"]} />
          {tooltip}
          <Area dataKey="v" type="monotone" stroke={color} fill={color} fillOpacity={0.2} dot={false} connectNulls={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={112}>
      <LineChart data={data}>
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
        <YAxis hide domain={["auto", "auto"]} />
        {tooltip}
        <Line dataKey="v" type="monotone" stroke={color} dot={false} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface SensorChartCardProps {
  entity: Entity;
  areaName: string;
  zoneToken: ZoneToken | null; // feature 147: assigned by the grid; null = entity without area
  widget: Widget;
  points: Point[];
  connection: ConnectionState;
}

function SensorChartCardView({ entity, areaName, zoneToken, widget, points, connection }: SensorChartCardProps) {
  const unit = typeof entity.attributes.unit_of_measurement === "string" ? entity.attributes.unit_of_measurement : "";
  const names = useEntityName();
  const label = names.displayName(entity);
  const title = names.shortName(entity);
  // Feature 124: show the device unless the visible title already names it (case/accent-insensitive).
  const device = deviceLabel(entity);
  const showDevice = device !== "" && !normalize(title).includes(normalize(device));
  const spokenLabel = showDevice ? `${label}, ${device}` : label;
  const deviceText = showDevice ? `${device} · ` : "";
  const zone = zoneStroke(zoneToken);
  const current = latestValue(points);
  const value = current === null ? "--" : String(Math.round(current * 10) / 10);
  const now = points.length > 0 ? points[points.length - 1].t : 0;
  const trend = trendText(trendDelta(points, now), unit);
  const summary = `${spokenLabel}: ${value}${unit ? ` ${unit}` : ""}, ${trend.label}`;

  return (
    <Card
      role="region"
      aria-label={label}
      className={`flex flex-col gap-space-xs border-t-2 ${connection === "open" ? "" : "opacity-60"}`}
      style={zoneToken ? { borderTopColor: `var(--color-${zoneToken})` } : undefined}
    >
      <div className="flex items-start justify-between gap-space-xs">
        <div className="flex flex-col">
          <EditableName
            entityId={entity.entityId}
            shown={title}
            label={label}
            raw={entity.name}
            canRename={names.canRename}
            onRename={(alias) => names.renameEntity(entity, alias)}
            textClassName="font-label-caps text-label-caps uppercase text-on-surface-variant"
          />
          <span className="font-mono text-label-caps uppercase text-on-surface-variant">
            {deviceText}
            <ZoneDot token={zoneToken} className="mr-space-xs align-middle" />
            {areaName}
          </span>
        </div>
        <span className="font-mono text-label-caps uppercase text-on-surface-variant">{trend.text}</span>
      </div>
      <div className="flex items-baseline gap-space-xs">
        <span className="font-mono text-telemetry-lg text-on-surface">{value}</span>
        <span className="font-mono text-label-caps uppercase text-on-surface-variant">{unit}</span>
      </div>
      <div role="img" aria-label={summary}>
        <SensorChart kind={widget.kind} points={points} color={zone} identity={`${areaName} · ${label}`} unit={unit} />
      </div>
    </Card>
  );
}

// Re-renders only when its own series (or the connection state) changes. The zone token arrives as a prop, so the memo holds.
const SensorChartCard = memo(SensorChartCardView);
export default SensorChartCard;
