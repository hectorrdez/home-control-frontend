import { describe, expect, it } from "vitest";
import type { LoggedEvent } from "@/api/types";
import {
  buildEventsQuery,
  historyFiltersToParams,
  matchesFilters,
  parseHistoryFilters,
  queryTypes,
  rangeError,
  toggleGroup,
  TYPE_GROUPS,
  type HistoryFilters,
} from "./historyQuery";

const none: HistoryFilters = { types: [], entityId: null, from: null, to: null };

describe("history filters (141)", () => {
  it("round-trips the URL query and drops unknown types and malformed dates", () => {
    const params = new URLSearchParams("types=action,alert,bogus&entity=light.lamp&from=2026-11-01&to=nope");
    const filters = parseHistoryFilters(params);
    expect(filters).toEqual({ types: ["action", "alert"], entityId: "light.lamp", from: "2026-11-01", to: null });
    expect(historyFiltersToParams(filters).toString()).toBe("types=action%2Calert&entity=light.lamp&from=2026-11-01");
  });

  it("toggles a whole pill group: ALERTS sends alert and alert_acked together", () => {
    const alerts = TYPE_GROUPS.find((g) => g.key === "alerts")!;
    const on = toggleGroup(none, alerts);
    expect(on).toEqual(["alert", "alert_acked"]);
    expect(queryTypes({ ...none, types: on })).toEqual(["alert", "alert_acked"]);
    expect(toggleGroup({ ...none, types: on }, alerts)).toEqual([]);
  });

  it("builds the request: types, device, inclusive day range and the paging cursor", () => {
    const query = buildEventsQuery({ types: ["action"], entityId: "light.lamp", from: "2026-11-01", to: "2026-11-02" }, "42");
    expect(query).toEqual({
      types: ["action"],
      entityId: "light.lamp",
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-02T23:59:59.999Z",
      before: "42",
      limit: 100,
    });
    expect(buildEventsQuery(none)).toEqual({ limit: 100 });
  });

  it("blocks a range where from is after to", () => {
    expect(rangeError({ ...none, from: "2026-11-05", to: "2026-11-01" })).toBe("FROM MUST BE BEFORE TO");
    expect(rangeError({ ...none, from: "2026-11-01", to: "2026-11-05" })).toBeNull();
  });

  it("matches a live row against the filters", () => {
    const row = { id: "9", ts: "2026-11-08T10:00:00.000Z", type: "alert", entityId: "lock.door" } as LoggedEvent;
    expect(matchesFilters(row, none)).toBe(true);
    expect(matchesFilters(row, { ...none, types: ["action"] })).toBe(false);
    expect(matchesFilters(row, { ...none, entityId: "lock.other" })).toBe(false);
    expect(matchesFilters(row, { ...none, to: "2026-11-07" })).toBe(false);
  });
});
