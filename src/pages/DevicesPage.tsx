import { useMemo, useState } from "react";
import PageGrid from "@layouts/PageGrid";
import { useEntities } from "@/state/EntitiesProvider";
import { useEntityName } from "@/features/names/useEntityName";
import { allEntities } from "@/state/selectors";
import Button from "@components/controls/Button";
import StatusChip from "@components/controls/StatusChip";
import DeviceFilters from "@components/panels/DeviceFilters";
import DeviceRow from "@components/cards/DeviceRow";
import {
  EMPTY_DEVICE_FILTERS,
  buildDeviceRows,
  deviceFacets,
  filterDeviceRows,
  type DeviceFilters as Filters,
} from "@/features/devices/deviceFilters";

// Feature 121: every entity of the house (interactive and read-only, available or not), searchable and filterable.
function SkeletonList() {
  return (
    <div aria-hidden="true" className="grid grid-cols-1 gap-space-sm md:grid-cols-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-container motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export default function DevicesPage() {
  const { state, reload } = useEntities();
  const names = useEntityName();
  const [filters, setFilters] = useState<Filters>(EMPTY_DEVICE_FILTERS);
  const rows = useMemo(
    () => (state.status === "ready" ? buildDeviceRows(state, names.displayName) : []),
    [state, names.displayName],
  );
  const facets = useMemo(() => deviceFacets(rows), [rows]);
  const shown = useMemo(() => filterDeviceRows(rows, filters), [rows, filters]);

  const header = <h1 className="col-span-12 font-sans text-headline-md uppercase text-on-surface">Devices</h1>;

  if (state.status === "error") {
    return (
      <PageGrid>
        {header}
        <div role="alert" className="col-span-12 flex flex-col gap-space-sm rounded-xl bg-surface-container-low p-space-md">
          <StatusChip tone="error">ERROR</StatusChip>
          <p className="font-body-md text-on-surface">Could not load devices.</p>
          <Button variant="secondary" className="self-start" onClick={reload}>
            RETRY
          </Button>
        </div>
      </PageGrid>
    );
  }

  if (state.status === "loading") {
    return (
      <PageGrid>
        {header}
        <section aria-label="Device list" aria-busy="true" className="col-span-12">
          <SkeletonList />
        </section>
      </PageGrid>
    );
  }

  if (allEntities(state).length === 0) {
    return (
      <PageGrid>
        {header}
        <p
          role="status"
          className="col-span-12 rounded border border-outline-variant/30 p-space-md font-label-caps text-label-caps uppercase text-on-surface-variant"
        >
          NO DEVICES
        </p>
      </PageGrid>
    );
  }

  return (
    <PageGrid>
      {header}
      <aside aria-label="Device search and filters" className="col-span-12 self-start xl:sticky xl:top-20 xl:col-span-4">
        <DeviceFilters filters={filters} onChange={setFilters} facets={facets} shown={shown.length} total={rows.length} />
      </aside>
      <section aria-label="Device list" className="col-span-12 flex flex-col gap-space-sm xl:col-span-8">
        {shown.length === 0 ? (
          <p
            role="status"
            className="rounded border border-outline-variant/30 p-space-md font-label-caps text-label-caps uppercase text-on-surface-variant"
          >
            NO MATCHING DEVICES
          </p>
        ) : (
          <ul aria-label="Devices" className="grid grid-cols-1 gap-space-sm md:grid-cols-2">
            {shown.map((row) => (
              <li key={row.entity.entityId}>
                <DeviceRow row={row} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageGrid>
  );
}
