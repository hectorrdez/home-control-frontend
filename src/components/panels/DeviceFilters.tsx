import FilterPill from "@components/controls/FilterPill";
import Button from "@components/controls/Button";
import {
  EMPTY_DEVICE_FILTERS,
  isFiltered,
  type DeviceFacets,
  type DeviceFilters as Filters,
  type DeviceKind,
} from "@/features/devices/deviceFilters";

// Feature 121: search, area/type/kind filters for the /devices list. Controlled; the page owns the state.
const KINDS: readonly { id: DeviceKind; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "interactive", label: "INTERACTIVE" },
  { id: "readonly", label: "READ-ONLY" },
];

function toggleIn(list: readonly string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

interface DeviceFiltersProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  facets: DeviceFacets;
  shown: number;
  total: number;
}

export default function DeviceFilters({ filters, onChange, facets, shown, total }: DeviceFiltersProps) {
  return (
    <div className="flex flex-col gap-space-sm">
      <input
        type="search"
        aria-label="Search devices"
        placeholder="Search"
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
        className="min-h-11 w-full rounded border border-outline-variant bg-surface px-space-xs py-space-xs font-sans text-title-md text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-container"
      />
      <div className="flex items-center justify-between gap-space-xs">
        <p role="status" aria-label="Devices shown" className="font-label-caps text-label-caps uppercase text-on-surface-variant">
          {`${shown} OF ${total}`}
        </p>
        <Button variant="secondary" disabled={!isFiltered(filters)} onClick={() => onChange(EMPTY_DEVICE_FILTERS)}>
          CLEAR
        </Button>
      </div>
      <div role="group" aria-label="Areas" className="flex flex-wrap gap-space-xs">
        {facets.areas.map((area) => {
          const label = area.name.toUpperCase();
          return (
            <FilterPill
              key={area.id}
              selected={filters.areas.includes(area.id)}
              count={area.count}
              aria-label={`${label} ${area.count}`}
              onClick={() => onChange({ ...filters, areas: toggleIn(filters.areas, area.id) })}
            >
              {label}
            </FilterPill>
          );
        })}
      </div>
      <div role="group" aria-label="Types" className="flex flex-wrap gap-space-xs">
        {facets.domains.map((domain) => (
          <FilterPill
            key={domain.id}
            selected={filters.domains.includes(domain.id)}
            count={domain.count}
            aria-label={`${domain.label} ${domain.count}`}
            onClick={() => onChange({ ...filters, domains: toggleIn(filters.domains, domain.id) })}
          >
            {domain.label}
          </FilterPill>
        ))}
      </div>
      <div role="group" aria-label="Kind" className="flex flex-wrap gap-space-xs">
        {KINDS.map((option) => (
          <FilterPill
            key={option.id}
            selected={filters.kind === option.id}
            aria-label={option.label}
            onClick={() => onChange({ ...filters, kind: option.id })}
          >
            {option.label}
          </FilterPill>
        ))}
      </div>
    </div>
  );
}
