import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useEntityName } from "@/features/names/useEntityName";
import { deviceLabel } from "@/features/names/displayName";
import SideDrawer from "@components/panels/SideDrawer";
import ChartFilters from "@components/panels/ChartFilters";
import Switch from "@components/controls/Switch";
import type { ConnectionState, Entity } from "@/api/types";
import { useLiveBuffers } from "@/features/telemetry/useLiveBuffers";
import {
  CLIMATE_LABEL,
  climateMetricOf,
  climateMetrics,
  isClimateWidget,
  numericSensors,
  reconcileWidgets,
  saveWidgets,
  widgetsSetting,
  type ClimateMetric,
  type Widget,
  type WidgetSize,
} from "@/features/telemetry/widgets";
import { useSyncedSetting } from "@/features/settings/useSyncedSetting";
import {
  SIZE_LABEL,
  canMove,
  moveWidget,
  resetWidgets,
  setDeviceFields,
  setKind,
  setSize,
  setVisible,
  swapFieldWidget,
  validKinds,
} from "@/features/telemetry/widgetEditor";
import {
  CATEGORIES,
  UNASSIGNED_ZONE,
  buildDeviceRows,
  categoryOf,
  facetCounts,
  filterDevices,
  normalize,
  type ChartRow,
  type DeviceRow,
} from "@/features/telemetry/widgetFilters";
import { useChartFilters } from "@/features/telemetry/useChartFilters";
import Button from "@components/controls/Button";
import SensorChartCard from "./SensorChartCard";
import ClimateMetricCard from "./ClimateMetricCard";
import Card from "./Card";
import { useZoneTokenResolver } from "@/features/zones/ZoneColorsContext";
import ChartEditBar from "./ChartEditBar";
import FieldPickerDialog, { type PickerField } from "./FieldPickerDialog";

const side = (dir: -1 | 1): "up" | "down" => (dir < 0 ? "up" : "down");

// Feature 146: column span of a chart on the xl grid. Feature 160: 12 columns, so 25% = 3 and 75% = 9.
// Literal class strings so Tailwind generates them. md is bounded with max-xl: Tailwind emits the xl media query
// before md, so an unbounded md:col-span-2 would override xl:col-span-12. The list grid (md:max-xl:grid-cols-2) is bounded the same way.
function sizeClass(size: WidgetSize): string {
  if (size === "full") return "md:max-xl:col-span-2 xl:col-span-12";
  if (size === "threeQuarters") return "md:max-xl:col-span-2 xl:col-span-9";
  if (size === "half") return "xl:col-span-6";
  if (size === "quarter") return "xl:col-span-3";
  return "xl:col-span-4";
}

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
  // Feature 159: climate cards whose old fixed-panel toggle was hidden (read once, only when a card is created).
  climateHiddenByDefault?: ClimateMetric[];
}

