import StringUtils from "@utils/StringUtils";
import type { Entity } from "@/api/types";
import { useEntityName } from "@/features/names/useEntityName";
import { TILE_ICON_NAMES, tileIconComponent } from "@/features/devices/tileIcons";
import { useTileIcon } from "@/features/devices/useTileIcon";

// Feature 155: picks the icon of an actuator tile (closed list). Shown on the device detail page; saved through the
// synced setting, so the choice follows the user across clients.
export default function TileIconPicker({ entity }: { entity: Entity }) {
  const names = useEntityName();
  const [icon, setIcon] = useTileIcon(entity.entityId, entity.domain);
  return (
    <div role="group" aria-label={`Tile icon for ${names.displayName(entity)}`} className="flex flex-col gap-space-xs">
      <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">TILE ICON</span>
      <div className="grid grid-cols-4 gap-space-xs sm:grid-cols-8">
        {TILE_ICON_NAMES.map((name) => {
          const Icon = tileIconComponent(name);
          const selected = name === icon;
          return (
            <button
              key={name}
              type="button"
              aria-label={`Use ${name} icon`}
              aria-pressed={selected}
              onClick={() => setIcon(name)}
              className={StringUtils.JoinClassName(
                "flex h-11 items-center justify-center rounded border transition-colors duration-150 hover:bg-surface-container-high",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container",
                selected
                  ? "border-primary-container text-primary-container shadow-glow-primary"
                  : "border-outline-variant/30 text-on-surface-variant",
              )}
            >
              <Icon size={20} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
