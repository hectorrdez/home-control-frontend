import {
  Blinds,
  Cpu,
  Fan,
  Flame,
  Gauge,
  Lightbulb,
  Lock,
  Plug,
  Power,
  Radar,
  ScrollText,
  Sparkles,
  Speaker,
  Thermometer,
  Tv,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { createSyncedSetting, registerSyncedSetting, type SyncedSetting } from "@/features/settings/syncedSetting";

// Feature 155: the icon an actuator tile shows. The closed list below is the only set the picker offers; a stored
// name outside it is dropped on parse and the domain default applies.
export const TILE_ICONS = {
  Lightbulb,
  Plug,
  Fan,
  Thermometer,
  Blinds,
  Lock,
  Sparkles,
  ScrollText,
  Gauge,
  Radar,
  Cpu,
  Power,
  Tv,
  Speaker,
  Flame,
  Wind,
} as const satisfies Record<string, LucideIcon>;

export type TileIconName = keyof typeof TILE_ICONS;

export const TILE_ICON_NAMES = Object.keys(TILE_ICONS) as TileIconName[];

const DOMAIN_DEFAULT_ICON: Record<string, TileIconName> = {
  light: "Lightbulb",
  switch: "Plug",
  fan: "Fan",
  climate: "Thermometer",
  cover: "Blinds",
  lock: "Lock",
  scene: "Sparkles",
  script: "ScrollText",
  sensor: "Gauge",
  binary_sensor: "Radar",
};

export function defaultTileIcon(domain: string): TileIconName {
  return DOMAIN_DEFAULT_ICON[domain] ?? "Cpu";
}

export function tileIconComponent(name: TileIconName): LucideIcon {
  return TILE_ICONS[name];
}

export function isTileIconName(value: unknown): value is TileIconName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TILE_ICONS, value);
}

// The icon for an entity: the user's pick when it is still on the list, otherwise the domain default.
export function resolveTileIcon(domain: string, stored: TileIconName | undefined): TileIconName {
  return stored ?? defaultTileIcon(domain);
}

export interface StoredTileIcons {
  v: 1;
  icons: Record<string, TileIconName>; // entityId -> icon
}

export const EMPTY_TILE_ICONS: StoredTileIcons = { v: 1, icons: {} };

// Corrupt JSON, unknown schema version or a bad shape -> null (the store then has no picks). Unknown icon names are dropped.
export function parseStoredTileIcons(raw: unknown): StoredTileIcons | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object" || data === null) return null;
  const { v, icons } = data as { v?: unknown; icons?: unknown };
  if (v !== 1 || typeof icons !== "object" || icons === null || Array.isArray(icons)) return null;
  const kept: Record<string, TileIconName> = {};
  for (const [entityId, name] of Object.entries(icons as Record<string, unknown>)) {
    if (isTileIconName(name)) kept[entityId] = name;
  }
  return { v: 1, icons: kept };
}

export function withTileIcon(stored: StoredTileIcons | null, entityId: string, name: TileIconName): StoredTileIcons {
  return { v: 1, icons: { ...(stored?.icons ?? {}), [entityId]: name } };
}

// Feature 155: shared across devices and clients (backend settings, 134). The key is the only storage contract.
export const tileIconsSetting = createSyncedSetting<StoredTileIcons>({
  key: "devices.icons",
  parse: parseStoredTileIcons,
});
registerSyncedSetting(tileIconsSetting as SyncedSetting<unknown>);
