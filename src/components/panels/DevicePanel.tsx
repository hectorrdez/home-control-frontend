import { useCallback, useState, type CSSProperties } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useEntities } from "@/state/EntitiesProvider";
import { summarize, formatPower } from "@/state/selectors";
import { useHaStatus } from "@/api/useHaStatus";
import Button from "@components/controls/Button";
import Switch from "@components/controls/Switch";
import SideDrawer from "@components/panels/SideDrawer";
import StatusChip from "@components/controls/StatusChip";
import ActuatorTile from "@components/cards/ActuatorTile";
import ActuatorMenu from "@components/cards/ActuatorMenu";
import { UNASSIGNED } from "@/state/entities";
import {
  ALL_VISIBLE,
  PANEL_TYPES,
  hideAllListed,
  panelRoomCounts,
  panelTypeCounts,
  panelTypeLabel,
  setRoomShown,
  setTypeShown,
  switchedOffCount,
  visibleDeckSections,
  type PanelVisibility,
} from "@/features/devices/deviceFilters";

function SkeletonDeck() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-space-sm">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded bg-surface-container motion-reduce:animate-none" />
      ))}
    </div>
  );
}

// Feature 120: the list holds only controllable devices, so the message says so.
function emptyMessage(areaCount: number, selectedArea: string | null): string {
  if (areaCount === 0) return "NO DEVICES";
  if (selectedArea !== null) return "NO CONTROLLABLE DEVICES IN THIS ZONE";
  return "NO CONTROLLABLE DEVICES";
}

