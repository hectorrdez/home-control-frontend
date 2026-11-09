import type { EventsQuery } from "@/api/HomeApi";
import type { LoggedEvent } from "@/api/types";

// Feature 141: the history filters. The URL holds server event types (`types=action,alert`) and the device and
// date range; a pill selects a group of types (ALERTS = alert + alert_acked) and the query sends the whole group.
export const HISTORY_PAGE_SIZE = 100;

export interface TypeGroup {
  key: string;
  label: string;
  types: readonly string[];
}

export const TYPE_GROUPS: readonly TypeGroup[] = [
  { key: "actions", label: "ACTIONS", types: ["action"] },
  { key: "alerts", label: "ALERTS", types: ["alert", "alert_acked"] },
  { key: "availability", label: "AVAILABILITY", types: ["availability"] },
  { key: "ha_link", label: "HA LINK", types: ["ha_link"] },
  { key: "changes", label: "CHANGES", types: ["config_changed"] },
];

export interface HistoryFilters {
  types: string[]; // server types as written in the URL (empty = all)
  entityId: string | null;
  from: string | null; // yyyy-mm-dd
  to: string | null; // yyyy-mm-dd
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | null): string | null {
  return value && DATE_RE.test(value) ? value : null;
}

// Reads the URL. Unknown types are dropped; a malformed date is ignored.
export function parseHistoryFilters(params: URLSearchParams): HistoryFilters {
  const known = new Set(TYPE_GROUPS.flatMap((group) => group.types));
  const types = (params.get("types") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t, i, all) => known.has(t) && all.indexOf(t) === i);
  return {
    types,
    entityId: params.get("entity") || null,
    from: validDate(params.get("from")),
    to: validDate(params.get("to")),
  };
}

// Writes the filters back into the URL (empty values are removed so the URL stays short).
export function historyFiltersToParams(filters: HistoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.types.length) params.set("types", filters.types.join(","));
  if (filters.entityId) params.set("entity", filters.entityId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params;
}

// Group selection in the pills: a group is on when any of its types is in the filter.
export function groupSelected(filters: HistoryFilters, group: TypeGroup): boolean {
  return group.types.some((t) => filters.types.includes(t));
}

// Toggles a whole group; the types keep the order of TYPE_GROUPS.
export function toggleGroup(filters: HistoryFilters, group: TypeGroup): string[] {
  if (groupSelected(filters, group)) return filters.types.filter((t) => !group.types.includes(t));
  const next = TYPE_GROUPS.filter((g) => g.key === group.key || groupSelected(filters, g)).flatMap((g) => [...g.types]);
  return next;
}

// The request types: every type of each selected group (empty = all types, so the query omits `types`).
export function queryTypes(filters: HistoryFilters): string[] {
  return TYPE_GROUPS.filter((group) => groupSelected(filters, group)).flatMap((group) => [...group.types]);
}

// "from" must not be after "to"; the check blocks the request and shows the inline error.
export function rangeError(filters: HistoryFilters): string | null {
  if (filters.from && filters.to && filters.from > filters.to) return "FROM MUST BE BEFORE TO";
  return null;
}

// Builds the GET /api/events query. `to` is inclusive for the whole day; `before` is the paging cursor.
export function buildEventsQuery(filters: HistoryFilters, before?: string): EventsQuery {
  const types = queryTypes(filters);
  return {
    ...(types.length ? { types } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.from ? { from: `${filters.from}T00:00:00.000Z` } : {}),
    ...(filters.to ? { to: `${filters.to}T23:59:59.999Z` } : {}),
    ...(before ? { before } : {}),
    limit: HISTORY_PAGE_SIZE,
  };
}

// True when a live `event` row belongs in the view (used to prepend it on page 1 without an upper date bound).
export function matchesFilters(event: LoggedEvent, filters: HistoryFilters): boolean {
  const types = queryTypes(filters);
  if (types.length && !types.includes(event.type)) return false;
  if (filters.entityId && event.entityId !== filters.entityId) return false;
  const time = Date.parse(event.ts);
  if (filters.from && time < Date.parse(`${filters.from}T00:00:00.000Z`)) return false;
  if (filters.to && time > Date.parse(`${filters.to}T23:59:59.999Z`)) return false;
  return true;
}

// The short label of a row's type.
export const TYPE_LABEL: Record<string, string> = {
  action: "ACTION",
  alert: "ALERT",
  alert_acked: "ACKNOWLEDGED",
  availability: "AVAILABILITY",
  ha_link: "HA LINK",
  config_changed: "CHANGE",
};
