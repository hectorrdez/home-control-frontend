import StringUtils from "@utils/StringUtils";
import Card from "@components/cards/Card";
import StatusChip from "@components/controls/StatusChip";
import type { Entity } from "@/api/types";
import { useEntities } from "@/state/EntitiesProvider";
import { useToast } from "@components/feedback/Toast";
import EditableName from "@components/controls/EditableName";
import { useEntityName } from "@/features/names/useEntityName";
import type { Intent } from "@/state/actions";
import DeviceControls from "./DeviceControls";
import { describeState, domainHue, domainIcon } from "./deviceState";

type DeviceModuleProps = {
  entity: Entity;
  areaName: string;
  drawText?: string; // linked plug power sensor, e.g. "42 W" (103 mapping)
};

const beaconTone = {
  primary: "bg-primary-container shadow-glow-primary",
  secondary: "bg-secondary shadow-glow-secondary",
  tertiary: "bg-tertiary-fixed-dim shadow-glow-tertiary",
};

const hueText = {
  primary: "text-primary-container",
  secondary: "text-secondary",
  tertiary: "text-tertiary-fixed-dim",
};

// Left indicator on ON cards (only the left edge takes the hue).
const hueBorderLeft = {
  primary: "border-l-primary-container",
  secondary: "border-l-secondary",
  tertiary: "border-l-tertiary-fixed-dim",
};

// Icon tile halo, lit only while the device is ON.
const hueHalo = {
  primary: "shadow-glow-primary",
  secondary: "shadow-glow-secondary",
  tertiary: "shadow-glow-tertiary",
};

// Surface wash on ON cards: hue fades into the card surface.
const hueWash = {
  primary: "from-primary-container/10",
  secondary: "from-secondary/10",
  tertiary: "from-tertiary-fixed-dim/10",
};

// Device card (103 read-only, 104 controls). Failed actions roll back and show an error toast.
export default function DeviceModule({ entity, areaName, drawText }: DeviceModuleProps) {
  const Icon = domainIcon(entity.domain);
  const hue = domainHue(entity.domain);
  const view = describeState(entity);
  const { state, sendIntent } = useEntities();
  const toast = useToast();
  const names = useEntityName();
  const pending = Boolean(state.pending[entity.entityId]);
  const send = (intent: Intent) => {
    void sendIntent(entity, intent).then((ok) => {
      if (!ok) toast.show(`Could not update ${names.displayName(entity)}`);
    });
  };
  const visualState = view.unavailable ? "unavailable" : view.on ? "on" : "off";

  return (
    <Card
      role="article"
      aria-label={names.displayName(entity)}
      data-state={visualState}
      className={StringUtils.JoinClassName(
        "device-card flex flex-col gap-space-sm transition duration-150 motion-reduce:transition-none",
        "hover:-translate-y-0.5 hover:bg-surface-container-high motion-reduce:hover:translate-y-0",
        view.unavailable
          ? "!border-error/40 bg-surface-container-low"
          : view.on
            ? `border-outline-variant/30 border-l-2 bg-linear-to-br to-surface-container ${hueWash[hue]} ${hueBorderLeft[hue]}`
            : "border-outline-variant/30",
      )}
    >
      <div className="flex items-center gap-space-sm">
        <div
          data-testid="device-icon"
          className={StringUtils.JoinClassName(
            "flex h-11 w-11 min-w-11 items-center justify-center rounded-lg bg-surface-container-lowest transition duration-150 motion-reduce:transition-none",
            view.on ? `${hueText[hue]} ${hueHalo[hue]}` : "text-on-surface-variant",
          )}
        >
          <Icon size={22} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <EditableName
            entityId={entity.entityId}
            shown={names.shortName(entity)}
            label={names.displayName(entity)}
            raw={entity.name}
            canRename={names.canRename}
            onRename={(alias) => names.renameEntity(entity, alias)}
            textClassName="font-sans text-title-md font-semibold text-on-surface"
          />
          <span className="block truncate font-mono text-label-caps uppercase text-on-surface-variant">
            {`${areaName} // ${entity.entityId}`}
          </span>
        </div>
      </div>
      <p
        className={StringUtils.JoinClassName(
          "flex items-center gap-space-xs font-mono text-telemetry-md",
          view.unavailable ? "text-error" : view.on ? hueText[hue] : "text-on-surface-variant",
        )}
      >
        <span
          aria-hidden="true"
          className={StringUtils.JoinClassName(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            view.unavailable ? "bg-error" : view.on ? beaconTone[hue] : "bg-outline-variant",
          )}
        />
        <span>{view.text}</span>
      </p>
      {drawText && (
        <p className="font-mono text-label-caps uppercase text-on-surface-variant">{`DRAW METRIC ${drawText}`}</p>
      )}
      <DeviceControls entity={entity} disabled={pending} send={send} />
      {pending && <StatusChip tone="primary">SENDING</StatusChip>}
    </Card>
  );
}
