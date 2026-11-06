import type { CSSProperties } from "react";
import { useEntities } from "@/state/EntitiesProvider";
import {
  DOMAIN_GROUPS,
  deckSections,
  groupCounts,
  summarize,
  allEntities,
  isUnavailable,
  formatPower,
  plugDrawBySwitch,
  type DomainFilter,
  type PillGroup,
} from "@/state/selectors";
import { useHaStatus } from "@/api/useHaStatus";
import Button from "@components/controls/Button";
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

function drawLabel(sensor: { state: string; attributes: Record<string, unknown> } | undefined): string | undefined {
  if (!sensor) return undefined;
  const unit = typeof sensor.attributes.unit_of_measurement === "string" ? sensor.attributes.unit_of_measurement : "W";
  return `${sensor.state} ${unit}`;
}

export default function DevicePanel() {
  const { state, reload, selectedArea, setSelectedArea, selectedGroup, setSelectedGroup } = useEntities();
  const ha = useHaStatus();

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
  const rooms = state.areas.filter((a) => a.entityIds.some((id) => state.entities[id] && !isUnavailable(state.entities[id])));
  const draws = plugDrawBySwitch(allEntities(state));

  return (
    <section aria-label="Device panel" className="col-span-12 flex min-h-64 flex-col gap-space-md xl:col-span-4">
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

      {rooms.length > 0 && (
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

      <div className="flex flex-col gap-space-sm xl:max-h-screen xl:overflow-y-auto xl:pr-space-xs">
        {shown === 0 ? (
          <p className="rounded border border-outline-variant/30 p-space-md font-label-caps text-label-caps uppercase text-on-surface-variant">
            {state.areas.length === 0 ? "NO DEVICES" : "NO DEVICES IN THIS ZONE"}
          </p>
        ) : (
          <ul aria-label="Devices" className="flex flex-col gap-space-sm">
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
