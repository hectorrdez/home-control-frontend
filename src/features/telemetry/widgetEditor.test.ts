import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import { deriveWidgets, type Widget } from "./widgets";
import {
  KIND_LABEL,
  canMove,
  moveWidget,
  resetWidgets,
  setKind,
  setVisible,
  setWide,
  validKinds,
} from "./widgetEditor";

function entity(id: string, attributes: Record<string, unknown>, area: string | null = null, name = id): Entity {
  return { entityId: id, domain: id.split(".")[0], name, state: "1", attributes, area, lastChanged: "2026-11-06T08:00:00.000Z" };
}

const temp = entity("sensor.kitchen_temp", { device_class: "temperature", unit_of_measurement: "°C" }, "kitchen", "Kitchen temp");
const humidity = entity("sensor.kitchen_humidity", { device_class: "humidity", unit_of_measurement: "%" }, "kitchen", "Kitchen humidity");
const power = entity("sensor.house_power", { device_class: "power", unit_of_measurement: "W" }, null, "House power");
const energy = entity("sensor.energy_today", { device_class: "energy", unit_of_measurement: "kWh" }, null, "Energy today");

function w(id: string, order: number, visible = true, extra: Partial<Widget> = {}): Widget {
  return { id, entityId: `sensor.${id}`, kind: "line", visible, order, ...extra };
}

const sample = (): Widget[] => [w("a", 0), w("b", 1, false), w("c", 2), w("d", 3)];

describe("KIND_LABEL", () => {
  it("labels every kind in caps", () => {
    expect(KIND_LABEL).toEqual({ line: "LINE", area: "AREA", bar: "BAR", gauge: "GAUGE" });
  });
});

describe("validKinds", () => {
  it("offers gauge but not bar for % sensors", () => {
    expect(validKinds(humidity)).toEqual(["line", "area", "gauge"]);
  });

  it("offers bar but not gauge for W and kWh sensors", () => {
    expect(validKinds(power)).toEqual(["line", "area", "bar"]);
    expect(validKinds(energy)).toEqual(["line", "area", "bar"]);
  });

  it("offers bar but not gauge when there is no unit", () => {
    expect(validKinds(entity("sensor.custom", { state_class: "measurement" }))).toEqual(["line", "area", "bar"]);
  });
});

