import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi } from "@/api/ApiContext";
import { subscribeServerEvents } from "@/api/serverEvents";
import { ApiError, type LoggedEvent } from "@/api/types";
import { useEntities } from "@/state/EntitiesProvider";
import { fromLoggedEvent } from "@/state/feed";
import { useEntityName } from "@/features/names/useEntityName";
import {
  HISTORY_PAGE_SIZE,
  TYPE_GROUPS,
  TYPE_LABEL,
  buildEventsQuery,
  groupSelected,
  historyFiltersToParams,
  matchesFilters,
  parseHistoryFilters,
  rangeError,
  toggleGroup,
  type HistoryFilters,
} from "@/features/history/historyQuery";
import PageGrid from "@layouts/PageGrid";
import Button from "@components/controls/Button";
import FilterPill from "@components/controls/FilterPill";
import StatusChip from "@components/controls/StatusChip";

type HistoryStatus = "loading" | "ready" | "error" | "unavailable";

const LEVEL_TONE: Record<string, string> = {
  high: "text-error",
  medium: "text-tertiary-fixed-dim",
  low: "text-on-surface-variant",
};

const FIELD = "min-h-11 rounded-lg border border-outline-variant/40 bg-surface-container-low px-space-sm text-on-surface";
const LABEL = "flex flex-col gap-space-xs font-label-caps text-label-caps uppercase text-on-surface-variant";

function SkeletonRows() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-space-xs">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-container motion-reduce:animate-none" />
      ))}
    </div>
  );
}

