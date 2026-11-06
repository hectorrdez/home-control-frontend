import { useEffect, useMemo, useState } from "react";
import type { ConnectionState, Entity } from "@/api/types";
import { useLiveBuffers } from "@/features/telemetry/useLiveBuffers";
import { loadWidgets, numericSensors, reconcileWidgets, saveWidgets } from "@/features/telemetry/widgets";
import Button from "@components/controls/Button";
import SensorChartCard from "./SensorChartCard";

// Feature 113: live chart grid for every visible numeric sensor. Renders inside the telemetry "Climate history" region.
const PAGE_SIZE = 24;

const LABEL: Record<ConnectionState, string> = {
  open: "LIVE",
  reconnecting: "RECONNECTING",
  closed: "OFFLINE",
};

const TEXT: Record<ConnectionState, string> = {
  open: "text-secondary",
  reconnecting: "text-tertiary-fixed-dim",
  closed: "text-error",
};

interface TelemetryChartsGridProps {
  sensors: Entity[];
  areaName: (areaId: string | null) => string;
  connection: ConnectionState;
}

export default function TelemetryChartsGrid({ sensors, areaName, connection }: TelemetryChartsGridProps) {
  const numeric = useMemo(() => numericSensors(sensors), [sensors]);
  const [saved] = useState(loadWidgets);
  const widgets = useMemo(() => reconcileWidgets(saved, numeric), [saved, numeric]);
  const buffers = useLiveBuffers(numeric);
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    saveWidgets(widgets);
  }, [widgets]);

  const byId = useMemo(() => new Map(numeric.map((e) => [e.entityId, e])), [numeric]);
  const visible = widgets.filter((w) => w.visible && byId.has(w.entityId));

  if (numeric.length === 0) {
    return <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">NO NUMERIC SENSORS</p>;
  }

  return (
    <div className="flex flex-col gap-space-sm">
      <p className="flex items-center gap-space-xs font-label-caps text-label-caps uppercase">
        <span className={TEXT[connection]} role="status" aria-label="Chart connection">
          {`${LABEL[connection]} • ${visible.length} CHARTS`}
        </span>
      </p>
      {visible.length === 0 ? (
        <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">ALL CHARTS HIDDEN</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-3">
            {visible.slice(0, limit).map((w) => {
              const entity = byId.get(w.entityId);
              if (!entity) return null;
              return (
                <SensorChartCard
                  key={w.id}
                  entity={entity}
                  areaName={areaName(entity.area)}
                  widget={w}
                  points={buffers[w.entityId] ?? []}
                  connection={connection}
                />
              );
            })}
          </div>
          {visible.length > limit && (
            <Button variant="secondary" className="self-start" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              SHOW MORE
            </Button>
          )}
        </>
      )}
    </div>
  );
}