describe("moveWidget", () => {
  it("swaps with the nearest visible neighbour in both directions", () => {
    const down = moveWidget(sample(), "a", 1);
    expect(down.map((x) => x.id)).toEqual(["c", "b", "a", "d"]);
    const up = moveWidget(sample(), "c", -1);
    expect(up.map((x) => x.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("skips hidden neighbours and keeps them in place", () => {
    const result = moveWidget(sample(), "a", 1);
    const hidden = result.find((x) => x.id === "b");
    expect(hidden?.visible).toBe(false);
    expect(result.map((x) => x.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("returns the input unchanged for first-up and last-down", () => {
    const widgets = sample();
    expect(moveWidget(widgets, "a", -1)).toBe(widgets);
    expect(moveWidget(widgets, "d", 1)).toBe(widgets);
  });

  it("returns the input unchanged for a hidden or unknown widget", () => {
    const widgets = sample();
    expect(moveWidget(widgets, "b", 1)).toBe(widgets);
    expect(moveWidget(widgets, "missing", 1)).toBe(widgets);
  });

  it("renumbers orders 0..n-1 in array order and does not mutate the input", () => {
    const widgets = [w("a", 10), w("b", 20, false), w("c", 30)];
    const snapshot = JSON.parse(JSON.stringify(widgets));
    const result = moveWidget(widgets, "c", -1);
    expect(result.map((x) => x.order)).toEqual([0, 1, 2]);
    expect(result.map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(widgets).toEqual(snapshot);
  });
});

describe("canMove", () => {
  it("matches whether moveWidget changes something", () => {
    const widgets = sample();
    expect(canMove(widgets, "a", -1)).toBe(false);
    expect(canMove(widgets, "a", 1)).toBe(true);
    expect(canMove(widgets, "d", 1)).toBe(false);
    expect(canMove(widgets, "d", -1)).toBe(true);
    expect(canMove(widgets, "b", 1)).toBe(false);
    expect(canMove(widgets, "missing", 1)).toBe(false);
  });

  it("is false for the only visible chart", () => {
    const widgets = [w("a", 0), w("b", 1, false)];
    expect(canMove(widgets, "a", -1)).toBe(false);
    expect(canMove(widgets, "a", 1)).toBe(false);
  });
});

describe("setVisible / setKind / setWide", () => {
  it("setVisible changes only the target", () => {
    const result = setVisible(sample(), "a", false);
    expect(result.find((x) => x.id === "a")?.visible).toBe(false);
    expect(result.filter((x) => x.id !== "a")).toEqual(sample().filter((x) => x.id !== "a"));
  });

  it("setKind changes only the target", () => {
    const result = setKind(sample(), "c", "area");
    expect(result.find((x) => x.id === "c")?.kind).toBe("area");
    expect(result.filter((x) => x.id !== "c")).toEqual(sample().filter((x) => x.id !== "c"));
  });

  it("setWide changes only the target", () => {
    const result = setWide(sample(), "d", true);
    expect(result.find((x) => x.id === "d")?.wide).toBe(true);
    expect(result.filter((x) => x.id !== "d")).toEqual(sample().filter((x) => x.id !== "d"));
  });

  it.each([
    ["setVisible", (ws: Widget[]) => setVisible(ws, "a", false)],
    ["setKind", (ws: Widget[]) => setKind(ws, "a", "bar")],
    ["setWide", (ws: Widget[]) => setWide(ws, "a", true)],
  ])("%s renumbers non-sequential orders 0..n-1 in sorted order", (_name, run) => {
    const widgets = [w("a", 10), w("b", 5, false), w("c", 30), w("d", 20)];
    const result = run(widgets);
    expect(result.map((x) => x.id)).toEqual(["b", "a", "d", "c"]);
    expect(result.map((x) => x.order)).toEqual([0, 1, 2, 3]);
    expect(widgets.map((x) => x.order)).toEqual([10, 5, 30, 20]);
  });

  it("setVisible, setKind and setWide apply the patch to the renumbered target", () => {
    const widgets = [w("a", 10), w("b", 5), w("c", 30), w("d", 20)];
    const hidden = setVisible(widgets, "c", false).find((x) => x.id === "c");
    expect(hidden).toMatchObject({ visible: false, order: 3 });
    expect(setKind(widgets, "d", "area").find((x) => x.id === "d")).toMatchObject({ kind: "area", order: 2 });
    expect(setWide(widgets, "b", true).find((x) => x.id === "b")).toMatchObject({ wide: true, order: 0 });
  });

  it("does not mutate the input and returns a new array", () => {
    const widgets = sample();
    const result = setKind(widgets, "a", "bar");
    expect(result).not.toBe(widgets);
    expect(widgets[0].kind).toBe("line");
  });

  it("returns the input unchanged for an unknown id", () => {
    const widgets = sample();
    expect(setVisible(widgets, "missing", false)).toBe(widgets);
    expect(setKind(widgets, "missing", "bar")).toBe(widgets);
    expect(setWide(widgets, "missing", true)).toBe(widgets);
  });
});

describe("resetWidgets", () => {
  it("equals deriveWidgets: all visible, default kinds, not wide, default order", () => {
    const sensors = [power, energy, humidity, temp];
    const result = resetWidgets(sensors);
    expect(result).toEqual(deriveWidgets(sensors));
    expect(result.every((x) => x.visible)).toBe(true);
    expect(result.every((x) => x.wide === undefined)).toBe(true);
  });
});
