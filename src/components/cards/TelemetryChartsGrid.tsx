import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useEntityName } from "@/features/names/useEntityName";
import { deviceLabel } from "@/features/names/displayName";
import SideDrawer from "@components/panels/SideDrawer";
import ChartFilters from "@components/panels/ChartFilters";
import Switch from "@components/controls/Switch";
import type { ConnectionState, Entity } from "@/api/types";
import { useLiveBuffers } from "@/features/telemetry/useLiveBuffers";
import { loadWidgets, numericSensors, reconcileWidgets, saveWidgets, type Widget } from "@/features/telemetry/widgets";
import {
  canMove,
  moveWidget,
  resetWidgets,
  setKind,
  setVisible,
  setWide,
  validKinds,
} from "@/features/telemetry/widgetEditor";
import {
  EMPTY_FILTERS,
  UNASSIGNED_ZONE,
  facetCounts,
  filterRows,
  normalize,
  type ChartFilters as Filters,
  type ChartRow,
} from "@/features/telemetry/widgetFilters";
import Button from "@components/controls/Button";
import SensorChartCard from "./SensorChartCard";
import ChartEditBar from "./ChartEditBar";

const side = (dir: -1 | 1): "up" | "down" => (dir < 0 ? "up" : "down");

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

// Feature 125: a fixed telemetry panel (KPI, gauge, history) the page can show or hide.
export interface FixedPanel {
  id: string;
  label: string;
  visible: boolean;
}

interface TelemetryChartsGridProps {
  sensors: Entity[];
  areaName: (areaId: string | null) => string;
  connection: ConnectionState;
  fixedPanels?: FixedPanel[];
  onFixedPanelChange?: (id: string, visible: boolean) => void;
}

