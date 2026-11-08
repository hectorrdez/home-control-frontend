import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ClimateTooltip from "./ClimateTooltip";

afterEach(cleanup);
const name = (id: string | null) => (id === "kitchen" ? "Kitchen" : "Bedroom");

describe("ClimateTooltip (feature 131)", () => {
  it("lists every room, '--' for a room missing at the timestamp, and the total mean", () => {
    const row = { t: "2026-11-06T10:00:00.000Z", temp: 20, hum: 45, rooms: { kitchen: 20 }, humRooms: {} };
    render(<ClimateTooltip row={row} metric="temp" lines={[{ room: "kitchen", points: [] }, { room: "bedroom", points: [] }]} areaName={name} />);
    expect(screen.getByText("Kitchen 20.0 °C")).toBeTruthy();
    expect(screen.getByText("Bedroom -- °C")).toBeTruthy();
    expect(screen.getByText("TOTAL MEAN 20.0 °C")).toBeTruthy();
  });

  it("the humidity tooltip shows only humidity, per room and total mean", () => {
    const row = { t: "2026-11-06T10:00:00.000Z", temp: 20, hum: 45, rooms: { kitchen: 20 }, humRooms: { kitchen: 40 } };
    render(<ClimateTooltip row={row} metric="hum" lines={[{ room: "kitchen", points: [] }, { room: "bedroom", points: [] }]} areaName={name} />);
    expect(screen.getByText("Kitchen 40 %")).toBeTruthy();
    expect(screen.getByText("Bedroom -- %")).toBeTruthy();
    expect(screen.getByText("TOTAL MEAN 45 %")).toBeTruthy();
    expect(screen.queryByText(/°C/)).toBeNull();
  });

  it("renders nothing without a row", () => {
    const { container } = render(<ClimateTooltip row={undefined} metric="temp" lines={[]} areaName={name} />);
    expect(container.firstChild).toBeNull();
  });
});
