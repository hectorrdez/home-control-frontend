import { describe, expect, it } from "vitest";
import { parseServerEvent, parseStateChanged, streamUrl } from "./liveSubscribe";

describe("live stream helpers", () => {
  it("passes the token as ?token= and the client id as ?clientId=, both encoded", () => {
    expect(streamUrl("", "a b&c", "id 1")).toBe("/api/stream?token=a%20b%26c&clientId=id%201");
  });

  it("parses a normalized entity and rejects malformed payloads", () => {
    expect(parseStateChanged('{"entityId":"light.x","state":"on"}')).toEqual({ entityId: "light.x", state: "on" });
    expect(parseStateChanged("not json")).toBeNull();
    expect(parseStateChanged('{"state":"on"}')).toBeNull();
    expect(parseStateChanged(undefined)).toBeNull();
  });
});

const event = {
  id: "7",
  ts: "2026-11-08T10:00:00Z",
  type: "action",
  source: "api",
  entityId: "light.a",
  level: null,
  clientId: null,
  clientName: null,
  payload: { action: "turn_on", ok: true },
};

const alert = {
  id: "a1",
  ruleId: null,
  entityId: "light.a",
  level: "high",
  text: "Light on",
  firedAt: "2026-11-08T10:00:00Z",
  ackedAt: null,
  ackedBy: null,
  clientId: null,
};

describe("parseServerEvent (feature 132)", () => {
  it("parses each of the five server frames", () => {
    expect(parseServerEvent("resource_changed", JSON.stringify({ resource: "aliases", keys: ["light.a"], by: null }))).toEqual({
      type: "resource_changed",
      resource: "aliases",
      keys: ["light.a"],
      by: null,
    });
    expect(parseServerEvent("event", JSON.stringify(event))).toEqual({ type: "event", event });
    expect(parseServerEvent("ha_link", JSON.stringify({ connected: false, at: "2026-11-08T10:00:00Z" }))).toEqual({
      type: "ha_link",
      connected: false,
      at: "2026-11-08T10:00:00Z",
    });
    expect(parseServerEvent("alert", JSON.stringify(alert))).toEqual({ type: "alert", alert });
    expect(parseServerEvent("alert_acked", JSON.stringify({ id: "a1", ackedAt: "t", ackedBy: "c1" }))).toEqual({
      type: "alert_acked",
      id: "a1",
      ackedAt: "t",
      ackedBy: "c1",
    });
  });

  it("returns null for malformed JSON, missing fields, bad enums and unknown frames", () => {
    expect(parseServerEvent("resource_changed", "not json")).toBeNull();
    expect(parseServerEvent("resource_changed", JSON.stringify({ resource: "nope", keys: [], by: null }))).toBeNull();
    expect(parseServerEvent("resource_changed", JSON.stringify({ resource: "settings", keys: "x", by: null }))).toBeNull();
    expect(parseServerEvent("event", JSON.stringify({ id: "1" }))).toBeNull();
    expect(parseServerEvent("ha_link", JSON.stringify({ connected: "yes", at: "t" }))).toBeNull();
    expect(parseServerEvent("alert", JSON.stringify({ ...alert, level: "extreme" }))).toBeNull();
    expect(parseServerEvent("alert_acked", JSON.stringify({ id: "a1" }))).toBeNull();
    expect(parseServerEvent("ping", "{}")).toBeNull();
    expect(parseServerEvent("event", undefined)).toBeNull();
  });
});