export default function TelemetryChartsGrid({
  sensors,
  areaName,
  connection,
  fixedPanels = [],
  onFixedPanelChange,
}: TelemetryChartsGridProps) {
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
            deviceName: deviceLabel(entity),
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
  // Feature 125: the search query filters the fixed panels too; ALL/NONE stay chart-only.
  const fixedShown = fixedPanels.filter((p) => normalize(p.label).includes(normalize(filters.query)));

  // Feature 114: edit mode is session UI state only (never persisted).
  const [editing, setEditing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<{ id: string; dir: "up" | "down" } | null>(null);
  const resetReturnFocus = useRef(false);

  // After a move the card node may be re-inserted: restore focus on the same move button (or the opposite one at an edge).
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const item = Array.from(listRef.current?.children ?? []).find(
      (el) => (el as HTMLElement).dataset.widgetId === pending.id,
    );
    item?.querySelector<HTMLButtonElement>(`button[data-move="${pending.dir}"]`)?.focus();
  }, [widgets]);

  useEffect(() => {
    if (!resetOpen && resetReturnFocus.current) {
      resetReturnFocus.current = false;
      resetRef.current?.focus();
    }
  }, [resetOpen]);

  const labelOf = (entity: Entity) => names.displayName(entity);
  const visibleOf = (ws: Widget[]) =>
    ws.filter((w) => w.visible && byId.has(w.entityId)).sort((a, b) => a.order - b.order);

  const move = (w: Widget, dir: -1 | 1) => {
    const next = moveWidget(widgets, w.id, dir);
    if (next === widgets) return;
    setSaved(next);
    const shown = visibleOf(next);
    const position = shown.findIndex((x) => x.id === w.id) + 1;
    // Reveal the moved chart before focus is restored: a move past the rendered slice would otherwise leave no node to focus.
    if (position > limit) setLimit(Math.ceil(position / PAGE_SIZE) * PAGE_SIZE);
    setAnnouncement(`Moved ${labelOf(byId.get(w.entityId)!)} to position ${position} of ${shown.length}`);
    pendingFocus.current = { id: w.id, dir: side(canMove(next, w.id, dir) ? dir : (-dir as -1 | 1)) };
  };

  const hide = (w: Widget) => {
    setSaved(setVisible(widgets, w.id, false));
    setAnnouncement(`${labelOf(byId.get(w.entityId)!)} hidden`);
    editRef.current?.focus();
  };

  const leaveEdit = () => {
    setEditing(false);
    setResetOpen(false);
  };

  const confirmReset = () => {
    setSaved(resetWidgets(numeric));
    setResetOpen(false);
    setAnnouncement("Layout reset");
    resetReturnFocus.current = true;
  };

  const cancelReset = () => {
    setResetOpen(false);
    resetReturnFocus.current = true;
  };

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
        <div className="flex items-center gap-space-xs">
          <Button
            ref={editRef}
            variant="secondary"
            aria-pressed={editing}
            onClick={() => (editing ? leaveEdit() : setEditing(true))}
          >
            {editing ? "DONE" : "EDIT"}
          </Button>
          <Button variant="secondary" aria-expanded={panelOpen} onClick={() => setPanelOpen((v) => !v)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            CHARTS
          </Button>
        </div>
      </div>
      {editing && (
        <div className="flex flex-wrap items-center gap-space-sm">
          {resetOpen ? (
            <>
              <p className="font-mono text-label-caps uppercase text-error">Reset layout to defaults?</p>
              <Button variant="destructive" onClick={confirmReset}>
                CONFIRM RESET
              </Button>
              <Button variant="secondary" onClick={cancelReset}>
                CANCEL
              </Button>
            </>
          ) : (
            <Button ref={resetRef} variant="secondary" onClick={() => setResetOpen(true)}>
              RESET LAYOUT
            </Button>
          )}
        </div>
      )}
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
                  <span className="min-w-0 truncate font-sans text-body-md text-on-surface">
                    {r.label}
                    {r.deviceName && <span className="font-mono text-label-caps uppercase text-on-surface-variant"> · {r.deviceName}</span>}
                  </span>
                  <Switch
                    aria-label={`Show ${r.label}`}
                    checked={r.widget.visible}
                    onCheckedChange={(on) => toggle(r.entity.entityId, on)}
                  />
                </li>
              ))}
            </ul>
          )}
          {fixedShown.length > 0 && (
            <div className="flex flex-col gap-space-xs">
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">FIXED PANELS</p>
              <ul aria-label="Fixed panel toggles" className="flex flex-col gap-space-xs">
                {fixedShown.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-space-sm rounded border border-outline-variant/30 p-space-sm"
                  >
                    <span className="min-w-0 truncate font-sans text-body-md text-on-surface">{p.label}</span>
                    <Switch
                      aria-label={`Show ${p.label}`}
                      checked={p.visible}
                      onCheckedChange={(on) => onFixedPanelChange?.(p.id, on)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SideDrawer>
      <p role="status" aria-label="Layout changes" className="sr-only">
        {announcement}
      </p>
      {visible.length === 0 ? (
        <>
          <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">ALL CHARTS HIDDEN</p>
          {editing && (
            <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">OPEN CHARTS TO ADD THEM BACK</p>
          )}
        </>
      ) : (
        <>
          <div ref={listRef} role="list" aria-label="Live charts" className="grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-3">
            {visible.slice(0, limit).map((w) => {
              const entity = byId.get(w.entityId);
              if (!entity) return null;
              return (
                <div
                  key={w.id}
                  role="listitem"
                  data-widget-id={w.id}
                  className={w.wide ? "md:col-span-2" : undefined}
                >
                  <SensorChartCard
                    entity={entity}
                    areaName={areaName(entity.area)}
                    widget={w}
                    points={buffers[w.entityId] ?? []}
                    connection={connection}
                  />
                  {editing && (
                    <ChartEditBar
                      label={labelOf(entity)}
                      kind={w.kind}
                      kinds={validKinds(entity)}
                      wide={w.wide === true}
                      canUp={canMove(widgets, w.id, -1)}
                      canDown={canMove(widgets, w.id, 1)}
                      onMove={(dir) => move(w, dir)}
                      onKind={(kind) => setSaved(setKind(widgets, w.id, kind))}
                      onWide={(wide) => setSaved(setWide(widgets, w.id, wide))}
                      onHide={() => hide(w)}
                    />
                  )}
                </div>
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
