import { useCallback, useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useEntityName } from "@/features/names/useEntityName";
import SideDrawer from "@components/panels/SideDrawer";
import ChartFilters from "@components/panels/ChartFilters";
import Switch from "@components/controls/Switch";
import type { ConnectionState, Entity } from "@/api/types";
import { useLiveBuffers } from "@/features/telemetry/useLiveBuffers";
import { loadWidgets, numericSensors, reconcileWidgets, saveWidgets } from "@/features/telemetry/widgets";
import {
  EMPTY_FILTERS,
  UNASSIGNED_ZONE,
  facetCounts,
  filterRows,
  type ChartFilters as Filters,
  type ChartRow,
} from "@/features/telemetry/widgetFilters";
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
  const [saved, setSaved] = useState(loadWidgets);
  const [panelOpen, setPanelOpen] = useState(false);
  const names = useEntityName();
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const widgets = useMemo(() => reconcileWidgets(saved, numeric), [saved, numeric]);
  const buffers = useLiveBuffers(numeric);
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Feature 118: session-only filter state (never persisted; resets on every load).
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  useEffect(() => {
    saveWidgets(widgets);
  }, [widgets]);

  const byId = useMemo(() => new Map(numeric.map((e) => [e.entityId, e])), [numeric]);
  const rows = useMemo<ChartRow[]>(
    () =>
      widgets.flatMap((w) => {
        const entity = byId.get(w.entityId);
        if (!entity) return [];
        return [
          {
            widget: w,
            entity,
            label: names.displayName(entity),
            zoneId: entity.area ?? UNASSIGNED_ZONE,
            zoneName: areaName(entity.area),
          },
        ];
      }),
    [widgets, byId, names, areaName],
  );
  const facets = useMemo(() => facetCounts(rows), [rows]);
  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const toggle = (entityId: string, on: boolean) =>
    setSaved(widgets.map((w) => (w.entityId === entityId ? { ...w, visible: on } : w)));
  // ALL / NONE only touch the rows the filters currently show.
  const setShown = (on: boolean) => {
    const ids = new Set(filtered.map((r) => r.entity.entityId));
    setSaved(widgets.map((w) => (ids.has(w.entityId) ? { ...w, visible: on } : w)));
  };
  const visible = widgets.filter((w) => w.visible && byId.has(w.entityId));

  if (numeric.length === 0) {
    return <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">NO NUMERIC SENSORS</p>;
  }

  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between gap-space-xs">
        <p className="flex items-center gap-space-xs font-label-caps text-label-caps uppercase">
          <span className={TEXT[connection]} role="status" aria-label="Chart connection">
            {`${LABEL[connection]} • ${visible.length} CHARTS`}
          </span>
        </p>
        <Button variant="secondary" aria-expanded={panelOpen} onClick={() => setPanelOpen((v) => !v)}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          CHARTS
        </Button>
      </div>
      <SideDrawer side="left" title="Charts" open={panelOpen} onClose={closePanel}>
        <div className="flex flex-col gap-space-sm">
          <ChartFilters filters={filters} onChange={setFilters} facets={facets} shown={filtered.length} total={rows.length} />
          <div className="flex gap-space-xs">
            <Button variant="secondary" className="flex-1" onClick={() => setShown(true)}>
              ALL
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setShown(false)}>
              NONE
            </Button>
          </div>
          {filtered.length === 0 ? (
            <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">NO MATCHES</p>
          ) : (
            <ul aria-label="Chart toggles" className="flex flex-col gap-space-xs">
              {filtered.map((r) => (
                <li
                  key={r.widget.id}
                  className="flex items-center justify-between gap-space-sm rounded border border-outline-variant/30 p-space-sm"
                >
                  <span className="min-w-0 truncate font-sans text-body-md text-on-surface">{r.label}</span>
                  <Switch
                    aria-label={`Show ${r.label}`}
                    checked={r.widget.visible}
                    onCheckedChange={(on) => toggle(r.entity.entityId, on)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </SideDrawer>
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
