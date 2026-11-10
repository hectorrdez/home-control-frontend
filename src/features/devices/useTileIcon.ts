import { useCallback } from "react";
import { useSyncedSetting } from "@/features/settings/useSyncedSetting";
import { resolveTileIcon, tileIconsSetting, withTileIcon, type TileIconName } from "./tileIcons";

// Feature 155: the tile icon of one entity (stored pick or the domain default) and the setter used by the picker.
export function useTileIcon(entityId: string, domain: string): [TileIconName, (name: TileIconName) => void] {
  const [stored, setStored] = useSyncedSetting(tileIconsSetting);
  const icon = resolveTileIcon(domain, stored?.icons[entityId]);
  const setIcon = useCallback(
    (name: TileIconName) => setStored(withTileIcon(tileIconsSetting.get(), entityId, name)),
    [entityId, setStored],
  );
  return [icon, setIcon];
}
