import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import type { FeedEvent } from "@/state/feed";
import { ToastProvider } from "@components/feedback/Toast";
import EventFeed from "./EventFeed";

function fakeApi(): HomeApi {
  return {
    getStatus: vi.fn(),
    getAreas: vi.fn(async () => []),
    getEntities: vi.fn(),
    runAction: vi.fn(),
    getHistory: vi.fn(),
    listEvents: vi.fn(async () => []),
    getAliases: vi.fn(async () => []),
    setAlias: vi.fn(),
    deleteAlias: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  } as unknown as HomeApi;
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <ApiProvider api={fakeApi()}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>{children}</AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>
  );
}

const event = (entityId: string, value: string, area: string | null, at: string): FeedEvent => ({
  key: `${entityId}@${at}`,
  entityId,
  name: entityId.split(".")[1].replace(/_/g, " "),
  value,
  area,
  at,
});

const areaName = (id: string | null) => (id === "kitchen" ? "Kitchen" : "Unassigned");

describe("EventFeed", () => {
  afterEach(cleanup);

  it("shows the waiting message when no events have happened yet", () => {
    render(
      <Providers>
        <EventFeed events={[]} areaName={areaName} />
      </Providers>,
    );
    expect(screen.getByRole("region", { name: "Event feed" })).toBeTruthy();
    expect(screen.getByText("WAITING FOR EVENTS")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Event feed items" })).toBeNull();
    expect(screen.getByText("Session only, not stored")).toBeTruthy();
  });

  it("lists events newest first with the area and a time", () => {
    const events = [
      event("light.kitchen_ceiling", "on", "kitchen", "2026-11-06T10:05:00.000Z"),
      event("lock.front_door", "locked", null, "2026-11-06T10:00:00.000Z"),
      event("binary_sensor.motion", "on", "kitchen", "2026-11-06T09:00:00.000Z"),
      event("cover.blinds", "closing", "kitchen", "2026-11-06T08:00:00.000Z"),
      event("climate.heat", "heating", "kitchen", "2026-11-06T07:00:00.000Z"),
      event("switch.kettle", "off", "kitchen", "2026-11-06T06:00:00.000Z"),
      event("unknown.thing", "x", null, "2026-11-06T05:00:00.000Z"),
    ];
    render(
      <Providers>
        <EventFeed events={events} areaName={areaName} />
      </Providers>,
    );
    const list = within(screen.getByRole("list", { name: "Event feed items" }));
    const items = list.getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items[0].textContent).toContain("kitchen ceiling on");
    expect(items[0].textContent).toContain("Kitchen");
    expect(items[1].textContent).toContain("Unassigned");
    expect(items[0].querySelector("time")?.getAttribute("datetime")).toBe("2026-11-06T10:05:00.000Z");
    expect(screen.queryByText("WAITING FOR EVENTS")).toBeNull();
  });

  it("renders events with a dedicated icon per domain and the fallback icon", () => {
    const events: FeedEvent[] = [
      event("binary_sensor.motion", "on", null, "2026-11-06T10:00:00.000Z"),
      event("unknown.thing", "x", null, "2026-11-06T10:01:00.000Z"),
    ];
    const { container } = render(
      <Providers>
        <EventFeed events={events} areaName={() => "Unassigned"} />
      </Providers>,
    );
    expect(container.querySelectorAll("li svg")).toHaveLength(2);
  });

  it("marks alert events with the bell, their level and the alert style (feature 129)", () => {
    const alert: FeedEvent = { ...event("lock.front_door", "Front door unlocked", "kitchen", "2026-11-07T10:00:00.000Z"), alert: "high" };
    render(
      <Providers>
        <EventFeed events={[alert]} areaName={areaName} />
      </Providers>,
    );
    const item = screen.getByRole("listitem");
    expect(item.getAttribute("data-alert")).toBe("high");
    expect(item.textContent).toContain("ALERT HIGH · Kitchen");
  });
});

describe("EventFeed expand (feature 153)", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  const sample = [event("light.kitchen_ceiling", "on", "kitchen", "2026-11-06T10:05:00.000Z")];

  it("opens a dialog with the list and collapses with the close button, restoring focus", () => {
    render(
      <Providers>
        <EventFeed events={sample} areaName={areaName} />
      </Providers>,
    );
    const trigger = screen.getByRole("button", { name: "Expand event feed" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Event feed" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(within(dialog).getByRole("list", { name: "Event feed items" })).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const close = within(dialog).getByRole("button", { name: "Close expanded event feed" });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(screen.queryByRole("dialog", { name: "Event feed" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("collapses on Escape and does not let the key reach other window listeners (SideDrawer)", () => {
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    render(
      <Providers>
        <EventFeed events={sample} areaName={areaName} />
      </Providers>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand event feed" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Event feed" })).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    window.removeEventListener("keydown", outer);
  });

  it("locks body scroll while expanded and restores it on collapse", () => {
    document.body.style.overflow = "auto";
    render(
      <Providers>
        <EventFeed events={sample} areaName={areaName} />
      </Providers>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand event feed" }));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.body.style.overflow).toBe("auto");
  });

  it("keeps the list live while expanded and shows a placeholder in the inline card", () => {
    const { rerender } = render(
      <Providers>
        <EventFeed events={sample} areaName={areaName} />
      </Providers>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand event feed" }));
    expect(screen.getByText("SHOWN IN EXPANDED VIEW")).toBeTruthy();
    rerender(
      <Providers>
        <EventFeed
          events={[event("lock.front_door", "locked", null, "2026-11-06T11:00:00.000Z"), ...sample]}
          areaName={areaName}
        />
      </Providers>,
    );
    const dialog = screen.getByRole("dialog", { name: "Event feed" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
  });
});
