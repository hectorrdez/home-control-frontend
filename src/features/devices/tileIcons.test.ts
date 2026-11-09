import { afterEach, describe, expect, it } from "vitest";
import {
  EMPTY_TILE_ICONS,
  TILE_ICON_NAMES,
  defaultTileIcon,
  isTileIconName,
  parseStoredTileIcons,
  resolveTileIcon,
  tileIconsSetting,
  withTileIcon,
} from "./tileIcons";

const CACHE_KEY = "hc.setting.devices.icons";

afterEach(() => {
  window.localStorage.clear();
  tileIconsSetting.forget();
});

describe("tile icon defaults (155)", () => {
  it("gives every controllable domain its own default icon from the closed list", () => {
    expect(defaultTileIcon("light")).toBe("Lightbulb");
    expect(defaultTileIcon("switch")).toBe("Plug");
    expect(defaultTileIcon("fan")).toBe("Fan");
    expect(defaultTileIcon("climate")).toBe("Thermometer");
    expect(defaultTileIcon("cover")).toBe("Blinds");
    expect(defaultTileIcon("lock")).toBe("Lock");
    expect(defaultTileIcon("scene")).toBe("Sparkles");
    expect(defaultTileIcon("script")).toBe("ScrollText");
    for (const domain of ["light", "switch", "fan", "climate", "cover", "lock", "scene", "script", "unknown_domain"]) {
      expect(TILE_ICON_NAMES).toContain(defaultTileIcon(domain));
    }
  });

  it("falls back to the generic icon for a domain without a default", () => {
    expect(defaultTileIcon("vacuum")).toBe("Cpu");
  });

  it("uses the stored pick over the domain default and the default when nothing is stored", () => {
    expect(resolveTileIcon("light", undefined)).toBe("Lightbulb");
    expect(resolveTileIcon("light", "Fan")).toBe("Fan");
  });

  it("only accepts names from the closed list", () => {
    expect(isTileIconName("Fan")).toBe(true);
    expect(isTileIconName("Bogus")).toBe(false);
    expect(isTileIconName("constructor")).toBe(false);
    expect(isTileIconName(undefined)).toBe(false);
  });
});

describe("tile icon setting (155, createSyncedSetting)", () => {
  it("has no picks until the user chooses one", () => {
    expect(tileIconsSetting.get()).toBeNull();
    expect(parseStoredTileIcons(JSON.stringify({ v: 1, icons: {} }))).toEqual(EMPTY_TILE_ICONS);
  });

  it("persists a pick under the setting cache key and reads it back after a reload", () => {
    tileIconsSetting.set(withTileIcon(tileIconsSetting.get(), "light.kitchen_ceiling", "Fan"));
    const raw = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}").value;
    expect(raw).toEqual({ v: 1, icons: { "light.kitchen_ceiling": "Fan" } });

    tileIconsSetting.forget(); // simulates a reload: memory dropped, the cache is read again
    expect(tileIconsSetting.get()?.icons["light.kitchen_ceiling"]).toBe("Fan");
  });

  it("keeps the other devices' picks when one is changed", () => {
    tileIconsSetting.set(withTileIcon(null, "light.a", "Fan"));
    tileIconsSetting.set(withTileIcon(tileIconsSetting.get(), "switch.b", "Tv"));
    expect(tileIconsSetting.get()?.icons).toEqual({ "light.a": "Fan", "switch.b": "Tv" });
  });

  it("drops stored names that are no longer on the list and keeps the valid ones", () => {
    const parsed = parseStoredTileIcons(JSON.stringify({ v: 1, icons: { "light.a": "Fan", "light.b": "Removed" } }));
    expect(parsed?.icons).toEqual({ "light.a": "Fan" });
  });

  it("treats corrupt JSON, another schema version or a bad shape as no stored picks", () => {
    expect(parseStoredTileIcons("{not json")).toBeNull();
    expect(parseStoredTileIcons(JSON.stringify({ v: 2, icons: {} }))).toBeNull();
    expect(parseStoredTileIcons(JSON.stringify({ v: 1, icons: [] }))).toBeNull();
    expect(parseStoredTileIcons(null)).toBeNull();
  });
});
