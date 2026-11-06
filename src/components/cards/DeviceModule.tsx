import StringUtils from "@utils/StringUtils";
import type { Entity } from "@/api/types";
import { describeState, domainHue, domainIcon } from "./deviceState";

type DeviceModuleProps = {
  entity: Entity;
  areaName: string;
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

const hueBorder = {
  primary: "border-primary-container",
  secondary: "border-secondary",
  tertiary: "border-tertiary-fixed-dim",
};

// Read-only device card (feature 103). Controls arrive in 104.
export default function DeviceModule({ entity, areaName }: DeviceModuleProps) {
  const Icon = domainIcon(entity.domain);
  const hue = domainHue(entity.domain);
  const view = describeState(entity);

  return (
    <article
      aria-label={entity.name}
      className={StringUtils.JoinClassName(
        "flex flex-col gap-space-sm rounded border border-outline-variant/30 bg-surface-container p-space-md transition-colors duration-150 hover:bg-surface-container-high",
        view.on ? `border-l-2 ${hueBorder[hue]}` : undefined,
      )}
    >
      <div className="flex items-center gap-space-sm">
        <div
          className={StringUtils.JoinClassName(
            "flex h-11 w-11 min-w-11 items-center justify-center rounded-lg bg-surface-container-lowest",
            hueText[hue],
          )}
        >
          <Icon size={22} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-space-xs">
            <span className="truncate font-sans text-title-md font-semibold text-on-surface">{entity.name}</span>
            {(view.on || view.unavailable) && (
              <span
                aria-hidden="true"
                className={StringUtils.JoinClassName(
                  "h-2 w-2 shrink-0 rounded-full",
                  view.unavailable ? "bg-error" : beaconTone[hue],
                )}
              />
            )}
          </div>
          <span className="block truncate font-mono text-label-caps uppercase text-on-surface-variant">
            {`${areaName} // ${entity.entityId}`}
          </span>
        </div>
      </div>
      <p
        className={StringUtils.JoinClassName(
          "font-mono text-telemetry-md",
          view.unavailable ? "text-error" : view.on ? hueText[hue] : "text-on-surface-variant",
        )}
      >
        {view.text}
      </p>
    </article>
  );
}
