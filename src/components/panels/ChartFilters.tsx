import { useState } from "react";
import FilterPill from "@components/controls/FilterPill";
import Button from "@components/controls/Button";
import Dialog from "@components/controls/Dialog";
import { ZoneDot } from "@/features/zones/ZoneDot";
import {
  EMPTY_FILTERS,
  isFiltered,
  type ChartFilters as Filters,
  type DeviceKind,
  type FacetCounts,
  type Visibility,
} from "@/features/telemetry/widgetFilters";

// Feature 118/163: search above the device list, a FILTERS button that opens the filter modal, the counter and CLEAR.
// Controlled: the grid owns the filters. The modal edits a draft and only APPLY writes it back.
const STATUS: readonly { id: Visibility; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "added", label: "ADDED" },
  { id: "notAdded", label: "NOT ADDED" },
];

function toggleIn<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

// Number of active filter values, shown as "FILTERS · n".
function activeCount(f: Filters): number {
  return f.zones.length + f.categories.length + f.kinds.length + (f.visibility === "all" ? 0 : 1);
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
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(filters);
  const count = activeCount(filters);

  const openModal = () => {
    setDraft(filters);
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);
  const apply = () => {
    onChange(draft);
    setModalOpen(false);
  };

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
      <div className="flex flex-wrap items-center justify-between gap-space-xs">
        <div className="flex items-center gap-space-xs">
          <Button variant="secondary" aria-expanded={modalOpen} onClick={openModal}>
            {count > 0 ? `FILTERS · ${count}` : "FILTERS"}
          </Button>
          <p role="status" aria-label="Devices shown" className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            {`${shown} OF ${total}`}
          </p>
        </div>
        <Button variant="secondary" disabled={!isFiltered(filters)} onClick={() => onChange(EMPTY_FILTERS)}>
          CLEAR
        </Button>
      </div>
      {modalOpen && (
        <Dialog title="FILTERS" onClose={closeModal}>
          <div className="flex flex-col gap-space-md">
            <div role="group" aria-label="Zones" className="flex flex-wrap gap-space-xs">
              {facets.zones.map((zone) => {
                const label = zone.name.toUpperCase();
                return (
                  <FilterPill
                    key={zone.id}
                    selected={draft.zones.includes(zone.id)}
                    count={zone.count}
                    aria-label={`${label} ${zone.count}`}
                    onClick={() => setDraft({ ...draft, zones: toggleIn(draft.zones, zone.id) })}
                  >
                    <ZoneDot areaId={zone.id} />
                    {label}
                  </FilterPill>
                );
              })}
            </div>
            <div role="group" aria-label="Fields" className="flex flex-wrap gap-space-xs">
              {facets.categories.map((category) => (
                <FilterPill
                  key={category.id}
                  selected={draft.categories.includes(category.id)}
                  count={category.count}
                  aria-label={`${category.label} ${category.count}`}
                  onClick={() => setDraft({ ...draft, categories: toggleIn(draft.categories, category.id) })}
                >
                  {category.label}
                </FilterPill>
              ))}
            </div>
            <div role="group" aria-label="Kind" className="flex flex-wrap gap-space-xs">
              {facets.kinds.map((kind) => (
                <FilterPill
                  key={kind.id}
                  selected={draft.kinds.includes(kind.id)}
                  count={kind.count}
                  aria-label={`${kind.label} ${kind.count}`}
                  onClick={() => setDraft({ ...draft, kinds: toggleIn<DeviceKind>(draft.kinds, kind.id) })}
                >
                  {kind.label}
                </FilterPill>
              ))}
            </div>
            <div role="group" aria-label="Status" className="flex flex-wrap gap-space-xs">
              {STATUS.map((option) => (
                <FilterPill
                  key={option.id}
                  selected={draft.visibility === option.id}
                  aria-label={option.label}
                  onClick={() => setDraft({ ...draft, visibility: option.id })}
                >
                  {option.label}
                </FilterPill>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-space-xs">
            <Button variant="secondary" onClick={closeModal}>
              CLOSE
            </Button>
            <Button onClick={apply}>APPLY</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