export default function DevicePanel() {
  const { state, reload, selectedArea, setSelectedArea } = useEntities();
  const ha = useHaStatus();
  // Feature 156: the long-press menu is open for this entity (one at a time).
  const [menuId, setMenuId] = useState<string | null>(null);
  // Feature 162: FILTERS drawer. Visibility is session state only (resets on load); closing the drawer keeps it.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibility, setVisibility] = useState<PanelVisibility>(ALL_VISIBLE);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  if (state.status === "error") {
    return (
      <section aria-label="Device panel" className="col-span-12 flex flex-col gap-space-md xl:col-span-4">
        <div role="alert" className="flex flex-col gap-space-sm rounded-xl bg-surface-container-low p-space-md">
          <StatusChip tone="error">ERROR</StatusChip>
          <p className="font-body-md text-on-surface">Could not load devices.</p>
          <Button variant="secondary" className="self-start" onClick={reload}>
            RETRY
          </Button>
        </div>
      </section>
    );
  }

  if (state.status === "loading") {
    return (
      <section aria-label="Device panel" aria-busy="true" className="col-span-12 flex flex-col gap-space-md xl:col-span-4">
        <div aria-hidden="true" className="h-20 animate-pulse rounded-xl bg-surface-container-low motion-reduce:animate-none" />
        <SkeletonDeck />
      </section>
    );
  }

  const summary = summarize(state);
  const synchronized = ha.state === "online" && summary.unavailable === 0;
  const sections = visibleDeckSections(state, selectedArea, visibility);
  const shown = sections.reduce((n, s) => n + s.entities.length, 0);
  // Feature 162: only types and rooms that have devices are listed in the drawer.
  const typeCounts = panelTypeCounts(state);
  const types = PANEL_TYPES.filter((t) => typeCounts[t] > 0);
  const rooms = panelRoomCounts(state);
  const roomIds = rooms.map((r) => r.areaId);
  const offCount = switchedOffCount(visibility, types, roomIds);

  return (
    <section aria-label="Device panel" className="col-span-12 flex min-h-0 flex-col gap-space-md xl:col-span-4">
      <div className="flex flex-col gap-space-xs rounded-xl bg-surface-container-low p-space-md">
        <div className="flex flex-wrap items-center justify-between gap-space-xs">
          {synchronized ? (
            <StatusChip tone="secondary" beacon>
              ALL SYSTEMS SYNCHRONIZED
            </StatusChip>
          ) : (
            <StatusChip tone="tertiary" beacon>
              {`ATTENTION // ${summary.unavailable > 0 ? `${summary.unavailable} UNAVAILABLE` : "HA OFFLINE"}`}
            </StatusChip>
          )}
          {/* Feature 162: filters live in a left drawer (like CHARTS in telemetry). */}
          <Button variant="secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            {offCount > 0 ? `FILTERS · ${offCount}` : "FILTERS"}
          </Button>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-space-xs">
          <span className="font-label-caps text-label-caps uppercase text-on-surface">
            {`${summary.zones} ZONES MONITORED • ${summary.actuators} LIVE ACTUATORS`}
          </span>
          {summary.load && (
            <span className="font-mono text-telemetry-md text-primary-container">
              {`LOAD ${formatPower(summary.load.watts)}`}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {shown === 0 ? (
          <p
            role="status"
            className="rounded border border-outline-variant/30 p-space-md font-label-caps text-label-caps uppercase text-on-surface-variant"
          >
            {emptyMessage(state.areas.length, selectedArea)}
          </p>
        ) : (
          <ul aria-label="Devices" className="grid min-h-0 flex-1 grid-cols-2 content-start gap-space-sm overflow-y-auto pr-space-xs md:grid-cols-3">
            {sections
              .flatMap((section) => section.entities.map((entity) => ({ entity, section })))
              .map(({ entity, section }, index) => (
                <li key={entity.entityId} style={{ "--i": index } as CSSProperties}>
                  <ActuatorTile
                    entity={entity}
                    areaName={section.area.areaId === UNASSIGNED ? "UNASSIGNED" : section.area.name.toUpperCase()}
                    onLongPress={(target) => setMenuId(target.entityId)}
                  />
                </li>
              ))}
          </ul>
        )}
      </div>
      <SideDrawer side="left" title="Filters" open={filtersOpen} onClose={closeFilters}>
        <div className="flex flex-col gap-space-sm">
          <div className="flex gap-space-xs">
            {/* ALL also clears a room picked on the 3D stage, so every room is listed as shown. */}
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setVisibility(ALL_VISIBLE);
                setSelectedArea(null);
              }}
            >
              ALL
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setVisibility(hideAllListed(types, roomIds))}>
              NONE
            </Button>
          </div>
          {types.length > 0 && (
            <div className="flex flex-col gap-space-xs">
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">ACTUATOR TYPES</p>
              <ul aria-label="Actuator types" className="flex flex-col gap-space-xs">
                {types.map((type) => {
                  const label = panelTypeLabel(type);
                  return (
                    <li
                      key={type}
                      className="flex items-center justify-between gap-space-sm rounded border border-outline-variant/30 p-space-sm"
                    >
                      <span className="min-w-0 truncate font-sans text-body-md text-on-surface">
                        {label}
                        <span className="font-mono text-label-caps uppercase text-on-surface-variant"> · {typeCounts[type]}</span>
                      </span>
                      <Switch
                        aria-label={`Show ${label}`}
                        checked={!visibility.hiddenTypes.has(type)}
                        onCheckedChange={(on) => setVisibility((v) => setTypeShown(v, type, on))}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {rooms.length > 0 && (
            <div className="flex flex-col gap-space-xs">
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">ROOMS</p>
              <ul aria-label="Rooms" className="flex flex-col gap-space-xs">
                {rooms.map((room) => {
                  const label = room.areaId === UNASSIGNED ? "UNASSIGNED" : room.name.toUpperCase();
                  return (
                    <li
                      key={room.areaId}
                      className="flex items-center justify-between gap-space-sm rounded border border-outline-variant/30 p-space-sm"
                    >
                      <span className="min-w-0 truncate font-sans text-body-md text-on-surface">
                        {label}
                        <span className="font-mono text-label-caps uppercase text-on-surface-variant"> · {room.count}</span>
                      </span>
                      <Switch
                        aria-label={`Show ${label}`}
                        checked={!visibility.hiddenRooms.has(room.areaId)}
                        onCheckedChange={(on) => setVisibility((v) => setRoomShown(v, room.areaId, on))}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </SideDrawer>
      {menuId !== null && state.entities[menuId] && (
        <ActuatorMenu entity={state.entities[menuId]} onClose={() => setMenuId(null)} />
      )}
    </section>
  );
}