export default function TelemetryChartsGrid({
  sensors,
  areaName,
  connection,
  fixedPanels = [],
  onFixedPanelChange,
  climateHiddenByDefault,
}: TelemetryChartsGridProps) {
  const numeric = useMemo(() => numericSensors(sensors), [sensors]);
  const climateList = useMemo(() => climateMetrics(sensors), [sensors]);
  // Feature 135: the layout comes from the shared setting, so another device's change re-renders this grid.
  const [stored] = useSyncedSetting(widgetsSetting);
  const saved = stored?.widgets ?? null;
  const [panelOpen, setPanelOpen] = useState(false);
  const names = useEntityName();
  const zoneOf = useZoneTokenResolver();
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const widgets = useMemo(
    () => reconcileWidgets(saved, numeric, { metrics: climateList, hiddenByDefault: climateHiddenByDefault }),
    [saved, numeric, climateList, climateHiddenByDefault],
  );
  const buffers = useLiveBuffers(numeric);
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Feature 135: only user edits persist (never reconcile-only differences). ownJson remembers what this grid wrote.
  const ownJson = useRef<string | null>(null);
  const persist = useCallback((next: Widget[]) => {
    saveWidgets(next);
    ownJson.current = JSON.stringify(widgetsSetting.get());
  }, []);

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
  // Feature 163: the drawer lists devices (one per physical device, with the chartable fields it has).
  const devices = useMemo(() => buildDeviceRows(rows, sensors), [rows, sensors]);
  const deviceOf = useMemo(() => {
    const map = new Map<string, DeviceRow>();
    for (const d of devices) for (const f of d.fields) map.set(f.entity.entityId, d);
    return map;
  }, [devices]);
  const facets = useMemo(() => facetCounts(devices), [devices]);
  // Feature 137: filters are shared (telemetry.filters); stale zone ids are ignored against the zones on screen.
  const zoneIds = useMemo(() => new Set(facets.zones.map((z) => z.id)), [facets]);
  const { filters, change: setFilters, onSearchFocusChange } = useChartFilters(zoneIds);
  const filteredDevices = useMemo(() => filterDevices(devices, filters), [devices, filters]);
  // Feature 159: climate cards are never in `rows`, so filters, facets and ALL/NONE stay chart-only.
  const isShown = (w: Widget) => w.visible && (isClimateWidget(w) || byId.has(w.entityId));
  const visible = widgets.filter(isShown);
  const chartCount = visible.filter((w) => !isClimateWidget(w)).length;
  const climateShown = widgets.filter(
    (w) => isClimateWidget(w) && normalize(CLIMATE_LABEL[climateMetricOf(w)!]).includes(normalize(filters.query)),
  );
  // Feature 125: the search query filters the fixed panels too; ALL/NONE stay chart-only.
  const fixedShown = fixedPanels.filter((p) => normalize(p.label).includes(normalize(filters.query)));

  // Feature 114: edit mode is session UI state only (never persisted).
  const [editing, setEditing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // Feature 135: a stored layout that differs from what this grid last wrote came from another device. Edit mode stays open.
  const seenStored = useRef(stored);
  useEffect(() => {
    if (stored === seenStored.current) return;
    seenStored.current = stored;
    if (editing && stored !== null && JSON.stringify(stored) !== ownJson.current) {
      setAnnouncement("Layout updated from another device");
    }
  }, [stored, editing]);
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
  // Feature 159: the title used by the live region (climate cards use their fixed title).
  const labelFor = (w: Widget): string => {
    const metric = climateMetricOf(w);
    if (metric) return CLIMATE_LABEL[metric];
    const entity = byId.get(w.entityId);
    return entity ? labelOf(entity) : w.entityId;
  };
  const visibleOf = (ws: Widget[]) => ws.filter(isShown).sort((a, b) => a.order - b.order);

  const move = (w: Widget, dir: -1 | 1) => {
    const next = moveWidget(widgets, w.id, dir);
    if (next === widgets) return;
    persist(next);
    const shown = visibleOf(next);
    const position = shown.findIndex((x) => x.id === w.id) + 1;
    // Reveal the moved chart before focus is restored: a move past the rendered slice would otherwise leave no node to focus.
    if (position > limit) setLimit(Math.ceil(position / PAGE_SIZE) * PAGE_SIZE);
    setAnnouncement(`Moved ${labelFor(w)} to position ${position} of ${shown.length}`);
    pendingFocus.current = { id: w.id, dir: side(canMove(next, w.id, dir) ? dir : (-dir as -1 | 1)) };
  };

  const hide = (w: Widget) => {
    persist(setVisible(widgets, w.id, false));
    setAnnouncement(`${labelFor(w)} hidden`);
    editRef.current?.focus();
  };

  // Feature 163: field picker. "device" = ADD / EDIT the fields of a device (checkboxes); "field" = the FIELD swap of
  // one chart (radio). Set only from user actions, cleared on confirm or cancel.
  const [picker, setPicker] = useState<{ kind: "device"; device: DeviceRow } | { kind: "field"; device: DeviceRow; from: string } | null>(null);
  const deviceIds = (d: DeviceRow) => d.fields.map((f) => f.entity.entityId);
  const addDevice = (d: DeviceRow) => {
    if (d.fields.length > 1) {
      setPicker({ kind: "device", device: d });
      return;
    }
    persist(setDeviceFields(widgets, deviceIds(d), deviceIds(d)));
    setAnnouncement(`Added ${d.name}`);
  };
  const removeDevice = (d: DeviceRow) => {
    persist(setDeviceFields(widgets, deviceIds(d), []));
    setAnnouncement(`Removed ${d.name}`);
  };
  const pickerFields = (d: DeviceRow): PickerField[] =>
    d.fields.map((f) => {
      const unit = typeof f.entity.attributes.unit_of_measurement === "string" ? f.entity.attributes.unit_of_measurement : "";
      return {
        entityId: f.entity.entityId,
        label: f.label,
        category: CATEGORIES.find((c) => c.id === categoryOf(f.entity))?.label ?? "OTHER",
        value: f.entity.state ? `${f.entity.state}${unit ? ` ${unit}` : ""}` : "",
      };
    });
  const confirmPicker = (ids: string[]) => {
    if (!picker) return;
    if (picker.kind === "field") {
      const to = byId.get(ids[0]);
      const from = byId.get(picker.from);
      if (to && from && ids[0] !== picker.from) {
        persist(swapFieldWidget(widgets, picker.from, ids[0], to));
        setAnnouncement(`${labelOf(from)} replaced by ${labelOf(to)}`);
      }
    } else {
      persist(setDeviceFields(widgets, deviceIds(picker.device), ids));
      setAnnouncement(picker.device.added ? `Updated ${picker.device.name}` : `Added ${picker.device.name}`);
    }
    setPicker(null);
  };

  const leaveEdit = () => {
    setEditing(false);
    setResetOpen(false);
  };

  const confirmReset = () => {
    persist(resetWidgets(numeric, climateList));
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
            {`${LABEL[connection]} • ${chartCount} CHARTS`}
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
          <ChartFilters
            filters={filters}
            onChange={setFilters}
            facets={facets}
            shown={filteredDevices.length}
            total={devices.length}
            onSearchFocusChange={onSearchFocusChange}
          />
          {climateShown.length > 0 && (
            <ul aria-label="Climate card toggles" className="flex flex-col gap-space-xs">
              {climateShown.map((w) => {
                const label = labelFor(w);
                return (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-space-sm rounded border border-outline-variant/30 p-space-sm"
                  >
                    <span className="min-w-0 truncate font-sans text-body-md text-on-surface">{label}</span>
                    <Switch
                      aria-label={`Show ${label}`}
                      checked={w.visible}
                      onCheckedChange={(on) => persist(setVisible(widgets, w.id, on))}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          {filteredDevices.length === 0 ? (
            <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">NO MATCHES</p>
          ) : (
            <ul aria-label="Devices" className="flex flex-col gap-space-xs">
              {filteredDevices.map((d) => (
                <li
                  key={d.key}
                  className="flex flex-col gap-space-xs rounded border border-outline-variant/30 p-space-sm"
                >
                  <div className="flex items-center justify-between gap-space-sm">
                    <span className="min-w-0 truncate font-sans text-body-md text-on-surface">{d.name}</span>
                    <span className="shrink-0 font-mono text-label-caps uppercase text-on-surface-variant">{d.zoneName}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-space-xs">
                    <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">{`${d.fields.length} FIELDS`}</span>
                    <span className="rounded border border-primary-container/40 px-space-xs font-label-caps text-label-caps uppercase text-primary-container">
                      {d.added ? `ADDED ${d.addedCount}/${d.fields.length}` : "NOT ADDED"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-space-xs">
                    {d.added ? (
                      <>
                        {d.fields.length > 1 && (
                          <Button variant="secondary" aria-label={`Edit ${d.name}`} onClick={() => setPicker({ kind: "device", device: d })}>
                            EDIT
                          </Button>
                        )}
                        <Button variant="destructive" aria-label={`Remove ${d.name}`} onClick={() => removeDevice(d)}>
                          REMOVE
                        </Button>
                      </>
                    ) : (
                      <Button aria-label={`Add ${d.name}`} onClick={() => addDevice(d)}>
                        ADD
                      </Button>
                    )}
                  </div>
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
      {picker && (
        <FieldPickerDialog
          title={picker.device.name}
          fields={pickerFields(picker.device)}
          mode={picker.kind === "field" ? "single" : "multi"}
          initial={picker.kind === "field" ? [picker.from] : picker.device.fields.filter((f) => f.widget.visible).map((f) => f.entity.entityId)}
          confirmLabel={picker.kind === "device" && !picker.device.added ? "ADD" : "SAVE"}
          onConfirm={confirmPicker}
          onCancel={() => setPicker(null)}
        />
      )}
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
          <div ref={listRef} role="list" aria-label="Live charts" className="grid grid-cols-1 gap-space-md md:max-xl:grid-cols-2 xl:grid-cols-12">
            {visible.slice(0, limit).map((w) => {
              const size = w.size ?? "third";
              const metric = climateMetricOf(w);
              if (metric) {
                return (
                  <div key={w.id} role="listitem" data-widget-id={w.id} className={sizeClass(size)}>
                    <Card role="region" aria-label={CLIMATE_LABEL[metric]} className="flex flex-col gap-space-xs border-t-2">
                      <ClimateMetricCard metric={metric} entities={sensors} areaName={areaName} />
                    </Card>
                    {editing && (
                      <ChartEditBar
                        label={CLIMATE_LABEL[metric]}
                        size={size}
                        canUp={canMove(widgets, w.id, -1)}
                        canDown={canMove(widgets, w.id, 1)}
                        onMove={(dir) => move(w, dir)}
                        onSize={(next) => {
                          persist(setSize(widgets, w.id, next));
                          setAnnouncement(`${CLIMATE_LABEL[metric]} width ${SIZE_LABEL[next]}`);
                        }}
                        onHide={() => hide(w)}
                      />
                    )}
                  </div>
                );
              }
              const entity = byId.get(w.entityId);
              if (!entity) return null;
              const device = deviceOf.get(entity.entityId);
              return (
                <div
                  key={w.id}
                  role="listitem"
                  data-widget-id={w.id}
                  className={sizeClass(size)}
                >
                  <SensorChartCard
                    entity={entity}
                    areaName={areaName(entity.area)}
                    zoneToken={zoneOf(entity.area)}
                    widget={w}
                    points={buffers[w.entityId] ?? []}
                    connection={connection}
                  />
                  {editing && (
                    <ChartEditBar
                      label={labelOf(entity)}
                      kind={w.kind}
                      kinds={validKinds(entity)}
                      size={size}
                      canUp={canMove(widgets, w.id, -1)}
                      canDown={canMove(widgets, w.id, 1)}
                      onMove={(dir) => move(w, dir)}
                      onKind={(kind) => persist(setKind(widgets, w.id, kind))}
                      onSize={(next) => {
                        persist(setSize(widgets, w.id, next));
                        setAnnouncement(`${labelFor(w)} width ${SIZE_LABEL[next]}`);
                      }}
                      onHide={() => hide(w)}
                      onField={
                        device && device.fields.length > 1
                          ? () => setPicker({ kind: "field", device, from: entity.entityId })
                          : undefined
                      }
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
