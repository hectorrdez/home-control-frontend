import { useId } from "react";
import { Link } from "react-router-dom";
import StringUtils from "@utils/StringUtils";
import StatusChip from "@components/controls/StatusChip";
import type { DeviceRow as Row } from "@/features/devices/deviceFilters";
import { devicePath } from "@/pages/routePaths";
import { describeState, domainHue, domainIcon, type Hue } from "./deviceState";

// Feature 121: one device in the /devices list. The whole row is the link to the detail page; no controls here.
const hueText: Record<Hue, string> = {
  primary: "text-primary-container",
  secondary: "text-secondary",
  tertiary: "text-tertiary-fixed-dim",
};

export default function DeviceRow({ row }: { row: Row }) {
  const metaId = useId();
  const { entity, label, areaName } = row;
  const Icon = domainIcon(entity.domain);
  const hue = domainHue(entity.domain);
  const view = describeState(entity);

  return (
    <Link
      to={devicePath(entity.entityId)}
      aria-label={label}
      aria-describedby={metaId}
      className="flex min-h-11 items-center gap-space-sm rounded-xl border border-outline-variant/30 bg-surface-container p-space-sm transition-colors duration-150 hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container"
    >
      <div
        className={StringUtils.JoinClassName(
          "flex h-11 w-11 min-w-11 items-center justify-center rounded-lg bg-surface-container-lowest",
          view.on ? hueText[hue] : "text-on-surface-variant",
        )}
      >
        <Icon size={22} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate font-sans text-title-md font-semibold text-on-surface">{label}</span>
        <span id={metaId} className="block truncate font-mono text-label-caps uppercase text-on-surface-variant">
          {`${areaName} // ${entity.entityId}`}
        </span>
      </div>
      {view.unavailable ? (
        <StatusChip tone="error">UNAVAILABLE</StatusChip>
      ) : (
        <span
          className={StringUtils.JoinClassName(
            "shrink-0 font-mono text-telemetry-md",
            view.on ? hueText[hue] : "text-on-surface-variant",
          )}
        >
          {view.text}
        </span>
      )}
    </Link>
  );
}
