import { useState, type CSSProperties } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useEntities } from "@/state/EntitiesProvider";
import {
  DOMAIN_GROUPS,
  deckSections,
  groupCounts,
  summarize,
  allEntities,
  isInteractive,
  isUnavailable,
  formatPower,
  plugDrawBySwitch,
  type DomainFilter,
  type PillGroup,
} from "@/state/selectors";
import { useHaStatus } from "@/api/useHaStatus";
import Button from "@components/controls/Button";
import ButtonLink from "@components/controls/ButtonLink";
import FilterPill from "@components/controls/FilterPill";
import StatusChip from "@components/controls/StatusChip";
import DeviceModule from "@components/cards/DeviceModule";
import { UNASSIGNED } from "@/state/entities";

const GROUP_LABEL: Record<PillGroup, string> = {
  lights: "LIGHTS",
  climate: "CLIMATE",
  security: "SECURITY",
  plugs: "PLUGS",
};

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

function drawLabel(sensor: { state: string; attributes: Record<string, unknown> } | undefined): string | undefined {
  if (!sensor) return undefined;
  const unit = typeof sensor.attributes.unit_of_measurement === "string" ? sensor.attributes.unit_of_measurement : "W";
  return `${sensor.state} ${unit}`;
}

export default function DevicePanel() {
  const { state, reload, selectedArea, setSelectedArea, selectedGroup, setSelectedGroup } = useEntities();
  const ha = useHaStatus();
  const [filtersShown, setFiltersShown] = useState(true);

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

  const counts = groupCounts(state);
  const summary = summarize(state);
  const synchronized = ha.state === "online" && summary.unavailable === 0;
  const sections = deckSections(state, selectedArea, selectedGroup);
  const shown = sections.reduce((n, s) => n + s.entities.length, 0);
  // A room chip needs at least one available, interactive device (read-only rooms have no chip).
  const rooms = state.areas.filter((a) =>
    a.entityIds.some((id) => {
      const e = state.entities[id];
      return e !== undefined && !isUnavailable(e) && isInteractive(e);
    }),
  );
  const draws = plugDrawBySwitch(allEntities(state));

  // Hiding the filters also clears them, so the list shows every device again.
  const toggleFilters = () => {
    if (filtersShown) {
      setSelectedGroup("all");
      setSelectedArea(null);
    }
    setFiltersShown(!filtersShown);
  };

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
          <div className="flex items-center gap-space-xs">
            <FilterPill
              aria-label="Toggle filters"
              selected={filtersShown}
              icon={<SlidersHorizontal aria-hidden="true" className="size-4" />}
              onClick={toggleFilters}
            />
            {/* Feature 121: deferred link to the full device list. */}
            <ButtonLink to="devices">
              All devices
            </ButtonLink>
          </div>
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

      {filtersShown && (
        <div role="group" aria-label="Device filters" className="flex gap-space-xs overflow-x-auto pb-space-xs">
          <FilterPill selected={selectedGroup === "all"} count={counts.all} onClick={() => setSelectedGroup("all")}>
            ALL
          </FilterPill>
          {DOMAIN_GROUPS.filter((g) => counts[g] > 0).map((g) => (
            <FilterPill
              key={g}
              selected={selectedGroup === g}
              count={counts[g]}
              onClick={() => setSelectedGroup(g as DomainFilter)}
            >
              {GROUP_LABEL[g]}
            </FilterPill>
          ))}
        </div>
      )}

      {filtersShown && rooms.length > 0 && (
        <div role="group" aria-label="Rooms" className="flex gap-space-xs overflow-x-auto pb-space-xs">
          <FilterPill selected={selectedArea === null} onClick={() => setSelectedArea(null)}>
            ALL ROOMS
          </FilterPill>
          {rooms.map((room) => (
            <FilterPill
              key={room.areaId}
              selected={selectedArea === room.areaId}
              onClick={() => setSelectedArea(room.areaId)}
            >
              {room.areaId === UNASSIGNED ? "UNASSIGNED" : room.name.toUpperCase()}
            </FilterPill>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {shown === 0 ? (
          <p
            role="status"
            className="rounded border border-outline-variant/30 p-space-md font-label-caps text-label-caps uppercase text-on-surface-variant"
          >
            {emptyMessage(state.areas.length, selectedArea)}
          </p>
        ) : (
          <ul aria-label="Devices" className="flex min-h-0 flex-1 flex-col gap-space-sm overflow-y-auto pr-space-xs">
            {sections
              .flatMap((section) => section.entities.map((entity) => ({ entity, section })))
              .map(({ entity, section }, index) => (
                <li key={entity.entityId} style={{ "--i": index } as CSSProperties}>
                  <DeviceModule
                    entity={entity}
                    areaName={section.area.areaId === UNASSIGNED ? "UNASSIGNED" : section.area.name.toUpperCase()}
                    drawText={drawLabel(draws.get(entity.entityId))}
                  />
                </li>
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}
