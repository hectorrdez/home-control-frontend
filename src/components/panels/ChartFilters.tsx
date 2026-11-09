import FilterPill from "@components/controls/FilterPill";
import Button from "@components/controls/Button";
import { ZoneDot } from "@/features/zones/ZoneDot";
import {
  EMPTY_FILTERS,
  isFiltered,
  type ChartFilters as Filters,
  type FacetCounts,
  type Visibility,
} from "@/features/telemetry/widgetFilters";

// Feature 118: search, zone/category/visibility filters for the CHARTS side panel. Controlled; the grid owns the state.
const VISIBILITY: readonly { id: Visibility; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "on", label: "ON" },
  { id: "off", label: "OFF" },
];

function toggleIn<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

interface ChartFiltersProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  facets: FacetCounts;
  shown: number;
  total: number;
  // Feature 137: reports search focus so a remote filter change waits until the input is left.
  onSearchFocusChange?: (focused: boolean) => void;
}

export default function ChartFilters({ filters, onChange, facets, shown, total, onSearchFocusChange }: ChartFiltersProps) {
  return (
    <div className="flex flex-col gap-space-sm">
      <input
        type="search"
        aria-label="Search charts"
        placeholder="Search"
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
        onFocus={() => onSearchFocusChange?.(true)}
        onBlur={() => onSearchFocusChange?.(false)}
        className="min-h-11 w-full rounded border border-outline-variant bg-surface px-space-xs py-space-xs font-sans text-title-md text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-container"
      />
      <div className="flex items-center justify-between gap-space-xs">
        <p role="status" aria-label="Charts shown" className="font-label-caps text-label-caps uppercase text-on-surface-variant">
          {`${shown} OF ${total}`}
        </p>
        <Button variant="secondary" disabled={!isFiltered(filters)} onClick={() => onChange(EMPTY_FILTERS)}>
          CLEAR
        </Button>
      </div>
      <div role="group" aria-label="Zones" className="flex flex-wrap gap-space-xs">
        {facets.zones.map((zone) => {
          const label = zone.name.toUpperCase();
          return (
            <FilterPill
              key={zone.id}
              selected={filters.zones.includes(zone.id)}
              count={zone.count}
              aria-label={`${label} ${zone.count}`}
              onClick={() => onChange({ ...filters, zones: toggleIn(filters.zones, zone.id) })}
            >
              <ZoneDot areaId={zone.id} />
              {label}
            </FilterPill>
          );
        })}
      </div>
      <div role="group" aria-label="Categories" className="flex flex-wrap gap-space-xs">
        {facets.categories.map((category) => (
          <FilterPill
            key={category.id}
            selected={filters.categories.includes(category.id)}
            count={category.count}
            aria-label={`${category.label} ${category.count}`}
            onClick={() => onChange({ ...filters, categories: toggleIn(filters.categories, category.id) })}
          >
            {category.label}
          </FilterPill>
        ))}
      </div>
      <div role="group" aria-label="Visibility" className="flex flex-wrap gap-space-xs">
        {VISIBILITY.map((option) => (
          <FilterPill
            key={option.id}
            selected={filters.visibility === option.id}
            aria-label={option.label}
            onClick={() => onChange({ ...filters, visibility: option.id })}
          >
            {option.label}
          </FilterPill>
        ))}
      </div>
    </div>
  );
}
