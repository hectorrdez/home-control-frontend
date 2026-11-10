import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_FILTERS, activeFilters, filtersSetting, fromStoredFilters, parseStoredFilters, toStoredFilters } from "./widgetFilters";

const valid = { v: 1, query: "kitchen", zones: ["kitchen"], categories: ["temperature"], kinds: ["sensor"], visibility: "added" };

describe("parseStoredFilters", () => {
  it("accepts a valid v1 value", () => {
    expect(parseStoredFilters(valid)).toEqual(valid);
  });

  it("drops unknown categories and keeps the rest", () => {
    expect(parseStoredFilters({ ...valid, categories: ["temperature", "nope", 3] })?.categories).toEqual(["temperature"]);
  });

  it("rejects an overlong query, bad visibility, bad zones and a wrong version", () => {
    expect(parseStoredFilters({ ...valid, query: "x".repeat(101) })).toBeNull();
    expect(parseStoredFilters({ ...valid, visibility: "some" })).toBeNull();
    expect(parseStoredFilters({ ...valid, zones: "kitchen" })).toBeNull();
    expect(parseStoredFilters({ ...valid, zones: Array.from({ length: 51 }, (_, i) => `z${i}`) })).toBeNull();
    expect(parseStoredFilters({ ...valid, v: 2 })).toBeNull();
    expect(parseStoredFilters(null)).toBeNull();
  });
});

describe("stored filter helpers", () => {
  beforeEach(() => filtersSetting.forget());

  it("maps to and from the stored shape", () => {
    const f = { query: "a", zones: ["z"], categories: ["co2" as const], kinds: ["actuator" as const], visibility: "notAdded" as const };
    expect(fromStoredFilters(toStoredFilters(f))).toEqual(f);
    expect(fromStoredFilters(null)).toEqual(EMPTY_FILTERS);
  });

  it("drops zone ids that are not on screen, without changing the value", () => {
    const f = { ...EMPTY_FILTERS, zones: ["kitchen", "deleted"] };
    expect(activeFilters(f, new Set(["kitchen"])).zones).toEqual(["kitchen"]);
    expect(activeFilters(f, new Set(["kitchen", "deleted"]))).toBe(f);
  });
});
