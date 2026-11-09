import { describe, expect, it } from "vitest";
import type { Entity, LoggedEvent } from "@/api/types";
import { fromLoggedEvent, mergeFeeds, type FeedEvent } from "./feed";

function row(id: string, type: string, extra: Partial<LoggedEvent> = {}): LoggedEvent {
  return {
    id,
    ts: "2026-11-08T10:00:00.000Z",
    type,
    source: "api",
    entityId: null,
    level: null,
    clientId: null,
    clientName: null,
    payload: {},
    ...extra,
  };
}

const lamp: Entity = {
  entityId: "light.lamp",
  domain: "light",
  name: "Lamp",
  state: "on",
  attributes: {},
  area: "office",
  lastChanged: "2026-11-08T10:00:00.000Z",
  deviceName: "Lamp",
};

describe("fromLoggedEvent (140)", () => {
  it("maps each server type to the feed text", () => {
    const action = fromLoggedEvent(
      row("1", "action", { entityId: "light.lamp", clientName: "Kitchen tablet", payload: { action: "turn_on", ok: true } }),
      (id) => (id === lamp.entityId ? lamp : undefined),
    );
    expect(action).toMatchObject({ key: "srv:1", serverId: "1", entityId: "light.lamp", name: "Lamp", area: "office", value: "turn on by Kitchen tablet" });

    expect(fromLoggedEvent(row("2", "action", { entityId: "light.lamp", payload: { action: "turn_on", ok: false } }))?.value).toBe("turn on FAILED");
    expect(fromLoggedEvent(row("3", "availability", { entityId: "sensor.t", payload: { available: false } }))?.value).toBe("OFFLINE");
    expect(fromLoggedEvent(row("4", "availability", { entityId: "sensor.t", payload: { available: true } }))?.value).toBe("ONLINE");
    expect(fromLoggedEvent(row("5", "config_changed", { clientName: "Phone", payload: { resource: "aliases", keys: [] } }))).toMatchObject({
      name: "SYSTEM",
      entityId: "",
      value: "aliases changed by Phone",
    });
    expect(fromLoggedEvent(row("6", "alert", { entityId: "lock.door", level: "high", payload: { text: "Door opened" } }))).toMatchObject({
      alert: "high",
      value: "Door opened",
    });
    expect(fromLoggedEvent(row("7", "alert_acked", { entityId: "lock.door", clientName: "Phone" }))?.value).toBe("ALERT ACKNOWLEDGED by Phone");
    expect(fromLoggedEvent(row("8", "ha_link", { payload: { connected: false } }))?.value).toBe("HOME ASSISTANT LINK LOST");
    expect(fromLoggedEvent(row("9", "ha_link", { payload: { connected: true } }))?.value).toBe("HOME ASSISTANT LINK RESTORED");
  });

  it("ignores unknown types", () => {
    expect(fromLoggedEvent(row("10", "mystery"))).toBeNull();
  });
});

describe("mergeFeeds (140)", () => {
  const server = (id: string, at: string, extra: Partial<FeedEvent> = {}): FeedEvent => ({
    key: `srv:${id}`,
    serverId: id,
    entityId: "light.lamp",
    name: "Lamp",
    value: "turn on",
    area: null,
    at,
    ...extra,
  });
  const local = (value: string, at: string, extra: Partial<FeedEvent> = {}): FeedEvent => ({
    key: `light.lamp@${at}:${value}`,
    entityId: "light.lamp",
    name: "Lamp",
    value,
    area: null,
    at,
    ...extra,
  });

  it("dedupes server rows by id and keeps the newest first", () => {
    const feed = mergeFeeds([server("1", "2026-11-08T10:00:00.000Z")], [server("1", "2026-11-08T10:00:00.000Z"), server("2", "2026-11-08T10:01:00.000Z")]);
    expect(feed.map((e) => e.serverId)).toEqual(["2", "1"]);
  });

  it("drops a local state entry that duplicates a server action within 5 s, keeps the others", () => {
    const at = "2026-11-08T10:00:02.000Z";
    const feed = mergeFeeds([local("on", at), local("off", "2026-11-08T09:00:00.000Z")], [server("1", "2026-11-08T10:00:00.000Z")]);
    expect(feed.map((e) => e.key)).toEqual(["srv:1", "light.lamp@2026-11-08T09:00:00.000Z:off"]);
  });

  it("matches availability by transition and keeps local entries when there is no server row", () => {
    const at = "2026-11-08T10:00:01.000Z";
    const availability = server("2", "2026-11-08T10:00:00.000Z", { value: "OFFLINE" });
    const feed = mergeFeeds([local("disconnected", at), local("on", at)], [availability]);
    expect(feed.map((e) => e.value)).toEqual(["on", "OFFLINE"]);
    expect(mergeFeeds([local("disconnected", at)])).toHaveLength(1);
  });

  it("shows an alert once in server alerts mode (139): local alert entries are dropped when the server row matches", () => {
    const at = "2026-11-08T10:00:02.000Z";
    const row = server("9", "2026-11-08T10:00:00.000Z", { value: "Lamp left on", alert: "high" });
    const localAlert = local("Lamp left on", at, { key: "alert:abc", alert: "high" });
    const feed = mergeFeeds([localAlert, local("on", "2026-11-08T09:00:00.000Z")], [row]);
    expect(feed.map((e) => e.key)).toEqual(["srv:9", "light.lamp@2026-11-08T09:00:00.000Z:on"]);
  });

  it("matches an alert without entity by level and text, and keeps a different one", () => {
    const at = "2026-11-08T10:00:01.000Z";
    const row = server("9", "2026-11-08T10:00:00.000Z", { entityId: "", value: "Test", alert: "low" });
    const same = local("Test", at, { key: "alert:a", entityId: "", alert: "low" });
    const other = local("Other", at, { key: "alert:b", entityId: "", alert: "low" });
    expect(mergeFeeds([same, other], [row]).map((e) => e.key)).toEqual(["alert:b", "srv:9"]);
    expect(mergeFeeds([same]).map((e) => e.key)).toEqual(["alert:a"]);
  });
});