// Feature 141: the event log, filtered by type, device and date (URL query), newest first, 100 rows per page.
export default function HistoryPage() {
  const api = useApi();
  const { state } = useEntities();
  const names = useEntityName();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<LoggedEvent[]>([]);
  const [status, setStatus] = useState<HistoryStatus>("loading");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const filters = useMemo(() => parseHistoryFilters(searchParams), [searchParams]);
  const filterKey = historyFiltersToParams(filters).toString();
  const invalidRange = rangeError(filters);

  // The request follows the URL filters. A bad range sends nothing.
  useEffect(() => {
    const current = parseHistoryFilters(new URLSearchParams(filterKey));
    if (rangeError(current)) return;
    let active = true;
    setStatus("loading");
    api.listEvents(buildEventsQuery(current)).then(
      (events) => {
        if (!active) return;
        setRows(events);
        setHasMore(events.length === HISTORY_PAGE_SIZE);
        setStatus("ready");
      },
      (err: unknown) => {
        if (!active) return;
        setRows([]);
        setHasMore(false);
        setStatus(err instanceof ApiError && err.kind === "not_found" ? "unavailable" : "error");
      },
    );
    return () => {
      active = false;
    };
  }, [api, filterKey, attempt]);

  // Live: on the first page without an upper date bound, matching `event` rows are prepended.
  useEffect(
    () =>
      subscribeServerEvents((serverEvent) => {
        if (serverEvent.type !== "event") return;
        const current = parseHistoryFilters(new URLSearchParams(filterKey));
        if (current.to || !matchesFilters(serverEvent.event, current)) return;
        setRows((existing) => {
          if (existing.length > HISTORY_PAGE_SIZE || existing.some((row) => row.id === serverEvent.event.id)) return existing;
          return [serverEvent.event, ...existing];
        });
      }),
    [filterKey],
  );

  const setFilters = (next: HistoryFilters) => setSearchParams(historyFiltersToParams(next));

  const loadMore = () => {
    const last = rows[rows.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    api.listEvents(buildEventsQuery(filters, last.id)).then(
      (more) => {
        setRows((existing) => [...existing, ...more.filter((row) => !existing.some((e) => e.id === row.id))]);
        setHasMore(more.length === HISTORY_PAGE_SIZE);
        setLoadingMore(false);
      },
      () => setLoadingMore(false),
    );
  };

  const deviceOptions = useMemo(
    () =>
      Object.values(state.entities)
        .map((entity) => ({ id: entity.entityId, label: names.displayName(entity) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [state.entities, names],
  );

  const lookup = (entityId: string) => state.entities[entityId];

  return (
    <PageGrid>
      <div className="col-span-12 flex flex-col gap-space-xs">
        <h1 className="font-label-caps text-label-caps uppercase text-on-surface-variant">HISTORY</h1>
      </div>

      <section aria-label="History filters" className="col-span-12 flex flex-col gap-space-sm">
        <div role="group" aria-label="Event types" className="flex flex-wrap gap-space-xs">
          {TYPE_GROUPS.map((group) => (
            <FilterPill
              key={group.key}
              selected={groupSelected(filters, group)}
              onClick={() => setFilters({ ...filters, types: toggleGroup(filters, group) })}
            >
              {group.label}
            </FilterPill>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-space-sm">
          <label className={LABEL}>
            DEVICE
            <select
              aria-label="Device"
              value={filters.entityId ?? ""}
              onChange={(e) => setFilters({ ...filters, entityId: e.target.value || null })}
              className={`${FIELD} font-sans text-body-md`}
            >
              <option value="">All devices</option>
              {deviceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            FROM
            <input
              type="date"
              aria-label="From"
              value={filters.from ?? ""}
              onChange={(e) => setFilters({ ...filters, from: e.target.value || null })}
              className={`${FIELD} font-mono text-body-md`}
            />
          </label>
          <label className={LABEL}>
            TO
            <input
              type="date"
              aria-label="To"
              value={filters.to ?? ""}
              onChange={(e) => setFilters({ ...filters, to: e.target.value || null })}
              className={`${FIELD} font-mono text-body-md`}
            />
          </label>
        </div>
        {invalidRange && (
          <p role="alert" className="font-label-caps text-label-caps uppercase text-error">
            {invalidRange}
          </p>
        )}
      </section>

      <section aria-label="History results" className="col-span-12 flex flex-col gap-space-sm">
        {status === "loading" && <SkeletonRows />}

        {status === "unavailable" && (
          <p role="status" className="rounded border border-outline-variant/30 p-space-md font-label-caps text-label-caps uppercase text-on-surface-variant">
            HISTORY NOT AVAILABLE ON THIS SERVER
          </p>
        )}

        {status === "error" && (
          <div role="alert" className="flex flex-col gap-space-sm rounded-xl bg-surface-container-low p-space-md">
            <StatusChip tone="error">ERROR</StatusChip>
            <p className="font-label-caps text-label-caps uppercase text-on-surface">HISTORY UNAVAILABLE</p>
            <Button variant="secondary" className="self-start" onClick={() => setAttempt((n) => n + 1)}>
              RETRY
            </Button>
          </div>
        )}

        {status === "ready" && rows.length === 0 && (
          <p role="status" className="rounded border border-outline-variant/30 p-space-md font-label-caps text-label-caps uppercase text-on-surface-variant">
            NO EVENTS FOR THESE FILTERS
          </p>
        )}

        {status === "ready" && rows.length > 0 && (
          <ul aria-label="Event history" role="list" className="flex flex-col gap-space-xs">
            {rows.map((event) => {
              const mapped = fromLoggedEvent(event, lookup);
              const device = mapped?.entityId ? names.displayName(mapped) : "SYSTEM";
              const isAlert = event.type === "alert" || event.type === "alert_acked";
              return (
                <li
                  key={event.id}
                  data-type={event.type}
                  className="flex flex-wrap items-center gap-space-sm rounded border border-outline-variant/30 p-space-sm"
                >
                  <time dateTime={event.ts} className="shrink-0 font-mono text-label-caps text-on-surface-variant">
                    {new Date(event.ts).toLocaleString("en-GB", { hour12: false })}
                  </time>
                  <span className="shrink-0 font-label-caps text-label-caps uppercase text-primary-container">
                    {TYPE_LABEL[event.type] ?? event.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-sans text-body-md text-on-surface">
                    {device} {mapped?.value ?? ""}
                  </span>
                  {isAlert && event.level && (
                    <span className={`shrink-0 font-label-caps text-label-caps uppercase ${LEVEL_TONE[event.level] ?? ""}`}>
                      {event.level}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {status === "ready" && hasMore && (
          <Button variant="secondary" className="self-start" onClick={loadMore} disabled={loadingMore}>
            LOAD MORE
          </Button>
        )}
      </section>
    </PageGrid>
  );
}
