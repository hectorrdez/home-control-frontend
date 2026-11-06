import { describe, expect, it } from "vitest";
import { parseStateChanged, streamUrl } from "./liveSubscribe";

describe("live stream helpers", () => {
  it("passes the token as ?token= and encodes it", () => {
    expect(streamUrl("", "a b&c")).toBe("/api/stream?token=a%20b%26c");
  });

  it("parses a normalized entity and rejects malformed payloads", () => {
    expect(parseStateChanged('{"entityId":"light.x","state":"on"}')).toEqual({ entityId: "light.x", state: "on" });
    expect(parseStateChanged("not json")).toBeNull();
    expect(parseStateChanged('{"state":"on"}')).toBeNull();
    expect(parseStateChanged(undefined)).toBeNull();
  });
});
