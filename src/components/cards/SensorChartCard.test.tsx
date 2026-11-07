import { cleanup, render, screen } from "@testing-library/react";
import { cloneElement, createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import type { Entity } from "@/api/types";
import type { Point } from "@/features/telemetry/liveBuffer";
import type { Widget, WidgetKind } from "@/features/telemetry/widgets";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import SensorChartCard from "./SensorChartCard";

// Recharts measures its container; jsdom has no layout, so the container hands the chart a fixed size.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      createElement("div", null, cloneElement(children as ReactElement<{ width?: number; height?: number }>, { width: 300, height: 112 })),
  };
});

const entity: Entity = {
  entityId: "sensor.living_temperature",
  domain: "sensor",
  name: "Living temperature",
  state: "20",
  attributes: { unit_of_measurement: "C", device_class: "temperature" },
  area: "living_room",
  lastChanged: "2026-11-06T10:00:00.000Z",
};

const widget = (kind: WidgetKind): Widget => ({
  id: "widget.sensor.living_temperature",
  entityId: entity.entityId,
  kind,
  visible: true,
  order: 0,
});

// Two readings two minutes apart: the trend compares the latest value with the one a minute or more back.
const rising: Point[] = [
  { t: 0, v: 10 },
  { t: 120_000, v: 20 },
];

function renderCard(props: { points?: Point[]; kind?: WidgetKind; connection?: "open" | "reconnecting" | "closed"; entity?: Entity } = {}) {
  const api = createMockApi({ actionDelayMs: 0 });
  return render(
    <ApiProvider api={api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <SensorChartCard
              entity={props.entity ?? entity}
              areaName="Living room"
              widget={widget(props.kind ?? "line")}
              points={props.points ?? rising}
              connection={props.connection ?? "open"}
            />
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
}

afterEach(cleanup);

describe("SensorChartCard", () => {
  it("shows the name, area, latest value with its unit and the trend", () => {
    renderCard();
    const region = screen.getByRole("region", { name: "Living temperature" });
    expect(region.className).not.toContain("opacity-60");
    expect(screen.getByText("Living room")).toBeTruthy();
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getByText("UP +10 C")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Living temperature: 20 C, up" })).toBeTruthy();
  });

  it("reports no trend when there is not a minute of history yet", () => {
    renderCard({ points: [{ t: 0, v: 5 }] });
    expect(screen.getByText("--")).toBeTruthy();
    expect(screen.getByRole("img", { name: /flat|no trend yet/ })).toBeTruthy();
  });

  it("shows a flat trend when the value has not moved", () => {
    renderCard({ points: [{ t: 0, v: 20 }, { t: 120_000, v: 20 }] });
    expect(screen.getByText("FLAT 0 C")).toBeTruthy();
  });

  it("shows a falling trend", () => {
    renderCard({ points: [{ t: 0, v: 30 }, { t: 120_000, v: 25 }] });
    expect(screen.getByText("DOWN -5 C")).toBeTruthy();
  });

  it("shows a dash when there are no readings", () => {
    renderCard({ points: [] });
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
  });

  it("dims the card while the stream is not open", () => {
    renderCard({ connection: "reconnecting" });
    expect(screen.getByRole("region", { name: "Living temperature" }).className).toContain("opacity-60");
  });

  it.each<WidgetKind>(["line", "area", "bar", "gauge"])("renders a %s chart", (kind) => {
    renderCard({ kind, points: [{ t: 0, v: 60 }, { t: 120_000, v: 60 }] });
    expect(screen.getByRole("img", { name: /Living temperature/ })).toBeTruthy();
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("colours the gauge by level", () => {
    const { unmount } = renderCard({ kind: "gauge", points: [{ t: 0, v: 60 }] });
    expect(document.querySelector("svg")).not.toBeNull();
    unmount();

    renderCard({ kind: "gauge", points: [{ t: 0, v: 30 }] });
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("renders a gauge with no reading as zero", () => {
    renderCard({ kind: "gauge", points: [] });
    expect(document.querySelector("svg")).not.toBeNull();
  });

  describe("device name (feature 124)", () => {
    const withDevice = (deviceName: string | null | undefined, name = entity.name): Entity => ({
      ...entity,
      name,
      ...(deviceName === undefined ? {} : { deviceName }),
    });

    it("shows the cleaned device name before the zone", () => {
      renderCard({ entity: withDevice("ENCERRADO EN EL PATIO") });
      expect(screen.getByText("Encerrado en el patio · Living room")).toBeTruthy();
      expect(screen.getByRole("region", { name: "Living temperature" })).toBeTruthy();
      expect(screen.getByRole("img", { name: "Living temperature, Encerrado en el patio: 20 C, up" })).toBeTruthy();
    });

    it("shows only the zone when the device name is absent, null or blank", () => {
      for (const deviceName of [undefined, null, "   "]) {
        const { unmount } = renderCard({ entity: withDevice(deviceName) });
        expect(screen.getByText("Living room")).toBeTruthy();
        expect(screen.getByRole("region", { name: "Living temperature" })).toBeTruthy();
        unmount();
      }
    });

    it("omits the device when the visible title already contains it", () => {
      renderCard({ entity: withDevice("temperature") });
      expect(screen.getByText("Living room")).toBeTruthy();
      expect(screen.getByRole("region", { name: "Living temperature" })).toBeTruthy();
    });

    it("compares the title with the device name accent- and case-insensitively", () => {
      renderCard({ entity: withDevice("BATERIA", "Sensor de batería") });
      expect(screen.getByText("Living room")).toBeTruthy();
      expect(screen.getByRole("region", { name: "Sensor de batería" })).toBeTruthy();
    });
  });

  it("drops the unit when the entity has none", () => {
    renderCard({
      entity: { ...entity, attributes: {} },
      points: [{ t: 0, v: 3 }],
    });
    expect(screen.getByRole("img", { name: "Living temperature: 3, no trend yet" })).toBeTruthy();
  });
});
